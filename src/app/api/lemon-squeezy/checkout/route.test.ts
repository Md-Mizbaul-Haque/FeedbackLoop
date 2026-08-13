import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST, trustedCheckoutSuccessUrl } from "./route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface FakeOptions {
  knownUser?: boolean;
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const calls: { getUser: number } = { getUser: 0 };
  const fake = {
    calls,
    auth: {
      getUser: async (token: string) => {
        calls.getUser += 1;
        void token;
        if (opts.knownUser === false) {
          return { data: { user: null }, error: { message: "bad" } };
        }
        return { data: { user: { id: USER_ID, email: "buyer@example.com" } }, error: null };
      },
    },
  };
  return fake as unknown as ReturnType<typeof createClient>;
}

function mockSupabase(fake: ReturnType<typeof createClient>) {
  vi.mocked(createClient).mockReturnValue(fake);
  return fake;
}

function mockLemonSqueezy(options: { ok?: boolean; url?: string; text?: string } = {}) {
  const calls: { url: string; init: { body?: string } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body?: string }) => {
      calls.push({ url, init });
      if (options.ok === false) {
        return {
          ok: false,
          status: 502,
          text: async () => options.text ?? "bad",
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { attributes: { url: options.url ?? "https://checkout.example/pay" } },
        }),
      };
    }),
  );
  return calls;
}

function checkoutRequest(
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return new NextRequest("http://localhost/api/lemon-squeezy/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv("LEMONSQUEEZY_API_KEY", "ls-key");
  vi.stubEnv("LEMONSQUEEZY_STORE_ID", "12345");
  vi.stubEnv("LEMONSQUEEZY_PRO_VARIANT_ID", "456");
  vi.stubEnv("LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", "789");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("trustedCheckoutSuccessUrl", () => {
  it("TEST C1 — configured site URL is used; request Origin is ignored", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://feedbackloop.example");
    expect(
      trustedCheckoutSuccessUrl("https://evil.example"),
    ).toBe("https://feedbackloop.example/pricing?checkout=success");
  });

  it("TEST C2 — configured value is normalized (trailing slash removed)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://feedbackloop.example///");
    expect(trustedCheckoutSuccessUrl(null)).toBe(
      "https://feedbackloop.example/pricing?checkout=success",
    );
  });

  it("TEST C3 — development: a loopback Origin is accepted", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(trustedCheckoutSuccessUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/pricing?checkout=success",
    );
    expect(trustedCheckoutSuccessUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/pricing?checkout=success",
    );
  });

  it("TEST C4 — development: a non-loopback Origin is rejected", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(trustedCheckoutSuccessUrl("https://evil.example")).toBeNull();
  });

  it("TEST C5 — production with no config fails safe even when Origin is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(trustedCheckoutSuccessUrl("https://evil.example")).toBeNull();
    expect(trustedCheckoutSuccessUrl("https://feedbackloop.example")).toBeNull();
  });

  it("TEST C6 — an invalid configured value fails safe (no fallback)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(trustedCheckoutSuccessUrl("https://evil.example")).toBeNull();
  });
});

describe("checkout POST", () => {
  it("TEST C7 — happy path creates a checkout with the trusted redirect URL", async () => {
    mockSupabase(makeFakeSupabase());
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://feedbackloop.example");
    const calls = mockLemonSqueezy();

    const res = await POST(checkoutRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success_url).toBe(
      "https://feedbackloop.example/pricing?checkout=success",
    );
    const requestBody = JSON.parse(calls[0].init.body ?? "{}");
    expect(requestBody.data.attributes.product_options.redirect_url).toBe(
      "https://feedbackloop.example/pricing?checkout=success",
    );
  });

  it("TEST C8 — production without config refuses to create a checkout", async () => {
    mockSupabase(makeFakeSupabase());
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const calls = mockLemonSqueezy();

    const res = await POST(checkoutRequest({ origin: "https://evil.example" }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Checkout is not configured yet.",
    });
    // Lemon Squeezy is never called.
    expect(calls).toHaveLength(0);
  });

  it("TEST C9 — an unauthorized request is rejected before any checkout", async () => {
    mockSupabase(makeFakeSupabase({ knownUser: false }));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://feedbackloop.example");
    const calls = mockLemonSqueezy();

    const res = await POST(checkoutRequest());

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("TEST C10 — a Lemon Squeezy failure surfaces as 502", async () => {
    mockSupabase(makeFakeSupabase());
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://feedbackloop.example");
    mockLemonSqueezy({ ok: false });

    const res = await POST(checkoutRequest());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Could not create checkout.",
    });
  });
});
