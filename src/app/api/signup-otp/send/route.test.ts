import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";
import { generateOtpCode, sendOtpEmail } from "@/lib/otp";
import { hashIp } from "@/lib/client-ip";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/otp", () => ({
  generateOtpCode: vi.fn(() => "123456"),
  hashOtpCode: vi.fn(() => "hash123"),
  sendOtpEmail: vi.fn(async () => {}),
}));

interface FakeOptions {
  rateLimitResults?: Record<string, boolean>;
  listUsersPages?: { email: string }[][];
  listUsersError?: unknown;
  upsertError?: unknown;
}

interface FakeSupabase {
  calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    upserts: Record<string, unknown>[];
    listUsers: { page: number; perPage: number }[];
    deletes: string[];
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => unknown;
  auth: { admin: { listUsers: (params: { page: number; perPage: number }) => Promise<unknown> } };
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    upserts: Record<string, unknown>[];
    listUsers: { page: number; perPage: number }[];
    deletes: string[];
  } = { rpc: [], upserts: [], listUsers: [], deletes: [] };
  const fake = {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (fn === "rate_limit_take") {
        const key = String(args.p_key);
        return { data: opts.rateLimitResults?.[key] ?? true, error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      void table;
      return {
        upsert: async (row: Record<string, unknown>) => {
          calls.upserts.push(row);
          return { data: row, error: opts.upsertError ?? null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, val: string) => {
            calls.deletes.push(val);
            return {};
          },
        }),
      };
    },
    auth: {
      admin: {
        listUsers: async (params: { page: number; perPage: number }) => {
          calls.listUsers.push(params);
          if (opts.listUsersError) return { data: null, error: opts.listUsersError };
          const page = (opts.listUsersPages ?? [])[params.page - 1] ?? [];
          return { data: { users: page }, error: null };
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

function sendRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/signup-otp/send", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const NEW_EMAIL = "newuser@example.com";
const PAYLOAD = { email: NEW_EMAIL, password: "password123" };
const XFF = { "x-forwarded-for": "203.0.113.5" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("signup-otp send", () => {
  it("TEST A1 — new email: 200, OTP stored, code emailed, paginated lookup used", async () => {
    const fake = mockSupabase(makeFakeSupabase({ listUsersPages: [[]] }));
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fake.calls.listUsers).toHaveLength(1);
    expect(fake.calls.listUsers[0]).toEqual({ page: 1, perPage: 1000 });
    expect(fake.calls.upserts).toHaveLength(1);
    expect(fake.calls.upserts[0]).toMatchObject({
      email: NEW_EMAIL,
      code_hash: "hash123",
      attempts: 0,
    });
    expect(sendOtpEmail).toHaveBeenCalledWith(NEW_EMAIL, "123456");
    expect(generateOtpCode).toHaveBeenCalledTimes(1);
  });

  it("TEST A2 — existing email: indistinguishable 200, no OTP stored, no email sent", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({ listUsersPages: [[{ email: NEW_EMAIL }]] }),
    );
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fake.calls.upserts).toHaveLength(0);
    expect(sendOtpEmail).not.toHaveBeenCalled();
  });

  it("TEST A3 — email found beyond page 1: lookup stops at the matching page (no full scan)", async () => {
    const fillers = Array.from({ length: 1000 }, (_, i) => ({ email: `user${i}@example.com` }));
    const fake = mockSupabase(
      makeFakeSupabase({ listUsersPages: [fillers, [{ email: NEW_EMAIL }]] }),
    );
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    expect(fake.calls.listUsers).toHaveLength(2);
    expect(fake.calls.listUsers.map((p) => p.page)).toEqual([1, 2]);
    expect(fake.calls.upserts).toHaveLength(0);
  });

  it("TEST A4 — account enumeration: responses are byte-identical for existing vs new email", async () => {
    mockSupabase(makeFakeSupabase({ listUsersPages: [[{ email: NEW_EMAIL }]] }));
    const existing = await POST(sendRequest(PAYLOAD, XFF));

    mockSupabase(makeFakeSupabase({ listUsersPages: [[]] }));
    const fresh = await POST(sendRequest(PAYLOAD, XFF));

    expect(existing.status).toBe(fresh.status);
    await expect(existing.json()).resolves.toEqual(await fresh.json());
  });

  it("TEST A5 — email bucket exhausted: 429, no OTP stored", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        listUsersPages: [[]],
        rateLimitResults: { [`email:${NEW_EMAIL}`]: false },
      }),
    );
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    expect(fake.calls.upserts).toHaveLength(0);
  });

  it("TEST A6 — IP bucket exhausted: 429", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        listUsersPages: [[]],
        rateLimitResults: { [`ip:${hashIp("203.0.113.5")}`]: false },
      }),
    );
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    // Only hashed IPs are ever used as bucket keys.
    const keys = fake.calls.rpc
      .filter((c) => c.fn === "rate_limit_take")
      .map((c) => String(c.args.p_key));
    expect(keys.some((k) => k.startsWith("ip:") && !k.includes("203.0.113.5"))).toBe(true);
    expect(keys.some((k) => k === "ip:203.0.113.5")).toBe(false);
  });

  it("TEST A7 — global bucket exhausted: 429", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        listUsersPages: [[]],
        rateLimitResults: { "global:signup-send": false },
      }),
    );
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(429);
    expect(fake.calls.upserts).toHaveLength(0);
  });

  it("TEST A8 — rate-limit RPC failure fails open (signups are not locked out)", async () => {
    const fake = mockSupabase(makeFakeSupabase({ listUsersPages: [[]] }));
    fake.rpc = async () => ({ data: null, error: new Error("boom") });
    const res = await POST(sendRequest(PAYLOAD, XFF));

    expect(res.status).toBe(200);
    expect(fake.calls.upserts).toHaveLength(1);
  });

  it("TEST A9 — invalid email / short password rejected before any side effects", async () => {
    const fake = mockSupabase(makeFakeSupabase({ listUsersPages: [[]] }));
    expect((await POST(sendRequest({ email: "nope", password: "password123" }))).status).toBe(400);
    expect((await POST(sendRequest({ email: NEW_EMAIL, password: "short" }))).status).toBe(400);
    expect(fake.calls.rpc).toHaveLength(0);
    expect(fake.calls.listUsers).toHaveLength(0);
  });
});
