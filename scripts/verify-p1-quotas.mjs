// End-to-end verification of the P1 quota + abuse-protection RPCs (P1-1/P1-2/P1-3)
// against the live Supabase project.
//
// Creates a throwaway user, exercises try_reserve_analysis_slot /
// release_analysis_slot / get_user_plan / rate_limit_take directly as the
// signed-in user and as the service role, asserts every quota boundary, then
// deletes the test user.
//
// Run from the project root:  node scripts/verify-p1-quotas.mjs
// Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// NEXT_PUBLIC_SUPABASE_ANON_KEY.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ---- load .env.local (names only, never printed) -------------------------
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
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const email = `p1-quota-${Date.now()}@example.com`;
const password = "Ver1fy!" + Math.random().toString(36).slice(2, 10);

const readCredits = async (uid) => {
  const { data } = await admin
    .from("user_credits")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  return data;
};

const setCredits = async (uid, patch) => {
  const { error } = await admin.from("user_credits").update(patch).eq("user_id", uid);
  if (error) throw new Error(`admin update failed: ${error.message}`);
};

const reserve = async (user, args) => {
  const { data, error } = await user.rpc("try_reserve_analysis_slot", args);
  return error ? `ERROR:${error.message}` : data;
};

const release = async (user, failed = false) => {
  const { error } = await user.rpc("release_analysis_slot", { p_failed: failed });
  return !error;
};

const getPlan = async (user) => {
  const { data, error } = await user.rpc("get_user_plan");
  return error ? `ERROR:${error.message}` : data;
};

const PRO_DAILY = 50;
const PRO_MONTHLY = 400;
const PRO_CONCURRENCY = 3;
const FREE_LIMIT = 10;
const HOUR_MS = 3600 * 1000;

// ---- 1. schema / grants ---------------------------------------------------
console.log("\n== 1. schema (migration 20260813_p1_quota_and_abuse applied?) ==");
try {
  const { error } = await admin
    .from("user_credits")
    .select(
      "plan, used, window_start, subscription_status, ends_at, pro_daily_start, pro_daily_used, pro_month_start, pro_month_used, concurrent",
    )
    .limit(1);
  check("user_credits has P1 quota columns", !error, error?.message ?? "");
} catch (e) {
  check("user_credits has P1 quota columns", false, String(e?.message ?? e));
}
try {
  const { error } = await admin.from("signup_rate_limits").select("bucket_key").limit(1);
  check("signup_rate_limits table exists", !error, error?.message ?? "");
} catch (e) {
  check("signup_rate_limits table exists", false, String(e?.message ?? e));
}
try {
  const { data } = await admin.rpc("rate_limit_take", {
    p_key: `p1test:probe-${Date.now()}`,
    p_limit: 1,
    p_window_seconds: 3600,
  });
  check("rate_limit_take callable by service role", data === true, `returned ${JSON.stringify(data)}`);
} catch (e) {
  check("rate_limit_take callable by service role", false, String(e?.message ?? e));
}
try {
  const { data } = await admin.rpc("is_pro_subscription_active", {
    p_plan: "pro",
    p_status: "active",
    p_ends_at: null,
  });
  check("is_pro_subscription_active callable by service role", data === true, `returned ${JSON.stringify(data)}`);
} catch (e) {
  check("is_pro_subscription_active callable by service role", false, String(e?.message ?? e));
}

// ---- 2. test user ---------------------------------------------------------
console.log("\n== 2. test user ==");
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

const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
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
// Fresh session-less anon client for denial checks (the `anon` client above
// now carries the test user's session).
const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cleanupBuckets = async () => {
  const { error } = await admin
    .from("signup_rate_limits")
    .delete()
    .like("bucket_key", "p1test:%");
  if (error) console.warn("cleanup buckets failed:", error.message);
};

// ---- 3. rate_limit_take (P1-3) --------------------------------------------
console.log("\n== 3. rate_limit_take (P1-3) ==");
const BUCKET = `p1test:rl-${Date.now()}`;
try {
  const r1 = await admin.rpc("rate_limit_take", { p_key: BUCKET, p_limit: 2, p_window_seconds: 3600 });
  const r2 = await admin.rpc("rate_limit_take", { p_key: BUCKET, p_limit: 2, p_window_seconds: 3600 });
  const r3 = await admin.rpc("rate_limit_take", { p_key: BUCKET, p_limit: 2, p_window_seconds: 3600 });
  check("windowed bucket allows exactly limit tokens", r1.data === true && r2.data === true && r3.data === false,
    `[${r1.data}, ${r2.data}, ${r3.data}]`);
  const { error: resetErr } = await admin
    .from("signup_rate_limits")
    .update({ window_start: new Date(Date.now() - 2 * HOUR_MS).toISOString() })
    .eq("bucket_key", BUCKET);
  check("expired window resets and allows again", !resetErr);
  const r4 = await admin.rpc("rate_limit_take", { p_key: BUCKET, p_limit: 2, p_window_seconds: 3600 });
  check("token after window reset granted", r4.data === true, `returned ${r4.data}`);
  const r5 = await admin.rpc("rate_limit_take", { p_key: BUCKET, p_limit: 0, p_window_seconds: 3600 });
  check("invalid args fail open (true)", r5.data === true, `returned ${r5.data}`);
} catch (e) {
  check("rate_limit_take window semantics", false, String(e?.message ?? e));
}
try {
  const r = await anonClient.rpc("rate_limit_take", { p_key: "p1test:anon", p_limit: 1, p_window_seconds: 3600 });
  check("anon cannot call rate_limit_take", !!r.error, r.error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("anon cannot call rate_limit_take", true, String(e?.message ?? e));
}

// ---- 4. free user quotas (P1-2) -------------------------------------------
console.log("\n== 4. free user quotas ==");
try {
  const first = await reserve(user, { p_limit: FREE_LIMIT });
  check("free: first reserve ok", first === "ok", `verdict ${first}`);
  let used = 1;
  for (let i = 1; i < FREE_LIMIT; i++) {
    const r = await reserve(user, { p_limit: FREE_LIMIT });
    if (r === "ok") used++;
    else break;
  }
  const after10 = await readCredits(userId);
  check(`free: ${FREE_LIMIT}th reserve ok (used=${FREE_LIMIT})`, used === FREE_LIMIT, `used=${after10?.used}`);
  const eleventh = await reserve(user, { p_limit: FREE_LIMIT });
  check("free: 11th reserve rejected with free_limit", eleventh === "free_limit", `verdict ${eleventh}`);

  const refunded = await release(user, true);
  const afterRefund = await readCredits(userId);
  check("free: failed-run release refunds a credit", refunded && afterRefund?.used === FREE_LIMIT - 1,
    `used=${afterRefund?.used}`);

  const released = await release(user, false);
  const afterSuccessRelease = await readCredits(userId);
  check("free: success release does NOT refund", released && afterSuccessRelease?.used === FREE_LIMIT - 1,
    `used=${afterSuccessRelease?.used}`);

  await setCredits(userId, { used: FREE_LIMIT, window_start: new Date(Date.now() - 25 * HOUR_MS).toISOString() });
  const reset = await reserve(user, { p_limit: FREE_LIMIT });
  const afterReset = await readCredits(userId);
  check("free: expired 24h window resets and grants one", reset === "ok" && afterReset?.used === 1,
    `verdict ${reset} used=${afterReset?.used}`);

  // A caller cannot raise the free cap by passing a huge p_limit. Use a fresh
  // window (window_start = now) so the 24h-reset branch is not what grants it.
  await setCredits(userId, { used: FREE_LIMIT - 1, window_start: new Date().toISOString() });
  const r1 = await reserve(user, { p_limit: 999999 });
  const r2 = await reserve(user, { p_limit: 999999 });
  check("free: p_limit=999999 is clamped server-side", r1 === "ok" && r2 === "free_limit",
    `[${r1}, ${r2}]`);
} catch (e) {
  check("free quota cases", false, String(e?.message ?? e));
}

// ---- 5. pro quota windows (P1-2) ------------------------------------------
console.log("\n== 5. pro quota windows ==");
try {
  await setCredits(userId, {
    plan: "pro",
    subscription_status: "active",
    ends_at: null,
    used: 0,
    window_start: new Date(Date.now() - 25 * HOUR_MS).toISOString(),
    pro_daily_start: null,
    pro_daily_used: 0,
    pro_month_start: null,
    pro_month_used: 0,
    concurrent: 0,
  });
  const planPro = await getPlan(user);
  check("active pro: get_user_plan returns pro", planPro === "pro", `plan ${planPro}`);

  let okCount = 0;
  for (let i = 0; i < PRO_DAILY; i++) {
    const r = await reserve(user, {
      p_limit: FREE_LIMIT,
      p_pro_daily_limit: PRO_DAILY,
      p_pro_monthly_limit: PRO_MONTHLY,
      p_concurrency_limit: PRO_CONCURRENCY,
    });
    if (r !== "ok") break;
    okCount++;
    const ok = await release(user, false);
    if (!ok) {
      check("pro: release after ok", false, "rpc error");
      break;
    }
  }
  const after50 = await readCredits(userId);
  check(`pro: ${PRO_DAILY} reserves ok (daily used=${PRO_DAILY})`, okCount === PRO_DAILY,
    `ok=${okCount} daily=${after50?.pro_daily_used} concurrent=${after50?.concurrent}`);
  const dailyHit = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  check("pro: 51st reserve rejected with pro_daily", dailyHit === "pro_daily", `verdict ${dailyHit}`);

  // A pro user cannot raise their own daily cap by passing a huge value.
  // Use a live window (recent start) so the reset branch is not what grants it.
  await setCredits(userId, { pro_daily_start: new Date().toISOString(), pro_daily_used: PRO_DAILY - 1, concurrent: 0 });
  const c1 = await reserve(user, { p_limit: FREE_LIMIT, p_pro_daily_limit: 999999, p_pro_monthly_limit: 999999, p_concurrency_limit: 999999 });
  const c2 = await reserve(user, { p_limit: FREE_LIMIT, p_pro_daily_limit: 999999, p_pro_monthly_limit: 999999, p_concurrency_limit: 999999 });
  check("pro: huge caller limits are clamped server-side", c1 === "ok" && c2 === "pro_daily", `[${c1}, ${c2}]`);
  await release(user, false);

  // Monthly cap within a live window (recent start, so the reset branch is not taken).
  await setCredits(userId, { pro_daily_start: null, pro_daily_used: 0, pro_month_start: new Date().toISOString(), pro_month_used: PRO_MONTHLY, concurrent: 0 });
  const monthlyHit = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  check("pro: monthly cap enforced (pro_monthly)", monthlyHit === "pro_monthly", `verdict ${monthlyHit}`);

  await setCredits(userId, { pro_daily_start: null, pro_daily_used: 0, pro_month_used: PRO_MONTHLY - 1, pro_month_start: new Date(Date.now() - 31 * 24 * HOUR_MS).toISOString(), concurrent: 0 });
  const monthReset = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  const afterMonthReset = await readCredits(userId);
  check("pro: expired 30d window resets monthly counter", monthReset === "ok" && afterMonthReset?.pro_month_used === 1,
    `verdict ${monthReset} monthly=${afterMonthReset?.pro_month_used}`);
  await release(user, false);
} catch (e) {
  check("pro quota window cases", false, String(e?.message ?? e));
}

// ---- 6. concurrency (P1-2) ------------------------------------------------
console.log("\n== 6. concurrency ==");
try {
  await setCredits(userId, { concurrent: PRO_CONCURRENCY });
  const blocked = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  check("pro: concurrency cap blocks a 4th in-flight run", blocked === "concurrency", `verdict ${blocked}`);

  await setCredits(userId, { concurrent: 0, pro_daily_start: null, pro_daily_used: 0, pro_month_start: null, pro_month_used: 0 });
  const verdicts = await Promise.all(
    Array.from({ length: 10 }, () =>
      reserve(user, {
        p_limit: FREE_LIMIT,
        p_pro_daily_limit: PRO_DAILY,
        p_pro_monthly_limit: PRO_MONTHLY,
        p_concurrency_limit: PRO_CONCURRENCY,
      }),
    ),
  );
  const okN = verdicts.filter((v) => v === "ok").length;
  const concN = verdicts.filter((v) => v === "concurrency").length;
  check(`pro: 10 parallel reserves -> exactly ${PRO_CONCURRENCY} ok, rest concurrency`,
    okN === PRO_CONCURRENCY && concN === 10 - PRO_CONCURRENCY, `ok=${okN} concurrency=${concN}`);

  for (let i = 0; i < PRO_CONCURRENCY; i++) await release(user, true);
  const afterReleases = await readCredits(userId);
  check("pro: releases return in-flight counter to 0", afterReleases?.concurrent === 0,
    `concurrent=${afterReleases?.concurrent}`);
} catch (e) {
  check("concurrency cases", false, String(e?.message ?? e));
}

// ---- 7. subscription liveness (P1-1) --------------------------------------
console.log("\n== 7. subscription liveness (P1-1) ==");
try {
  const scenarios = [
    ["active, no ends_at", "active", null, "pro"],
    ["on_trial, no ends_at", "on_trial", null, "pro"],
    ["past_due, no ends_at", "past_due", null, "pro"],
    ["cancelled, future ends_at", "cancelled", new Date(Date.now() + 10 * 24 * HOUR_MS).toISOString(), "pro"],
    ["cancelled, past ends_at", "cancelled", new Date(Date.now() - HOUR_MS).toISOString(), "free"],
    ["expired", "expired", new Date().toISOString(), "free"],
    ["paused", "paused", null, "free"],
    ["unpaid", "unpaid", null, "free"],
    ["null status", null, null, "free"],
    ["active, past ends_at", "active", new Date(Date.now() - HOUR_MS).toISOString(), "free"],
  ];
  for (const [label, status, endsAt, expected] of scenarios) {
    await setCredits(userId, { plan: "pro", subscription_status: status, ends_at: endsAt });
    const plan = await getPlan(user);
    check(`plan liveness: ${label} -> ${expected}`, plan === expected, `plan ${plan}`);
  }

  await setCredits(userId, { plan: "pro", subscription_status: "expired", ends_at: new Date().toISOString(), concurrent: 0, pro_daily_start: null, pro_daily_used: 0, pro_month_start: null, pro_month_used: 0 });
  const verdict = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  const row = await readCredits(userId);
  check("self-heal: stale pro row reverts to free and is rate-limited", verdict === "ok" && row?.plan === "free",
    `verdict ${verdict} plan ${row?.plan}`);

  // Cancelled-but-paid users keep Pro (business rule preserved).
  await setCredits(userId, { plan: "pro", subscription_status: "cancelled", ends_at: new Date(Date.now() + 5 * 24 * HOUR_MS).toISOString() });
  const r = await reserve(user, {
    p_limit: FREE_LIMIT,
    p_pro_daily_limit: PRO_DAILY,
    p_pro_monthly_limit: PRO_MONTHLY,
    p_concurrency_limit: PRO_CONCURRENCY,
  });
  check("cancelled with paid-through ends_at still reserves as pro", r === "ok", `verdict ${r}`);
  await release(user, false);
} catch (e) {
  check("liveness cases", false, String(e?.message ?? e));
}

// ---- 8. RLS (users cannot touch their own quota state) --------------------
console.log("\n== 8. RLS ==");
try {
  const upd = await user.from("user_credits").update({ plan: "pro", pro_daily_used: 0 }).eq("user_id", userId);
  check("user cannot update own user_credits row (RLS)", !!upd.error, upd.error?.message ?? "no error (DENIED expected)");
  const sel = await user.from("user_credits").select("plan").eq("user_id", userId).maybeSingle();
  check("user can read own row", !sel.error && !!sel.data, sel.error?.message ?? "");
  const anonRes = await anonClient.rpc("try_reserve_analysis_slot", { p_limit: FREE_LIMIT });
  check("anon cannot call try_reserve_analysis_slot", !!anonRes.error, anonRes.error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("RLS cases", false, String(e?.message ?? e));
}

// ---- 9. cleanup ------------------------------------------------------------
console.log("\n== 9. cleanup ==");
await cleanupBuckets();
const { error: delErr } = await admin.auth.admin.deleteUser(userId);
check("test user deleted (cascades rows)", !delErr, delErr?.message ?? "");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
