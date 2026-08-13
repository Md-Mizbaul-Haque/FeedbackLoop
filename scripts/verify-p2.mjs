// End-to-end verification of the P2 security hardening against the live
// Supabase project:
//   P2-1 widget_id uniqueness (constraint blocks duplicates)
//   P2-7 list_summaries_page keyset pagination (order, cursor, clamp, isolation)
//   P2-8 grant hardening (anon has no table access; authenticated lost legacy
//       analysis_usage writes)
//   P2-9 quota caps single source of truth (quota_caps table + get_quota_caps)
//
// Creates a throwaway user, seeds summaries, exercises the RPCs as the
// signed-in user and as anon, then deletes the test user.
//
// Run from the project root:  node scripts/verify-p2.mjs
// Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// NEXT_PUBLIC_SUPABASE_ANON_KEY.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
for (const key of required) {
  if (!env[key]) {
    console.error(`SKIP: missing ${key} in .env.local`);
    process.exit(1);
  }
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonRaw = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const HOUR_MS = 3600 * 1000;
const BASE_TIME = Date.now() - 24 * HOUR_MS;

const seeded = []; // { id, widget_id, created_at }

// ---- 1. schema / constraints (P2-1, P2-9) ---------------------------------
console.log("\n== 1. schema: unique widget_id + quota_caps ==");
try {
  const { data } = await admin.from("quota_caps").select("*").maybeSingle();
  check(
    "quota_caps row seeded (10/50/400/3)",
    data?.free_limit === 10 &&
      data?.pro_daily_limit === 50 &&
      data?.pro_monthly_limit === 400 &&
      data?.pro_concurrency_limit === 3,
    JSON.stringify(data),
  );
} catch (e) {
  check("quota_caps row seeded", false, String(e?.message ?? e));
}
try {
  const { error } = await admin
    .from("signup_rate_limits")
    .select("bucket_key")
    .limit(1);
  check("widget rate-limit ledger reachable by service role", !error, error?.message ?? "");
} catch (e) {
  check("widget rate-limit ledger reachable by service role", false, String(e?.message ?? e));
}

// ---- 2. test user ----------------------------------------------------------
console.log("\n== 2. test user ==");
const email = `p2-sec-${Date.now()}@example.com`;
const password = "Ver1fy!" + Math.random().toString(36).slice(2, 10);
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr || !created?.user) {
  console.error("FATAL: could not create test user:", createErr?.message);
  process.exit(1);
}
const userId = created.user.id;
console.log(`created test user ${email} (${userId})`);

const { data: signIn, error: signInErr } = await anonRaw.auth.signInWithPassword({
  email,
  password,
});
if (signInErr || !signIn.session) {
  console.error("FATAL: test user cannot sign in:", signInErr?.message);
  process.exit(1);
}
const user = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- 3. P2-9: get_quota_caps ----------------------------------------------
console.log("\n== 3. get_quota_caps (P2-9) ==");
try {
  const { data, error } = await user.rpc("get_quota_caps");
  const row = Array.isArray(data) ? data[0] : null;
  check(
    "user can read caps (10/50/400/3)",
    !error && row?.free_limit === 10 && row?.pro_daily_limit === 50 &&
      row?.pro_monthly_limit === 400 && row?.pro_concurrency_limit === 3,
    error?.message ?? JSON.stringify(row),
  );
} catch (e) {
  check("user can read caps", false, String(e?.message ?? e));
}
try {
  const { error } = await anonClient.rpc("get_quota_caps");
  check("anon cannot call get_quota_caps", !!error, error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("anon cannot call get_quota_caps", true, String(e?.message ?? e));
}

// ---- 4. seed summaries (P2-1, P2-7) ----------------------------------------
console.log("\n== 4. seed summaries ==");
const SEEDS = [
  { title: "oldest", at: new Date(BASE_TIME + 1 * HOUR_MS).toISOString() },
  { title: "middle", at: new Date(BASE_TIME + 2 * HOUR_MS).toISOString() },
  { title: "newest-a", at: new Date(BASE_TIME + 3 * HOUR_MS).toISOString() },
  { title: "newest-b", at: new Date(BASE_TIME + 3 * HOUR_MS).toISOString() }, // same timestamp -> id desc tiebreak
];
try {
  for (let i = 0; i < SEEDS.length; i++) {
    const widgetId = `p2-widget-${i}-${Date.now()}`;
    const { data, error } = await admin
      .from("summaries")
      .insert({
        user_id: userId,
        title: SEEDS[i].title,
        reviews_count: 10,
        keywords: [],
        widget_id: widgetId,
        created_at: SEEDS[i].at,
      })
      .select("id, widget_id, created_at")
      .single();
    if (error) throw error;
    seeded.push({ id: data.id, widget_id: data.widget_id, created_at: data.created_at });
  }
  check(`seeded ${SEEDS.length} summaries`, seeded.length === SEEDS.length, `got ${seeded.length}`);
} catch (e) {
  check("seed summaries", false, String(e?.message ?? e));
}

// ---- 6. P2-7: list_summaries_page -----------------------------------------
const sorted = [...seeded].sort((a, b) =>
  a.created_at === b.created_at
    ? a.id < b.id ? 1 : -1
    : a.created_at < b.created_at ? 1 : -1,
); // created_at desc, id desc
try {
  const page1 = await user.rpc("list_summaries_page", {
    p_page_size: 2,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  const rows1 = page1.data ?? [];
  const last1 = rows1[rows1.length - 1];
  check(
    "first page: 2 rows, newest first, has_more=true",
    !page1.error && rows1.length === 2 &&
      rows1[0].id === sorted[0].id && rows1[1].id === sorted[1].id &&
      rows1[1].has_more === true,
    page1.error?.message ?? `got ${rows1.length} rows`,
  );

  const page2 = await user.rpc("list_summaries_page", {
    p_page_size: 2,
    p_cursor_created_at: last1.created_at,
    p_cursor_id: last1.id,
  });
  const rows2 = page2.data ?? [];
  const last2 = rows2[rows2.length - 1];
  check(
    "second page: remaining 2 rows, stable order, has_more=false",
    !page2.error && rows2.length === 2 &&
      rows2[0].id === sorted[2].id && rows2[1].id === sorted[3].id &&
      rows2[1].has_more === false,
    page2.error?.message ?? `got ${rows2.length} rows`,
  );

  const seen = new Set([...rows1, ...rows2].map((r) => r.id));
  check("no overlap / no duplicates across pages", seen.size === seeded.length,
    `seen ${seen.size}/${seeded.length}`);

  const empty = await user.rpc("list_summaries_page", {
    p_page_size: 2,
    p_cursor_created_at: last2.created_at,
    p_cursor_id: last2.id,
  });
  check(
    "cursor past the last row -> empty page",
    !empty.error && (empty.data ?? []).length === 0,
    `got ${(empty.data ?? []).length} rows`,
  );

  const minClamp = await user.rpc("list_summaries_page", {
    p_page_size: 0,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  check("page size clamped to minimum 1", (minClamp.data ?? []).length === 1,
    `got ${(minClamp.data ?? []).length} rows`);

  const maxClamp = await user.rpc("list_summaries_page", {
    p_page_size: 1000,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  check("page size clamped to maximum 50", (maxClamp.data ?? []).length <= 50,
    `got ${(maxClamp.data ?? []).length} rows`);

  const isolation = await user.rpc("list_summaries_page", {
    p_page_size: 50,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  const isolated = (isolation.data ?? []).every((r) =>
    seeded.some((s) => s.id === r.id),
  );
  check("user sees only their own summaries (isolation)", isolated,
    `returned ${(isolation.data ?? []).length} rows`);

  const { error: anonErr } = await anonClient.rpc("list_summaries_page", {
    p_page_size: 2,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  check("anon cannot call list_summaries_page", !!anonErr,
    anonErr?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("list_summaries_page cases", false, String(e?.message ?? e));
}

// ---- 6b. P2-1: widget_id uniqueness ----------------------------------------
// Runs after the pagination section on purpose: the row inserted here would
// otherwise shift the seeded pagination set (its created_at is now()).
console.log("\n== 6b. widget_id uniqueness (P2-1) ==");
try {
  const dupWidgetId = `p2-dup-${Date.now()}`;
  const { error: firstErr } = await admin
    .from("summaries")
    .insert({ user_id: userId, widget_id: dupWidgetId, keywords: [] });
  const { error: dupErr } = await admin
    .from("summaries")
    .insert({ user_id: userId, widget_id: dupWidgetId, keywords: [] });
  check("first insert with fresh widget_id ok", !firstErr, firstErr?.message ?? "");
  check("duplicate widget_id rejected (23505)", dupErr?.code === "23505", dupErr?.message ?? "no error (VIOLATION expected)");
} catch (e) {
  check("widget_id uniqueness", false, String(e?.message ?? e));
}

// ---- 7. P2-8: grant hardening ----------------------------------------------
console.log("\n== 7. grant hardening (P2-8) ==");
const anonTableAccess = async (table) => {
  const { error } = await anonClient.from(table).select("*").limit(1);
  return error;
};
for (const table of ["summaries", "profiles", "user_settings", "analysis_usage"]) {
  const err = await anonTableAccess(table);
  check(`anon has no access to ${table}`, !!err, err?.message ?? "no error (DENIED expected)");
}
try {
  const { error } = await user
    .from("analysis_usage")
    .insert({ user_id: userId, bucket: new Date().toISOString() });
  check("authenticated cannot write legacy analysis_usage", !!error,
    error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("authenticated cannot write legacy analysis_usage", true, String(e?.message ?? e));
}
try {
  const { data, error } = await user
    .from("summaries")
    .select("id")
    .eq("user_id", userId);
  check(
    "authenticated can still read own summaries (RLS intact)",
    !error && data.length === seeded.length + 1,
    error?.message ?? `got ${data?.length ?? 0} rows (expected ${seeded.length + 1}: seeds + P2-1 dup row)`,
  );
} catch (e) {
  check("authenticated can still read own summaries", false, String(e?.message ?? e));
}

// ---- 8. P2-2: widget bucket keys via rate_limit_take ----------------------
console.log("\n== 8. widget rate-limit buckets (P2-2) ==");
try {
  const key = `widget:ip:v1test${Date.now()}`;
  const { data, error } = await admin.rpc("rate_limit_take", {
    p_key: key,
    p_limit: 60,
    p_window_seconds: 60,
  });
  check("widget bucket key accepted by rate_limit_take", !error && data === true,
    error?.message ?? `returned ${data}`);
  const { error: readErr } = await admin
    .from("signup_rate_limits")
    .select("bucket_key")
    .like("bucket_key", "widget:%")
    .limit(5);
  check("widget bucket rows live in the rate-limit ledger", !readErr,
    readErr?.message ?? "");
} catch (e) {
  check("widget rate-limit buckets", false, String(e?.message ?? e));
}

// ---- 9. cleanup ------------------------------------------------------------
console.log("\n== 9. cleanup ==");
const { error: delErr } = await admin.auth.admin.deleteUser(userId);
check("test user deleted (cascades summaries)", !delErr, delErr?.message ?? "");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);