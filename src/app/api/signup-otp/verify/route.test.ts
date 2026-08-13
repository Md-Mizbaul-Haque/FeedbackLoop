import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";
import { verifyOtpCode } from "@/lib/otp";
import { hashIp } from "@/lib/client-ip";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/otp", () => ({
  verifyOtpCode: vi.fn(() => true),
}));

interface FakeOptions {
  row?: Record<string, unknown> | null;
  rateLimitAllowed?: boolean;
  rateLimitError?: unknown;
  createUserError?: { code?: string; message: string } | null;
}

interface FakeSupabase {
  calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    updates: Record<string, unknown>[];
    deletes: string[];
    createUser: { email: string; password: string; email_confirm: boolean }[];
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => unknown;
  auth: { admin: { createUser: (args: unknown) => Promise<unknown> } };
}

function futureRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "newuser@example.com",
    code_hash: "hash123",
    attempts: 0,
    send_count: 1,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    updates: Record<string, unknown>[];
    deletes: string[];
    createUser: { email: string; password: string; email_confirm: boolean }[];
  } = { rpc: [], updates: [], deletes: [], createUser: [] };
  const fake = {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (opts.rateLimitError) return { data: null, error: opts.rateLimitError };
      return { data: opts.rateLimitAllowed ?? true, error: null };
    },
    from(table: string) {
      void table;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (col: string, val: string) => {
            void col;
            void val;
            calls.updates.push(patch);
            return {};
          },
        }),
        delete: () => ({
          eq: (col: string, val: string) => {
            void col;
            calls.deletes.push(val);
            return {};
          },
        }),
      };
    },
    auth: {
      admin: {
        createUser: async (args: { email: string; password: string; email_confirm: boolean }) => {
          calls.createUser.push(args);
          return { data: { user: { id: "u1" } }, error: opts.createUserError ?? null };
        },
      },
    },
  };
  return fake as unknown as FakeSupabase;
}

function mockSupabase(fake: FakeSupabase) {
  vi.mocked(createClient).mockReturnValue(fake as never);
  return fake;
}

function verifyRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/signup-otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const PAYLOAD = {
  email: "newuser@example.com",
  code: "123456",
  password: "password123",
};
const XFF = { "x-forwarded-for": "203.0.113.5" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("signup-otp verify", () => {
  it("TEST B1 — correct code: user created, verification row deleted, 200", async () => {
    const fake = mockSupabase(makeFakeSupabase({ row: futureRow() }));
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fake.calls.createUser).toHaveLength(1);
    expect(fake.calls.createUser[0]).toMatchObject({
      email: "newuser@example.com",
      password: "password123",
      email_confirm: true,
    });
    expect(fake.calls.deletes).toEqual(["newuser@example.com"]);
  });

  it("TEST B2 — wrong code: 400, attempts incremented, no user created", async () => {
    vi.mocked(verifyOtpCode).mockReturnValueOnce(false);
    const fake = mockSupabase(makeFakeSupabase({ row: futureRow() }));
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(400);
    expect(fake.calls.updates).toEqual([{ attempts: 1 }]);
    expect(fake.calls.createUser).toHaveLength(0);
  });

  it("TEST B3 — fifth wrong attempt: 429", async () => {
    vi.mocked(verifyOtpCode).mockReturnValueOnce(false);
    const fake = mockSupabase(makeFakeSupabase({ row: futureRow({ attempts: 4 }) }));
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    expect(fake.calls.updates).toEqual([{ attempts: 5 }]);
    expect(fake.calls.createUser).toHaveLength(0);
  });

  it("TEST B4 — attempts already exhausted: 429 without verifying", async () => {
    mockSupabase(makeFakeSupabase({ row: futureRow({ attempts: 5 }) }));
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    expect(verifyOtpCode).not.toHaveBeenCalled();
  });

  it("TEST B5 — expired code: 400", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({ row: futureRow({ expires_at: new Date(Date.now() - 60_000).toISOString() }) }),
    );
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(400);
    expect(verifyOtpCode).not.toHaveBeenCalled();
    expect(fake.calls.createUser).toHaveLength(0);
  });

  it("TEST B6 — no verification row: 400", async () => {
    const fake = mockSupabase(makeFakeSupabase({ row: null }));
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(400);
    expect(fake.calls.createUser).toHaveLength(0);
  });

  it("TEST B7 — createUser 'already exists': 409 with generic wording (no enumeration hint)", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        row: futureRow(),
        createUserError: { code: "user_already_exists", message: "A user with this email already exists" },
      }),
    );
    const res = await POST(verifyRequest(PAYLOAD, XFF));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(/already|exist/i.test(body.error)).toBe(false);
    expect(fake.calls.createUser).toHaveLength(1);
  });

  it("TEST B8 — IP bucket exhausted: 429 before any verification work", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({ row: futureRow(), rateLimitAllowed: false }),
    );
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    expect(verifyOtpCode).not.toHaveBeenCalled();
    expect(fake.calls.createUser).toHaveLength(0);
    const key = String(fake.calls.rpc[0].args.p_key);
    expect(key).toBe(`ip:${hashIp("203.0.113.5")}`);
    expect(key.includes("203.0.113.5")).toBe(false);
  });

  it("TEST B9 — rate-limit RPC failure fails open", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({ row: futureRow(), rateLimitError: new Error("boom") }),
    );
    const res = await POST(verifyRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    expect(fake.calls.createUser).toHaveLength(1);
  });

  it("TEST B10 — missing email/code or short password rejected before any side effects", async () => {
    const fake = mockSupabase(makeFakeSupabase({ row: futureRow() }));
    expect((await POST(verifyRequest({ email: "a@b.co", password: "password123" }))).status).toBe(400);
    expect((await POST(verifyRequest({ email: "", code: "123456", password: "password123" }))).status).toBe(400);
    expect((await POST(verifyRequest({ email: "a@b.co", code: "123456", password: "short" }))).status).toBe(400);
    expect(fake.calls.rpc).toHaveLength(0);
  });
});
