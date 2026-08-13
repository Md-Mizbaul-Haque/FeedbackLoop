import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The delete-account edge function targets the Deno runtime. These tests stub
// Deno.serve / Deno.env and mock @supabase/supabase-js (resolved from the jsr:
// specifier via the vitest alias) so the real handler runs: data deletion,
// avatar storage cleanup, best-effort Lemon Squeezy cancellation, and user
// deletion — including every failure branch.

const shared = vi.hoisted(() => {
  const env = new Map<string, string>();
  const callLog: string[] = [];
  const lsCalls: Array<{ url: string; method?: string }> = [];
  const client: unknown = null;
  const serveHandler: ((req: Request) => Promise<Response>) | null = null;
  return { env, callLog, lsCalls, client, serveHandler };
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

const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeClient(overrides: {
  lsSubscriptionId?: string | null;
  failDelete?: Record<string, string>;
  listError?: string | null;
  deleteUserError?: string | null;
  getUserError?: string | null;
} = {}) {
  const storageFns = {
    list: vi.fn(async () =>
      overrides.listError
        ? { data: null, error: { message: overrides.listError } }
        : { data: [], error: null },
    ),
    remove: vi.fn(async () => ({ data: [], error: null })),
  };
  return {
    auth: {
      getUser: vi.fn(async () =>
        overrides.getUserError
          ? { data: { user: null }, error: { message: overrides.getUserError } }
          : { data: { user: { id: USER_ID } }, error: null },
      ),
      admin: {
        deleteUser: vi.fn(async () =>
          overrides.deleteUserError
            ? { data: null, error: { message: overrides.deleteUserError } }
            : { data: {}, error: null },
        ),
      },
    },
    from: vi.fn((name: string) => {
      const deleteChain = () => ({
        eq: vi.fn(async () => {
          if (overrides.failDelete?.[name]) {
            return { data: null, error: { message: overrides.failDelete[name] } };
          }
          return { data: null, error: null };
        }),
      });
      if (name === "user_credits") {
        return {
          select: vi.fn(() => {
            shared.callLog.push("from(user_credits).select");
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { ls_subscription_id: overrides.lsSubscriptionId ?? null },
                  error: null,
                })),
              })),
            };
          }),
          delete: vi.fn(() => {
            shared.callLog.push("from(user_credits).delete");
            return deleteChain();
          }),
        };
      }
      return {
        delete: vi.fn(() => {
          shared.callLog.push(`from(${name}).delete`);
          return deleteChain();
        }),
      };
    }),
    storage: {
      from: vi.fn(() => storageFns),
    },
  };
}

function makeRequest(method = "POST", headers: Record<string, string> = {}): Request {
  return new Request("http://edge/delete-account", {
    method,
    headers: {
      Authorization: "Bearer test-jwt",
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("delete-account edge function", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    await import("./index.ts");
    handler = shared.serveHandler!;
  });

  beforeEach(() => {
    shared.env.set("SUPABASE_URL", "https://x.supabase.co");
    shared.env.set("SUPABASE_ANON_KEY", "anon");
    shared.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    shared.env.set("LEMONSQUEEZY_API_KEY", "ls-key");
    shared.callLog.length = 0;
    shared.lsCalls.length = 0;
    shared.client = makeClient({ lsSubscriptionId: "ls-42" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        shared.lsCalls.push({ url, method: init?.method });
        return {
          ok: true,
          status: 200,
          text: async () => "",
        } as unknown as Response;
      }),
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("answers OPTIONS preflight with 200", async () => {
    const res = await handler(makeRequest("OPTIONS"));
    expect(res.status).toBe(200);
    expect(shared.callLog).toEqual([]);
  });

  it("rejects non-POST methods with 405", async () => {
    const res = await handler(makeRequest("GET"));
    expect(res.status).toBe(405);
    expect(shared.callLog).toEqual([]);
  });

  it("rejects a missing Authorization header before touching any data", async () => {
    const res = await handler(makeRequest("POST", { Authorization: "" }));
    expect(res.status).toBe(401);
    expect(shared.callLog).toEqual([]);
  });

  it("rejects an invalid session token with 401", async () => {
    shared.client = makeClient({ getUserError: "bad jwt" });
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
    expect(shared.callLog).toEqual([]);
  });

  it("deletes all data, cleans up avatar storage, cancels the Lemon Squeezy subscription, then deletes the user", async () => {
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(body.data.deleted).toBe(true);

    const client = shared.client as {
      from: ReturnType<typeof vi.fn>;
      storage: { from: ReturnType<typeof vi.fn> };
      auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } };
    };
    expect(client.from).toHaveBeenCalledWith("summaries");
    expect(client.from).toHaveBeenCalledWith("analysis_usage");
    expect(client.from).toHaveBeenCalledWith("user_settings");
    expect(client.storage.from).toHaveBeenCalledWith("avatars");
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);

    expect(shared.callLog[0]).toBe("from(user_credits).select");
    expect(shared.callLog).toContain("from(summaries).delete");
    expect(shared.lsCalls).toEqual([
      {
        url: "https://api.lemonsqueezy.com/v1/subscriptions/ls-42",
        method: "DELETE",
      },
    ]);
  });

  it("does not call Lemon Squeezy when there is no subscription id", async () => {
    shared.client = makeClient({ lsSubscriptionId: null });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    expect(shared.lsCalls).toEqual([]);
  });

  it("returns 500 and does not delete the user when summaries deletion fails", async () => {
    shared.client = makeClient({ failDelete: { summaries: "rpc down" } });
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    expect(shared.callLog).not.toContain("from(analysis_usage).delete");
    expect(shared.lsCalls).toEqual([]);
  });

  it("still deletes the user when avatar storage cleanup fails (best-effort)", async () => {
    shared.client = makeClient({ listError: "storage down" });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const client = shared.client as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } };
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("still deletes the user when the Lemon Squeezy cancellation fails (best-effort)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        shared.lsCalls.push({ url, method: init?.method });
        return {
          ok: false,
          status: 500,
          text: async () => "boom",
        } as unknown as Response;
      }),
    );
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const client = shared.client as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } };
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(shared.lsCalls[0].url).toContain("/subscriptions/ls-42");
  });

  it("returns 500 when the final user deletion fails", async () => {
    shared.client = makeClient({ deleteUserError: "admin api down" });
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
  });
});
