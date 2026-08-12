// End-to-end verification of the Lemon Squeezy subscription flow.
//
// Creates a throwaway user, fires REAL signed webhooks at the running dev
// server (localhost:3000), asserts the user_credits row transitions correctly
// through the subscription lifecycle, exercises the checkout route and the
// analyze-summaries plan gate, then deletes the test user.
//
// Run from the project root:  node scripts/verify-subscription-flow.mjs
// Requires: .env.local with Supabase + Lemon Squeezy vars, dev server on :3000.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";

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
  "LEMONSQUEEZY_WEBHOOK_SECRET",
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

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

// ---- 1. schema / migrations ----------------------------------------------
console.log("\n== 1. DB schema (migrations applied?) ==");
try {
  const { data, error } = await admin
    .from("user_credits")
    .select(
      "plan, used, window_start, subscription_status, renews_at, ends_at, cancel_at_period_end, variant_id, billing_interval, ls_subscription_id, ls_customer_id",
    )
    .limit(1);
  check("user_credits has subscription lifecycle columns", !error, error?.message ?? "");
} catch (e) {
  check("user_credits has subscription lifecycle columns", false, String(e?.message ?? e));
}
try {
  const { error } = await admin.from("subscription_events").select("ls_event_id").limit(1);
  check("subscription_events audit table exists", !error, error?.message ?? "");
} catch (e) {
  check("subscription_events audit table exists", false, String(e?.message ?? e));
}
try {
  const { data } = await admin.rpc("get_user_plan");
  check("get_user_plan RPC exists", data === "free", `returned ${JSON.stringify(data)}`);
} catch (e) {
  check("get_user_plan RPC exists", false, String(e?.message ?? e));
}

// ---- 2. create throwaway user --------------------------------------------
const email = `pro-e2e-${Date.now()}@example.com`;
const password = "Ver1fy!" + Math.random().toString(36).slice(2, 10);
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

// user-scoped client (anon key + real session) for RPC / function checks
const userClient = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const fireWebhook = async (eventName, dataId, dataType, attributes, custom = {}) => {
  const body = JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: userId, interval: "month", ...custom } },
    data: { id: String(dataId), type: dataType, attributes },
  });
  const signature = createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
  const res = await fetch(`${BASE}/api/lemon-squeezy/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signature },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const getCredits = async () => {
  const { data } = await admin
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
};

const show = (c) =>
  c
    ? `plan=${c.plan} status=${c.subscription_status ?? "null"} renews=${c.renews_at ?? "null"} ends=${c.ends_at ?? "null"} cancelAtPeriodEnd=${c.cancel_at_period_end} lsSub=${c.ls_subscription_id ?? "null"} lsCust=${c.ls_customer_id ?? "null"}`
    : "NO ROW";

// ---- 3. lifecycle webhooks -----------------------------------------------
console.log("\n== 3. webhook lifecycle ==");

// signature must be verified (tamper test)
const badBody = JSON.stringify({ meta: { event_name: "subscription_created" } });
const badSig = createHmac("sha256", "wrong-secret").update(badBody).digest("hex");
const tamperRes = await fetch(`${BASE}/api/lemon-squeezy/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-signature": badSig },
  body: badBody,
});
check("rejects invalid signature", tamperRes.status === 401, `status ${tamperRes.status}`);

const subId = 777001;
const custId = 99001;

let r = await fireWebhook("subscription_created", subId, "subscriptions", {
  customer_id: custId,
  user_email: email,
  status: "active",
  renews_at: new Date(Date.now() + 30 * 864e5).toISOString(),
  ends_at: null,
  variant_id: 12345,
});
check("subscription_created -> 200", r.status === 200, `status ${r.status}`);
let c = await getCredits();
check("plan becomes pro", c?.plan === "pro", show(c));
check("status active", c?.subscription_status === "active", show(c));
check("subscription id persisted", c?.ls_subscription_id === String(subId), show(c));
check("customer id persisted", c?.ls_customer_id === String(custId), show(c));
check("billing interval month", c?.billing_interval === "month", show(c));

// idempotent re-delivery must not change anything
const before = JSON.stringify(c);
r = await fireWebhook("subscription_created", subId, "subscriptions", {
  customer_id: custId,
  user_email: email,
  status: "active",
  renews_at: new Date(Date.now() + 30 * 864e5).toISOString(),
  ends_at: null,
  variant_id: 12345,
});
check("duplicate delivery deduped (200)", r.status === 200, `status ${r.status}`);
c = await getCredits();
check("duplicate delivery changes nothing", JSON.stringify(c) === before);

// failed payment -> past_due, still pro
r = await fireWebhook("subscription_payment_failed", subId, "subscriptions", {
  customer_id: custId,
  status: "past_due",
  renews_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  ends_at: null,
  cancelled: false,
});
check("payment_failed -> 200", r.status === 200, `status ${r.status}`);
c = await getCredits();
check("past_due keeps pro", c?.plan === "pro" && c?.subscription_status === "past_due", show(c));

// cancelled -> keeps pro until period end
r = await fireWebhook("subscription_cancelled", subId, "subscriptions", {
  customer_id: custId,
  status: "cancelled",
  renews_at: null,
  ends_at: new Date(Date.now() + 10 * 864e5).toISOString(),
  cancelled: true,
});
check("subscription_cancelled -> 200", r.status === 200, `status ${r.status}`);
c = await getCredits();
check(
  "cancelled keeps pro w/ cancelAtPeriodEnd",
  c?.plan === "pro" && c?.subscription_status === "cancelled" && c?.cancel_at_period_end === true,
  show(c),
);

// expired -> free
r = await fireWebhook("subscription_expired", subId, "subscriptions", {
  customer_id: custId,
  status: "expired",
  renews_at: null,
  ends_at: new Date().toISOString(),
  cancelled: false,
});
check("subscription_expired -> 200", r.status === 200, `status ${r.status}`);
c = await getCredits();
check("expired -> plan free", c?.plan === "free" && c?.subscription_status === "expired", show(c));

// order_created (order status 'paid' must be coerced, not violate CHECK)
r = await fireWebhook("order_created", 500555, "orders", {
  customer_id: custId,
  user_email: email,
  status: "paid",
  first_subscription_item: { subscription_id: subId, variant_id: 12345 },
});
check("order_created (status 'paid') -> 200", r.status === 200, `status ${r.status}`);
c = await getCredits();
check("order_created grants pro with valid status", c?.plan === "pro" && c?.subscription_status === "active", show(c));

// order_refunded (status 'refunded' must be coerced)
r = await fireWebhook("order_refunded", 500555, "orders", {
  customer_id: custId,
  user_email: email,
  status: "refunded",
  first_subscription_item: { subscription_id: subId, variant_id: 12345 },
});
check("order_refunded (status 'refunded') -> 200", r.status === 200, `status ${r.status}`);
c = await getCredits();
check("order_refunded -> plan free", c?.plan === "free" && c?.subscription_status === "expired", show(c));

// ---- 4. checkout route -----------------------------------------------------
console.log("\n== 4. checkout route ==");
const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
  email,
  password,
});
check("test user can sign in", !signInErr && !!signIn.session, signInErr?.message ?? "");
if (signIn.session) {
  userClient.functions.setAuth?.(signIn.session.access_token);
  const res = await fetch(`${BASE}/api/lemon-squeezy/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signIn.session.access_token}`,
    },
    body: JSON.stringify({ interval: "month" }),
  });
  const body = await res.json().catch(() => ({}));
  const okUrl = res.status === 200 && /^https:\/\/\S+\.lemonsqueezy\.com\//.test(body.url ?? "");
  check("checkout returns a Lemon Squeezy URL", okUrl, `status ${res.status} url ${body.url ?? "(none)"}`);
} else {
  check("checkout returns a Lemon Squeezy URL", false, "no session");
}

// ---- 5. plan gate in analyze-summaries --------------------------------------
console.log("\n== 5. plan gate (service access) ==");
const reviews60 = Array.from(
  { length: 60 },
  (_, i) => `Review ${i}: this product works great and the quality is excellent, I recommend it.`,
);
const invoke = async (reviews) => {
  try {
    return await userClient.functions.invoke("analyze-summaries", { body: { reviews } });
  } catch (e) {
    return { error: { message: String(e?.message ?? e) } };
  }
};

// free user must be blocked at 60 reviews (no credit consumed)
await admin.from("user_credits").update({ plan: "free" }).eq("user_id", userId);
let inv = await invoke(reviews60);
const ctx = inv.error?.context;
let code = null;
if (ctx) {
  const b = await ctx.json().catch(() => ({}));
  code = b.error_code ?? b.error;
}
check(
  "free user blocked at 60 reviews",
  code === "usage_limit_exceeded" || /50 reviews|free plan/i.test(String(code ?? "")),
  `error_code=${code}`,
);

// pro user passes validation (should proceed to LLM — outcome depends on edge secrets)
await admin.from("user_credits").update({ plan: "pro", subscription_status: "active" }).eq("user_id", userId);
inv = await invoke(reviews60);
const ctx2 = inv.error?.context;
let out2 = null;
if (ctx2) {
  const b = await ctx2.json().catch(() => ({}));
  out2 = b.error_code ?? b.error;
}
const passedGate = !out2 || !/50 reviews|usage_limit_exceeded/i.test(String(out2));
check("pro user passes the plan gate (not limited)", passedGate, `outcome=${out2 ?? "success"}`);

// ---- 6. cleanup ------------------------------------------------------------
console.log("\n== 6. cleanup ==");
const { error: delErr } = await admin.auth.admin.deleteUser(userId);
check("test user deleted (cascades rows)", !delErr, delErr?.message ?? "");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
