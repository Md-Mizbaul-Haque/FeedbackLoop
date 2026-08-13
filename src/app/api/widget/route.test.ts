import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GET } from "./route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

interface FakeOptions {
  rateLimitResults?: Record<string, boolean>;
  rateLimitError?: unknown;
  denyIpKey?: boolean;
  maybeSingleResult?: unknown;
  maybeSingleError?: unknown;
}

interface FakeWidgetSupabase {
  calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    maybeSingle: { widgetId: string | null; widgetIds: string[] }[];
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => unknown;
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const calls: {
    rpc: { fn: string; args: Record<string, unknown> }[];
    maybeSingle: { widgetId: string | null; widgetIds: string[] }[];
  } = { rpc: [], maybeSingle: [] };
  const fake = {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (fn === "rate_limit_take") {
        if (opts.rateLimitError) return { data: null, error: opts.rateLimitError };
        const key = String(args.p_key);
        if (opts.denyIpKey && key.startsWith("widget:ip:")) {
          return { data: false, error: null };
        }
        return { data: opts.rateLimitResults?.[key] ?? true, error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      void table;
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            calls.maybeSingle.push({ widgetId: value, widgetIds: [value] });
            return {
              maybeSingle: async () => ({
                data: opts.maybeSingleResult ?? null,
                error: opts.maybeSingleError ?? null,
              }),
            };
          },
        }),
      };
    },
  };
  return fake as unknown as FakeWidgetSupabase;
}

function mockSupabase(fake: FakeWidgetSupabase) {
  vi.mocked(createClient).mockReturnValue(fake as never);
  return fake;
}

function widgetRequest(
  widgetId: string | null,
  headers: Record<string, string> = {},
) {
  const url = new URL("http://localhost/api/widget");
  if (widgetId !== null) url.searchParams.set("widget_id", widgetId);
  return new NextRequest(url, { headers: { "x-forwarded-for": "203.0.113.5", ...headers } });
}

const SUMMARY = {
  title: "Great product",
  reviews_count: 12,
  keywords: [],
  positive_sentiment_pct: 90,
  average_rating: 4.6,
  analysis: null,
  created_at: "2026-08-13T00:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("widget GET", () => {
  it("TEST W1 — missing widget_id returns 400", async () => {
    const res = await GET(widgetRequest(null));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing widget_id parameter." });
  });

  it("TEST W2 — backend not configured returns 500", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const res = await GET(widgetRequest("abc"));
    expect(res.status).toBe(500);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("TEST W3 — found summary: 200, CORS + cache headers, rate-limit keys hashed", async () => {
    const fake = mockSupabase(makeFakeSupabase({ maybeSingleResult: SUMMARY }));
    const res = await GET(widgetRequest("abc"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SUMMARY);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");

    const rpcCalls = fake.calls.rpc;
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0].args.p_key).toBe("widget:global");
    const ipKey = String(rpcCalls[1].args.p_key);
    expect(ipKey.startsWith("widget:ip:")).toBe(true);
    // The hashed key must never contain the raw IP.
    expect(ipKey).not.toContain("203.0.113.5");
    expect(rpcCalls[1].args.p_limit).toBe(60);
    expect(fake.calls.maybeSingle[0].widgetId).toBe("abc");
  });

  it("TEST W4 — unknown widget_id returns 404", async () => {
    mockSupabase(makeFakeSupabase({ maybeSingleResult: null }));
    const res = await GET(widgetRequest("missing"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Summary not found." });
  });

  it("TEST W5 — database error returns 500 without leaking details", async () => {
    mockSupabase(makeFakeSupabase({ maybeSingleError: { message: "boom" } }));
    const res = await GET(widgetRequest("abc"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load summary." });
  });

  it("TEST W6 — rate limited: 429 with Retry-After and no bucket keys", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        denyIpKey: true,
        maybeSingleResult: SUMMARY,
      }),
    );
    const res = await GET(widgetRequest("abc"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.text();
    expect(body).not.toContain("widget:ip:");
    expect(body).not.toContain("hashed");
    // No summary data is served when rate limited.
    expect(body).toContain("Too many requests.");
    // The summary query must not run once a bucket is exhausted.
    expect(fake.calls.maybeSingle).toHaveLength(0);
  });

  it("TEST W7 — rate-limit RPC failure fails open (widget stays up)", async () => {
    mockSupabase(
      makeFakeSupabase({ rateLimitError: { message: "rpc down" }, maybeSingleResult: SUMMARY }),
    );
    const res = await GET(widgetRequest("abc"));
    expect(res.status).toBe(200);
  });

  it("TEST W8 — global bucket exhausted: 429 even when the IP bucket allows", async () => {
    const fake = mockSupabase(
      makeFakeSupabase({
        rateLimitResults: { "widget:global": false },
        maybeSingleResult: SUMMARY,
      }),
    );
    const res = await GET(widgetRequest("abc"));
    expect(res.status).toBe(429);
    expect(fake.calls.maybeSingle).toHaveLength(0);
  });
});
