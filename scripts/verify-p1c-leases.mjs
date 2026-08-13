// End-to-end verification of the P1-C concurrency lease/TTL recovery against
// the live Supabase project.
//
// Exercises try_reserve_analysis_slot / release_analysis_slot as the
// signed-in user and reads analysis_leases with the service role:
//   - the concurrency cap is enforced through per-run leases
//   - expired (crashed-run) leases are reclaimed atomically on the next
//     reservation, so no slot is ever permanently occupied
//   - fresh leases are NOT reclaimed
//   - multiple stale leases are reclaimed in one reservation
//   - cleanup never lets the active count exceed the cap (mirror resync)
//   - release deletes the lease; anon/authenticated have no table grants
//
// Run from the project root:  node scripts/verify-p1c-leases.mjs
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
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const email = `p1c-lease-${Date.now()}@example.com`;
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

const activeLeases = async (uid) => {
  const { data, error } = await admin
    .from("analysis_leases")
    .select("id, expires_at, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`lease read failed: ${error.message}`);
  return data ?? [];
};

// Force-expire the first n active leases (simulating crashed runs whose TTL
// elapsed), as an admin — the RPC itself must reclaim them on the next call.
const expireLeases = async (uid, n) => {
  const rows = await activeLeases(uid);
  const ids = rows.slice(0, n).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error } = await admin
    .from("analysis_leases")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .in("id", ids);
  if (error) throw new Error(`lease expire failed: ${error.message}`);
  return ids.length;
};

const reserve = async (user, args) => {
  const { data, error } = await user.rpc("try_reserve_analysis_slot", args);
  return error ? `ERROR:${error.message}` : data;
};

const release = async (user, failed = false) => {
  const { error } = await user.rpc("release_analysis_slot", { p_failed: failed });
  return !error;
};

const PRO_DAILY = 50;
const PRO_MONTHLY = 400;
const PRO_CONCURRENCY = 3;
const FREE_LIMIT = 10;

const ARGS = {
  p_limit: FREE_LIMIT,
  p_pro_daily_limit: PRO_DAILY,
  p_pro_monthly_limit: PRO_MONTHLY,
  p_concurrency_limit: PRO_CONCURRENCY,
};

// ---- 1. schema / grants ---------------------------------------------------
console.log("\n== 1. schema (migration 20260813100002_p1_concurrency_lease applied?) ==");
const withRetry = async (fn, attempts = 3, delayMs = 1000) => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};
try {
  const { error } = await withRetry(() => admin.from("analysis_leases").select("id").limit(1));
  check("analysis_leases table exists", !error, error?.message ?? "");
} catch (e) {
  check("analysis_leases table exists", false, String(e?.message ?? e));
}
try {
  const { error } = await withRetry(() => admin.from("user_credits").select("ls_updated_at").limit(1));
  check("user_credits has ls_updated_at column", !error, error?.message ?? "");
} catch (e) {
  check("user_credits has ls_updated_at column", false, String(e?.message ?? e));
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
const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- 3. pro setup ----------------------------------------------------------
console.log("\n== 3. pro setup ==");
// The user_credits row is created lazily by the first reserve (insert on
// conflict), so an UPDATE before the row exists silently matches 0 rows and
// the user would run the whole script on the free path. Create the row
// explicitly as pro first, then apply the idempotent patch.
const { error: insErr } = await admin.from("user_credits").insert({
  user_id: userId,
  plan: "pro",
  subscription_status: "active",
  ends_at: null,
  used: 0,
  window_start: new Date().toISOString(),
  pro_daily_start: null,
  pro_daily_used: 0,
  pro_month_start: null,
  pro_month_used: 0,
  concurrent: 0,
});
if (insErr && insErr.code !== "23505") {
  throw new Error(`pro setup insert failed: ${insErr.message}`);
}
await setCredits(userId, {
  plan: "pro",
  subscription_status: "active",
  ends_at: null,
  used: 0,
  window_start: new Date().toISOString(),
  pro_daily_start: null,
  pro_daily_used: 0,
  pro_month_start: null,
  pro_month_used: 0,
  concurrent: 0,
});
const setupRow = await readCredits(userId);
check("pro setup row persisted (plan=pro)", setupRow?.plan === "pro", `plan ${setupRow?.plan}`);

// ---- 4. C1: active leases respected ----------------------------------------
console.log("\n== 4. cap enforced through leases ==");
try {
  const r1 = await reserve(user, ARGS);
  const r2 = await reserve(user, ARGS);
  const r3 = await reserve(user, ARGS);
  const r4 = await reserve(user, ARGS);
  check("3 fresh reserves ok, 4th blocked (concurrency)",
    r1 === "ok" && r2 === "ok" && r3 === "ok" && r4 === "concurrency",
    `[${r1}, ${r2}, ${r3}, ${r4}]`);

  const leases = await activeLeases(userId);
  const creditRow = await readCredits(userId);
  check("each reserve created exactly one lease (3 active)",
    leases.length === PRO_CONCURRENCY, `active=${leases.length}`);
  check("mirror counter equals active lease count",
    creditRow?.concurrent === leases.length, `concurrent=${creditRow?.concurrent} active=${leases.length}`);

  const ttlOk = leases.every((l) => {
    const ms = new Date(l.expires_at).getTime() - new Date(l.created_at).getTime();
    return Math.abs(ms - 10 * 60 * 1000) < 30 * 1000;
  });
  check("lease TTL is 10 minutes", ttlOk, leases.map((l) => l.expires_at).join(", "));
} catch (e) {
  check("cap enforced through leases", false, String(e?.message ?? e));
}

// ---- 5. C2/C3: stale reclaimed, fresh not ----------------------------------
console.log("\n== 5. stale lease reclaimed, fresh lease not ==");
try {
  const expired = await expireLeases(userId, 1);
  check("admin expired 1 lease (simulated crashed run)", expired === 1, `expired=${expired}`);
  const afterReclaim = await reserve(user, ARGS);
  check("stale lease reclaimed: next reserve succeeds",
    afterReclaim === "ok", `verdict ${afterReclaim}`);

  const blocked = await reserve(user, ARGS);
  check("fresh (non-expired) leases still count toward the cap",
    blocked === "concurrency", `verdict ${blocked}`);

  const leases = await activeLeases(userId);
  check("active count back to the cap without exceeding it",
    leases.length === PRO_CONCURRENCY, `active=${leases.length}`);
} catch (e) {
  check("stale/fresh lease cases", false, String(e?.message ?? e));
}

// ---- 6. C4: multiple stale leases reclaimed in one reservation -------------
console.log("\n== 6. multiple stale leases reclaimed ==");
try {
  const expiredN = await expireLeases(userId, PRO_CONCURRENCY);
  check("all 3 leases expired", expiredN === PRO_CONCURRENCY, `expired=${expiredN}`);

  const verdicts = [];
  for (let i = 0; i < 4; i++) verdicts.push(await reserve(user, ARGS));
  check("three reservations fit after full reclaim, 4th blocked",
    verdicts.slice(0, 3).every((v) => v === "ok") && verdicts[3] === "concurrency",
    `[${verdicts.join(", ")}]`);

  const leases = await activeLeases(userId);
  const creditRow = await readCredits(userId);
  check("mirror resynced to active lease count (never above cap)",
    creditRow?.concurrent === leases.length && leases.length === PRO_CONCURRENCY,
    `concurrent=${creditRow?.concurrent} active=${leases.length}`);
} catch (e) {
  check("multiple stale reclaim cases", false, String(e?.message ?? e));
}

// ---- 7. C5: release drops the lease ----------------------------------------
console.log("\n== 7. release drops the lease ==");
try {
  const ok = await release(user, false);
  const leases = await activeLeases(userId);
  const creditRow = await readCredits(userId);
  check("successful release deletes one lease and syncs mirror",
    ok && leases.length === PRO_CONCURRENCY - 1 && creditRow?.concurrent === leases.length,
    `active=${leases.length} concurrent=${creditRow?.concurrent}`);

  // A double release (no lease left) must not crash or go negative.
  for (let i = 0; i < PRO_CONCURRENCY; i++) await release(user, false);
  const afterAll = await readCredits(userId);
  const leftover = await activeLeases(userId);
  check("all releases drained leases, mirror floored at 0",
    leftover.length === 0 && afterAll?.concurrent === 0,
    `active=${leftover.length} concurrent=${afterAll?.concurrent}`);
} catch (e) {
  check("release lease cases", false, String(e?.message ?? e));
}

// ---- 8. C6: crash-simulated permanent slot does not exist ------------------
console.log("\n== 8. crashed run never blocks permanently ==");
try {
  await reserve(user, ARGS);
  const before = await activeLeases(userId);
  check("crashed run leaves one lease (no release called)",
    before.length === 1, `active=${before.length}`);

  // Without any release, the TTL is the only recovery: simulate the TTL
  // elapsing, then verify the next reservation reclaims the slot.
  await expireLeases(userId, 1);
  const recovered = await reserve(user, ARGS);
  const after = await activeLeases(userId);
  check("expired lease reclaimed on next reserve (no permanent slot)",
    recovered === "ok" && after.length === 1, `verdict ${recovered} active=${after.length}`);
  await release(user, false);
} catch (e) {
  check("crash recovery cases", false, String(e?.message ?? e));
}

// ---- 9. RLS / grants --------------------------------------------------------
console.log("\n== 9. analysis_leases is service-role only ==");
try {
  const userSel = await user.from("analysis_leases").select("id").limit(1);
  check("authenticated user cannot read analysis_leases", !!userSel.error,
    userSel.error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("authenticated user cannot read analysis_leases", true, String(e?.message ?? e));
}
try {
  const anonSel = await anonClient.from("analysis_leases").select("id").limit(1);
  check("anon cannot read analysis_leases", !!anonSel.error,
    anonSel.error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("anon cannot read analysis_leases", true, String(e?.message ?? e));
}
try {
  const anonIns = await anonClient.from("analysis_leases").insert({ user_id: userId });
  check("anon cannot insert analysis_leases", !!anonIns.error,
    anonIns.error?.message ?? "no error (DENIED expected)");
} catch (e) {
  check("anon cannot insert analysis_leases", true, String(e?.message ?? e));
}

// ---- 10. cleanup ------------------------------------------------------------
console.log("\n== 10. cleanup ==");
const { error: delErr } = await admin.auth.admin.deleteUser(userId);
check("test user deleted (cascades leases)", !delErr, delErr?.message ?? "");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
