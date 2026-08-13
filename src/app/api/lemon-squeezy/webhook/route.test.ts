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
  currentPlan?: "free" | "pro";
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const seenKeys = new Set<string>();
  const upserts: Record<string, unknown>[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const fake = {
    seenKeys,
    upserts,
    inserts,
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          if (table === "subscription_events") {
            const key = String(row.ls_event_id);
            if (seenKeys.has(key)) {
              return { data: null, error: { code: "23505", message: "duplicate" } };
            }
            seenKeys.add(key);
          }
          return { data: [row], error: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { data: [row], error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { plan: opts.currentPlan ?? "free" },
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
  updatedAt?: string;
  endsAt?: string | null;
  renewsAt?: string | null;
  customUserId?: string | null;
}

function subscriptionEvent(
  eventName: string,
  overrides: SubEventOverrides = {},
): Record<string, unknown> {
  const customData =
    overrides.customUserId === null
      ? {}
      : { user_id: overrides.customUserId ?? USER_ID, interval: "month" };
  return {
    meta: { event_name: eventName, custom_data: customData },
    data: {
      id: overrides.id ?? "777001",
      type: overrides.type ?? "subscriptions",
      attributes: {
        customer_id: 99001,
        user_email: "buyer@example.com",
        status: overrides.status ?? "active",
        renews_at: overrides.renewsAt ?? null,
        ends_at: overrides.endsAt ?? null,
        cancelled: false,
        variant_id:
          overrides.variant === undefined ? Number(PRO_VARIANT) : overrides.variant,
        updated_at: overrides.updatedAt ?? "2026-01-01T00:00:00.000000Z",
      },
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
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({
      plan: "pro",
      subscription_status: "active",
      variant_id: PRO_VARIANT,
    });
  });

  it("TEST 2 — exact duplicate delivery is idempotent", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const payload = subscriptionEvent("subscription_created");

    expect((await deliver(payload)).status).toBe(200);
    expect((await deliver(payload)).status).toBe(200);

    expect(fake.upserts).toHaveLength(1);
    // Both deliveries were logged; the second hit the unique constraint.
    expect(fake.inserts).toHaveLength(2);
  });

  it("TEST 3 — two subscription_updated events for the same subscription both process; exact duplicates do not", async () => {
    const fake = mockSupabase(makeFakeSupabase());

    // Event A: subscription goes active.
    const active = subscriptionEvent("subscription_updated", {
      status: "active",
      updatedAt: "2026-01-01T00:00:00.000000Z",
    });
    // Event B: same subscription is later cancelled (different occurrence).
    const cancelled = subscriptionEvent("subscription_updated", {
      status: "cancelled",
      updatedAt: "2026-01-02T00:00:00.000000Z",
      endsAt: "2026-01-12T00:00:00.000000Z",
    });

    expect((await deliver(active)).status).toBe(200);
    expect((await deliver(cancelled)).status).toBe(200);

    // Both legitimate events MUST have been processed.
    expect(fake.upserts).toHaveLength(2);
    const last = fake.upserts[1];
    expect(last.plan).toBe("pro");
    expect(last.subscription_status).toBe("cancelled");
    expect(last.cancel_at_period_end).toBe(true);

    // An exact duplicate delivery of event B must NOT process twice.
    expect((await deliver(cancelled)).status).toBe(200);
    expect(fake.upserts).toHaveLength(2);
  });

  it("TEST 4 — a different (non-Pro) variant is rejected and never grants Pro", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created", { variant: 999 }),
    );

    expect(res.status).toBe(200);
    expect(fake.upserts).toHaveLength(0);
    // The delivery is still audited for diagnostics.
    expect(fake.inserts).toHaveLength(1);
  });

  it("TEST 5 — the configured Pro variant grants Pro (monthly and yearly)", async () => {
    const monthlyFake = mockSupabase(makeFakeSupabase());
    expect((await deliver(subscriptionEvent("subscription_created"))).status).toBe(200);
    expect(monthlyFake.upserts[0]).toMatchObject({ plan: "pro" });

    const yearlyFake = mockSupabase(makeFakeSupabase());
    expect(
      (await deliver(
        subscriptionEvent("subscription_created", { variant: Number(YEARLY_VARIANT) }),
      )).status,
    ).toBe(200);
    expect(yearlyFake.upserts[0]).toMatchObject({ plan: "pro" });
  });

  it("TEST 6 — an invalid HMAC signature is rejected before any mutation", async () => {
    const fake = mockSupabase(makeFakeSupabase());
    const res = await deliver(
      subscriptionEvent("subscription_created"),
      "deadbeef-invalid-signature",
    );

    expect(res.status).toBe(401);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.upserts).toHaveLength(0);
  });

  it("TEST 7 — a missing or unknown user association never grants Pro", async () => {
    // No user_id in custom_data at all.
    const noUserFake = mockSupabase(makeFakeSupabase());
    const res1 = await deliver(
      subscriptionEvent("subscription_created", { customUserId: null }),
    );
    expect(res1.status).toBe(200);
    expect(noUserFake.upserts).toHaveLength(0);

    // user_id present but the account no longer exists.
    const ghostFake = mockSupabase(makeFakeSupabase({ knownUser: false }));
    const res2 = await deliver(subscriptionEvent("subscription_created"));
    expect(res2.status).toBe(200);
    expect(ghostFake.upserts).toHaveLength(0);
  });
});