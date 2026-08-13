import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/subscription-emails", () => ({
  sendSubscriptionEmail: vi.fn(async () => {}),
}));

const SECRET = "test-webhook-secret";
const PRO_VARIANT = "456";
const YEARLY_VARIANT = "789";
const USER_ID = "11111111-1111-4111-8111-111111111111";

interface FakeOptions {
  knownUser?: boolean;
  // Existing user_credits row; null (default) means no row yet.
  credits?: Record<string, unknown> | null;
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const seenKeys = new Set<string>();
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown> }[] = [];
  let credits: Record<string, unknown> | null = opts.credits ?? null;
  const fake = {
    seenKeys,
    inserts,
    updates,
    credits() {
      return credits;
    },
    from(table: string) {
      return {
        insert: (row: Record<string, unknown>) => {
          if (table === "subscription_events") {
            return (async () => {
              inserts.push({ table, row });
              const key = String(row.ls_event_id);
              if (seenKeys.has(key)) {
                return { data: null, error: { code: "23505", message: "duplicate" } };
              }
              seenKeys.add(key);
              return { data: [row], error: null };
            })();
          }
          return { data: null, error: null };
        },
        upsert: (row: Record<string, unknown>) => ({
          select: async () => {
            // insert-if-absent (onConflict + ignoreDuplicates): no-op when a
            // row already exists (the guarded update already failed above).
            if (credits !== null) {
              return { data: [], error: null };
            }
            credits = { ...row };
            return { data: [{ user_id: row.user_id }], error: null };
          },
        }),
        update: (row: Record<string, unknown>) => {
          const filters: string[] = [];
          const builder = {
            eq: () => builder,
            or: (cond: string) => {
              filters.push(cond);
              return builder;
            },
            select: async () => {
              // Apply only when the row exists and the compare-and-set guard
              // passes: ls_updated_at is null, or recorded <= incoming event.
              const guard = filters[0] ?? "";
              const lteMatch = guard.match(/ls_updated_at\.lte\.(.+)$/);
              let pass = false;
              if (credits !== null) {
                const stored = credits.ls_updated_at ?? null;
                if (stored == null) {
                  pass = guard.includes("ls_updated_at.is.null");
                } else if (lteMatch) {
                  pass = stored <= lteMatch[1];
                }
              }
              if (pass) {
                credits = { ...credits, ...row };
                updates.push({ table, row });
                return { data: [{ user_id: row.user_id }], error: null };
              }
              return { data: [], error: null };
            },
          };
          return builder;
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: credits ?? null,
              error: null,
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            select: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
    auth: {
      admin: {
        getUserById: async (id: string) =>
          opts.knownUser === false
            ? { data: { user: null }, error: { message: "not found" } }
            : { data: { user: { id } }, error: null },
      },
    },
  };
  return fake;
}

function mockSupabase(fake: ReturnType<typeof makeFakeSupabase>) {
  vi.mocked(createClient).mockReturnValue(
    fake as unknown as ReturnType<typeof createClient>,
  );
  return fake;
}

interface SubEventOverrides {
  id?: string;
  type?: string;
  status?: string;
  variant?: number | null;
  updatedAt?: string | null;
  endsAt?: string | null;
  renewsAt?: string | null;
  customUserId?: string | null;
  testMode?: boolean;
  orderItemVariant?: number | null;
}

function subscriptionEvent(
  eventName: string,
  overrides: SubEventOverrides = {},
): Record<string, unknown> {
  const customData =
    overrides.customUserId === null
      ? {}
      : { user_id: overrides.customUserId ?? USER_ID, interval: "month" };
  const meta: Record<string, unknown> = {
    event_name: eventName,
    custom_data: customData,
  };
  if (overrides.testMode === true) meta.test_mode = true;
  const attributes: Record<string, unknown> = {
    customer_id: 99001,
    user_email: "buyer@example.com",
    status: overrides.status ?? "active",
    renews_at: overrides.renewsAt ?? null,
    ends_at: overrides.endsAt ?? null,
    cancelled: false,
  };
  if (overrides.updatedAt !== null) {
    attributes.updated_at = overrides.updatedAt ?? "2026-01-01T00:00:00.000000Z";
  }
  if (overrides.orderItemVariant !== undefined && overrides.type === "orders") {
    attributes.first_order_item = { variant_id: overrides.orderItemVariant };
  } else {
    attributes.variant_id =
      overrides.variant === undefined ? Number(PRO_VARIANT) : overrides.variant;
  }
  return {
    meta,
    data: {
      id: overrides.id ?? "777001",
      type: overrides.type ?? "subscriptions",
      attributes,
    },
  };
}

async function deliver(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const sig =
    signature ??
    createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
  const request = new NextRequest(
    "http://localhost/api/lemon-squeezy/webhook",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body,
    },
  );
  return POST(request);
}

beforeEach(() => {
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("LEMONSQUEEZY_PRO_VARIANT_ID", PRO_VARIANT);
  vi.stubEnv("LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", YEARLY_VARIANT);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Lemon Squeezy webhook", () => {
  it("TEST 1 — first event processes successfully and grants Pro", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(subscriptionEvent("subscription_created"));

    expect(res.status).toBe(200);
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "active",
      variant_id: PRO_VARIANT,
      ls_updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("TEST 2 — exact duplicate delivery is idempotent", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const payload = subscriptionEvent("subscription_created");

    expect((await deliver(payload)).status).toBe(200);
    expect((await deliver(payload)).status).toBe(200);

    // One plan write total; both deliveries were audited, the second hit the
    // unique constraint.
    expect(fake.credits()).toMatchObject({ plan: "pro" });
    expect(fake.inserts).toHaveLength(2);
  });

  it("TEST 3 — two subscription_updated events for the same subscription both process; exact duplicates do not", async () => {
    const fake = mockSupabase(makeFakeSupabase());

    const active = subscriptionEvent("subscription_updated", {
      status: "active",
      updatedAt: "2026-01-01T00:00:00.000000Z",
    });
    const cancelled = subscriptionEvent("subscription_updated", {
      status: "cancelled",
      updatedAt: "2026-01-02T00:00:00.000000Z",
      endsAt: "2026-01-12T00:00:00.000000Z",
    });

    expect((await deliver(active)).status).toBe(200);
    expect((await deliver(cancelled)).status).toBe(200);

    // Event A created the row (insert); event B is newer and applied via the
    // guarded update.
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "cancelled",
      cancel_at_period_end: true,
    });

    // An exact duplicate delivery of event B must NOT process twice.
    expect((await deliver(cancelled)).status).toBe(200);
    expect(fake.updates).toHaveLength(1);
  });

  it("TEST 4 — a different (non-Pro) variant is rejected and never grants Pro", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created", { variant: 999 }),
    );

    expect(res.status).toBe(200);
    expect(fake.credits()).toBeNull();
    expect(fake.updates).toHaveLength(0);
    // The delivery is still audited for diagnostics.
    expect(fake.inserts).toHaveLength(1);
  });

  it("TEST 5 — the configured Pro variant grants Pro (monthly and yearly)", async () => {
    const monthlyFake = mockSupabase(makeFakeSupabase());
    expect((await deliver(subscriptionEvent("subscription_created"))).status).toBe(200);
    expect(monthlyFake.credits()).toMatchObject({ plan: "pro" });

    const yearlyFake = mockSupabase(makeFakeSupabase());
    expect(
      (await deliver(
        subscriptionEvent("subscription_created", { variant: Number(YEARLY_VARIANT) }),
      )).status,
    ).toBe(200);
    expect(yearlyFake.credits()).toMatchObject({ plan: "pro" });
  });

  it("TEST 6 — an invalid HMAC signature is rejected before any mutation", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created"),
      "deadbeef-invalid-signature",
    );

    expect(res.status).toBe(401);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.credits()).toBeNull();
  });

  it("TEST 7 — a missing or unknown user association never grants Pro", async () => {
    const noUserFake = mockSupabase(makeFakeSupabase());
    const res1 = await deliver(
      subscriptionEvent("subscription_created", { customUserId: null }),
    );
    expect(res1.status).toBe(200);
    expect(noUserFake.credits()).toBeNull();

    const ghostFake = mockSupabase(makeFakeSupabase({ knownUser: false }));
    const res2 = await deliver(subscriptionEvent("subscription_created"));
    expect(res2.status).toBe(200);
    expect(ghostFake.credits()).toBeNull();
  });

  it("TEST 8 — a test_mode event is rejected in production: no plan change, audited", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created", { testMode: true }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      received: true,
      ignored: "test_mode",
    });
    expect(fake.credits()).toBeNull();
    expect(fake.inserts).toHaveLength(1);
    const audit = fake.inserts[0];
    expect(audit.table).toBe("subscription_events");
    expect(String(audit.row.ls_event_id).startsWith("test:")).toBe(true);
    expect(audit.row.event_name).toBe("subscription_created");
  });

  it("TEST 9 — a duplicate test_mode rejection does not double-audit", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const payload = subscriptionEvent("subscription_created", { testMode: true });

    expect((await deliver(payload)).status).toBe(200);
    expect((await deliver(payload)).status).toBe(200);
    expect(fake.inserts).toHaveLength(2);
    expect(fake.seenKeys.size).toBe(1);
    expect(Array.from(fake.seenKeys)[0].startsWith("test:")).toBe(true);
    expect(fake.credits()).toBeNull();
  });

  it("TEST 10 — test_mode events are processed when LEMONSQUEEZY_ALLOW_TEST_MODE=true (local dev)", async () => {
    vi.stubEnv("LEMONSQUEEZY_ALLOW_TEST_MODE", "true");
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created", { testMode: true }),
    );

    expect(res.status).toBe(200);
    expect(fake.credits()).toMatchObject({ plan: "pro" });
  });

  it("TEST 11 — events without a test_mode flag are unaffected", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const payload = subscriptionEvent("subscription_created");
    expect("test_mode" in (payload.meta as Record<string, unknown>)).toBe(false);

    const res = await deliver(payload);
    expect(res.status).toBe(200);
    expect(fake.credits()).toMatchObject({ plan: "pro" });
  });

  it("TEST 12 — P1-A: a newer event applies over older recorded state", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "cancelled",
          cancel_at_period_end: true,
          ends_at: "2026-01-12T00:00:00.000Z",
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("subscription_updated", {
        status: "active",
        updatedAt: "2026-01-03T00:00:00.000000Z",
      }),
    );

    expect(res.status).toBe(200);
    expect(fake.updates).toHaveLength(1);
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "active",
      cancel_at_period_end: false,
    });
  });

  it("TEST 13 — P1-A: an older delayed event cannot overwrite newer state", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "cancelled",
          cancel_at_period_end: true,
          ends_at: "2026-01-12T00:00:00.000Z",
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("subscription_updated", {
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000000Z",
      }),
    );

    expect(res.status).toBe(200);
    // No write happened: the newer recorded state must survive.
    expect(fake.updates).toHaveLength(0);
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "cancelled",
      cancel_at_period_end: true,
      ends_at: "2026-01-12T00:00:00.000Z",
    });
  });

  it("TEST 14 — P1-B: a non-Pro variant refund can never revoke Pro", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "active",
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("order_refunded", {
        type: "orders",
        variant: 999,
        updatedAt: "2026-01-03T00:00:00.000000Z",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      received: true,
      ignored: "variant",
    });
    expect(fake.updates).toHaveLength(0);
    expect(fake.credits()).toMatchObject({ plan: "pro" });
  });

  it("TEST 15 — P1-B: a valid Pro-variant revocation still downgrades", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "active",
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("subscription_expired", {
        status: "expired",
        updatedAt: "2026-01-03T00:00:00.000000Z",
      }),
    );

    expect(res.status).toBe(200);
    expect(fake.updates).toHaveLength(1);
    expect(fake.credits()).toMatchObject({
      plan: "free",
      subscription_status: "expired",
      variant_id: PRO_VARIANT,
    });
  });

  it("TEST 16 — P1-B: a revoke event with no variant identity fails safe", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "active",
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("subscription_paused", {
        status: "paused",
        variant: null,
        updatedAt: "2026-01-03T00:00:00.000000Z",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      received: true,
      ignored: "variant",
    });
    expect(fake.updates).toHaveLength(0);
    expect(fake.credits()).toMatchObject({ plan: "pro" });
  });

  it("TEST 17 — P1-A: a first event without a timestamp still applies (fail-safe)", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created", { updatedAt: null }),
    );

    expect(res.status).toBe(200);
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "active",
    });
    // No authoritative timestamp was recorded, so future timestamped events
    // can still order themselves against it.
    expect(fake.credits()?.ls_updated_at).toBeUndefined();
  });

  it("TEST 18 — P1-A: a timestamp-less event cannot overwrite recorded state", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        credits: {
          user_id: USER_ID,
          plan: "pro",
          subscription_status: "cancelled",
          cancel_at_period_end: true,
          ls_updated_at: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    const res = await deliver(
      subscriptionEvent("subscription_updated", {
        status: "active",
        updatedAt: null,
      }),
    );

    expect(res.status).toBe(200);
    expect(fake.updates).toHaveLength(0);
    expect(fake.credits()).toMatchObject({
      plan: "pro",
      subscription_status: "cancelled",
      cancel_at_period_end: true,
    });
  });
});
