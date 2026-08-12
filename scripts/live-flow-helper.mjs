// Helper for the live Lemon Squeezy test-payment flow.
//
// Subcommands:
//   create-user            create a throwaway email/password user (prints credentials)
//   ls-info                show store + product info from the Lemon Squeezy API (env sanity)
//   check-pro <userId>     print the user_credits row for a user
//   webhook-sync <userId>  fetch the user's LS subscription from the API and fire the
//                          matching signed webhooks at localhost so the local DB flips to pro
//   portal <token>         POST the portal route with a Bearer token, print the returned URL
//   cancel-sub <subId>     DELETE /v1/subscriptions/{id} (cancels at period end)
//   delete-user <userId>   delete a user via the admin API (cascades rows)
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const LS_API = "https://api.lemonsqueezy.com/v1";

function loadEnv() {
  const env = {};
  for (const raw of readFileSync(".env.local", "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, idx).trim()] = value;
  }
  return env;
}
const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [, , cmd, ...args] = process.argv;

async function lsGet(path, key = env.LEMONSQUEEZY_API_KEY) {
  const res = await fetch(`${LS_API}${path}`, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function fireWebhook(eventName, dataId, dataType, attributes, userId, custom = {}) {
  const body = JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: userId, interval: "month", ...custom } },
    data: { id: String(dataId), type: dataType, attributes },
  });
  const signature = createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
  return fetch(`${BASE}/api/lemon-squeezy/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signature },
    body,
  });
}

switch (cmd) {
  case "create-user": {
    const email = `pro-live-${Date.now()}@example.com`;
    const password = "LiveTest!" + Math.random().toString(36).slice(2, 10);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("create-user failed:", error.message);
      process.exit(1);
    }
    console.log(JSON.stringify({ email, password, userId: data.user.id }, null, 2));
    break;
  }

  case "ls-info": {
    const store = await lsGet(`/stores/${env.LEMONSQUEEZY_STORE_ID}`);
    console.log("store:", store.status, JSON.stringify(store.body?.data?.attributes ?? store.body, null, 2).slice(0, 600));
    const products = await lsGet("/products");
    console.log("products:", products.status, JSON.stringify(products.body?.data ?? products.body, null, 2).slice(0, 400));
    const variants = await lsGet("/variants");
    const mine = (variants.body?.data ?? []).filter(
      (v) => String(v.id) === env.LEMONSQUEEZY_PRO_VARIANT_ID,
    );
    console.log(
      "configured pro variant:",
      JSON.stringify(mine.map((v) => ({ id: v.id, name: v.attributes.name, is_subscription: v.attributes.is_subscription, price: v.attributes.price })), null, 2),
    );
    break;
  }

  case "check-pro": {
    const { data } = await admin.from("user_credits").select("*").eq("user_id", args[0]).maybeSingle();
    console.log(JSON.stringify(data, null, 2));
    break;
  }

  case "webhook-sync": {
    const userId = args[0];
    const { data: credits } = await admin.from("user_credits").select("ls_subscription_id, ls_customer_id").eq("user_id", userId).maybeSingle();
    const subId = credits?.ls_subscription_id;
    const custId = credits?.ls_customer_id;
    if (!subId) {
      console.log("no ls_subscription_id on record — cannot sync");
      process.exit(1);
    }
    const sub = await lsGet(`/subscriptions/${subId}`);
    const attrs = sub.body?.data?.attributes ?? {};
    console.log("LS subscription:", sub.status, JSON.stringify({ status: attrs.status, renews_at: attrs.renews_at, ends_at: attrs.ends_at, cancelled: attrs.cancelled, variant_id: attrs.variant_id }, null, 2));
    const r = await fireWebhook(
      "subscription_created",
      subId,
      "subscriptions",
      {
        customer_id: Number(custId ?? 0),
        user_email: "test@example.com",
        status: attrs.status ?? "active",
        renews_at: attrs.renews_at,
        ends_at: attrs.ends_at,
        variant_id: attrs.variant_id,
      },
      userId,
    );
    console.log("webhook status:", r.status, await r.text());
    const { data: after } = await admin.from("user_credits").select("plan, subscription_status, ls_subscription_id, ls_customer_id").eq("user_id", userId).maybeSingle();
    console.log("after:", JSON.stringify(after, null, 2));
    break;
  }

  case "portal": {
    const token = args[0];
    const res = await fetch(`${BASE}/api/lemon-squeezy/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("portal status:", res.status, await res.text());
    break;
  }

  case "simulate-pro": {
    // Fire the exact post-payment events Lemon Squeezy would send, with
    // plausible-but-fake resource ids, to verify the app flips to Pro.
    const userId = args[0];
    const subId = 444001;
    const custId = 666001;
    const r1 = await fireWebhook(
      "subscription_created",
      subId,
      "subscriptions",
      {
        customer_id: custId,
        user_email: "test@example.com",
        status: "active",
        renews_at: new Date(Date.now() + 30 * 864e5).toISOString(),
        ends_at: null,
        variant_id: 2009612,
      },
      userId,
    );
    console.log("subscription_created ->", r1.status, await r1.text());
    const { data: row } = await admin.from("user_credits").select("*").eq("user_id", userId).maybeSingle();
    console.log("user_credits:", JSON.stringify(row, null, 2));
    break;
  }

  case "cancel-sub": {
    const res = await fetch(`${LS_API}/subscriptions/${args[0]}`, {
      method: "DELETE",
      headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}` },
    });
    console.log("cancel-sub status:", res.status, await res.text());
    break;
  }

  case "delete-user": {
    const { error } = await admin.auth.admin.deleteUser(args[0]);
    console.log(error ? `delete failed: ${error.message}` : "user deleted (rows cascade)");
    break;
  }

  default:
    console.log("unknown command");
    process.exit(1);
}
