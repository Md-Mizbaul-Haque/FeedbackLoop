import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The edge function targets the Deno runtime: it calls Deno.env.get and
// Deno.serve at module scope (LLM_* config is read once at import time) and
// constructs its own supabase client. These tests stub the Deno globals and
// mock @supabase/supabase-js (resolved from the jsr: specifier via the vitest
// alias) so the real handler logic — quota reservation, the P1-D LLM timeout,
// refunds, and the legacy fallback — is executed, not re-implemented.

const shared = vi.hoisted(() => {
  const env = new Map<string, string>();
  const rpcLog: string[] = [];
  const fetchMocks: Array<
    (init?: { signal?: AbortSignal }) => Promise<Response>
  > = [];
  const fetchCalls = 0;
  const client: unknown = null;
  const serveHandler: ((req: Request) => Promise<Response>) | null = null;
  return { env, rpcLog, fetchMocks, fetchCalls, client, serveHandler };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => shared.client,
}));

(globalThis as Record<string, unknown>).Deno = {
  env: {
    get: (key: string) => shared.env.get(key) ?? "",
  },
  serve: (fn: unknown) => {
    shared.serveHandler = fn as (req: Request) => Promise<Response>;
  },
};

const USER_ID = "11111111-1111-4111-8111-111111111111";

const REVIEWS = [
  "The espresso was rich and perfectly pulled, arrived quickly.",
  "Service was friendly and the wifi worked great for working.",
  "Lovely quiet corner seats, though the music was a bit loud.",
  "Pastries were fresh and reasonably priced for the area.",
  "The barista remembered my usual order, which felt personal.",
  "Plenty of power outlets and the tables are not too cramped.",
  "Matcha latte was creamy and not overly sweet at all.",
  "Toilets were clean and the space feels well maintained.",
  "Great place to meet clients, coffee is consistently good.",
  "Parking nearby was easy and the entrance is accessible.",
];

function fakeClient(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    shared.rpcLog.push(fn);
    switch (fn) {
      case "get_user_plan":
        return { data: "free", error: null };
      case "get_quota_caps":
        return {
          data: [
            {
              free_limit: 10,
              pro_daily_limit: 50,
              pro_monthly_limit: 400,
              pro_concurrency_limit: 3,
            },
          ],
          error: null,
        };
      case "try_reserve_analysis_slot":
        return { data: "ok", error: null };
      case "release_analysis_slot":
        shared.rpcLog.push(`release_analysis_slot(${args?.p_failed})`);
        return { data: null, error: null };
      default:
        return { data: null, error: null };
    }
  });
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      })),
    },
    rpc,
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request("http://edge/analyze-summaries", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-jwt",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reviews: REVIEWS }),
  });
}

function richPayload(): Record<string, unknown> {
  return {
    title: "Coffee, atmosphere, and service are the standout themes",
    summary_points: [
      "Customers consistently praise coffee quality and speed of service.",
      "The atmosphere supports remote work, with wifi and outlets noted.",
      "Noise level is the most common negative theme.",
    ],
    keywords: [
      { label: "coffee", count: 4 },
      { label: "service", count: 2 },
    ],
    executive_summary:
      "Customers are broadly happy, highlighting coffee quality and a comfortable work-friendly atmosphere, with noise as the main drawback.",
    sentiment: {
      positive_pct: 70,
      neutral_pct: 20,
      negative_pct: 10,
      primary_issue: "Music can be a bit loud",
      interpretation: "Overall tone is positive, anchored on product quality.",
    },
    rating: { estimated: 4.3 },
    themes: [
      {
        name: "Coffee quality",
        sentiment: "positive",
        mentions: 4,
        severity: "high",
        explanation: "Customers mention rich espresso and consistent quality.",
      },
      {
        name: "Noise level",
        sentiment: "negative",
        mentions: 2,
        severity: "low",
        explanation: "Music is occasionally described as loud.",
      },
    ],
    impact: [
      {
        area: "Customer Experience",
        risk: "low",
        summary: "Positive sentiment may support repeat visits.",
      },
    ],
    recommendations: [
      {
        priority: 1,
        title: "Review background music volume",
        impact: "medium",
        actions: ["Lower music during peak hours"],
        why: "Noise was the only recurring negative theme.",
      },
    ],
    reviews: Array.from({ length: REVIEWS.length }, (_, i) => ({
      i,
      s: i % 2 === 0 ? "positive" : "neutral",
      t: [0],
    })),
  };
}

function legacyPayload(): Record<string, unknown> {
  return {
    title: "Customers enjoy the coffee and atmosphere",
    summary_points: [
      "Coffee quality is praised repeatedly.",
      "Good space for remote work.",
    ],
    keywords: [{ label: "coffee", count: 4 }],
    positive_sentiment_pct: 70,
    average_rating: 4.2,
  };
}

function jsonResponse(payload: unknown, ok = true): Response {
  return new Response(JSON.stringify(payload), {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

function chatCompletionResponse(payload: unknown): Response {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe("analyze-summaries edge function", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    shared.env.set("LLM_API_KEY", "test-key");
    await import("./index.ts");
    handler = shared.serveHandler!;
  });

  beforeEach(() => {
    shared.env.clear();
    shared.rpcLog.length = 0;
    shared.fetchMocks.length = 0;
    shared.fetchCalls = 0;
    shared.client = fakeClient();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        shared.fetchCalls += 1;
        const next = shared.fetchMocks.shift();
        return next ? next(init) : Promise.reject(new Error("unexpected fetch"));
      }),
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests without an Authorization header before any RPC", async () => {
    const res = await handler(
      new Request("http://edge/analyze-summaries", {
        method: "POST",
        body: JSON.stringify({ reviews: REVIEWS }),
      }),
    );
    expect(res.status).toBe(401);
    expect(shared.rpcLog).toEqual([]);
  });

  it("rejects garbage input with a 400 and never reserves a slot", async () => {
    const res = await handler(
      new Request("http://edge/analyze-summaries", {
        method: "POST",
        headers: { Authorization: "Bearer test-jwt" },
        body: JSON.stringify({ reviews: ["aaaa"] }),
      }),
    );
    expect(res.status).toBe(400);
    expect(shared.rpcLog).not.toContain("try_reserve_analysis_slot");
  });

  it("surfaces quota denials as 429 with error_code usage_limit_exceeded", async () => {
    shared.client = fakeClient({
      rpc: vi.fn(async (fn: string) => {
        shared.rpcLog.push(fn);
        if (fn === "try_reserve_analysis_slot") {
          return { data: "free_limit", error: null };
        }
        if (fn === "get_user_plan") return { data: "free", error: null };
        if (fn === "get_quota_caps") {
          return {
            data: [
              {
                free_limit: 10,
                pro_daily_limit: 50,
                pro_monthly_limit: 400,
                pro_concurrency_limit: 3,
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    });
    const res = await handler(makeRequest());
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe("usage_limit_exceeded");
    expect(shared.fetchCalls).toBe(0);
    expect(shared.rpcLog).not.toContain("release_analysis_slot");
  });

  it("P1-D: an LLM timeout aborts the request, refunds the slot, and skips the legacy fallback", async () => {
    vi.useFakeTimers();
    try {
      shared.fetchMocks.push(
        (_init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            _init?.signal?.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      const pending = handler(makeRequest());
      await vi.advanceTimersByTimeAsync(121_000);
      const res = await pending;
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error_code: string };
      expect(body.error_code).toBe("analysis_failed");
      expect(shared.fetchCalls).toBe(1);
      expect(shared.rpcLog).toContain("release_analysis_slot(true)");
      expect(shared.rpcLog).not.toContain("release_analysis_slot(false)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with a refund when the LLM_API_KEY secret is missing", async () => {
    shared.env.delete("LLM_API_KEY");
    vi.resetModules();
    await import("./index.ts");
    handler = shared.serveHandler!;
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe("analysis_failed");
    expect(shared.fetchCalls).toBe(0);
    expect(shared.rpcLog).toContain("release_analysis_slot(true)");
    shared.env.set("LLM_API_KEY", "test-key");
    vi.resetModules();
    await import("./index.ts");
    handler = shared.serveHandler!;
  });

  it("falls back to the legacy model when the rich call fails without timing out", async () => {
    shared.fetchMocks.push(
      () => Promise.reject(new Error("provider 500")),
      () => Promise.resolve(chatCompletionResponse(legacyPayload())),
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { analysis: unknown; summary_points: string[] };
    };
    expect(body.data.analysis).toBeNull();
    expect(body.data.summary_points.length).toBeGreaterThan(0);
    expect(shared.fetchCalls).toBe(2);
    expect(shared.rpcLog).toContain("release_analysis_slot(false)");
  });

  it("returns a rich result and releases the slot when both LLM calls succeed", async () => {
    shared.fetchMocks.push(() => Promise.resolve(chatCompletionResponse(richPayload())));
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { analysis: { version: number }; summary_points: string[] };
    };
    expect(body.data.analysis.version).toBe(2);
    expect(body.data.summary_points.length).toBe(3);
    expect(shared.rpcLog).toContain("release_analysis_slot(false)");
  });

  it("refunds and returns 500 when both rich and legacy calls fail", async () => {
    shared.fetchMocks.push(
      () => Promise.reject(new Error("rich failure")),
      () => Promise.reject(new Error("legacy failure")),
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe("analysis_failed");
    expect(shared.rpcLog).toContain("release_analysis_slot(true)");
  });
});
