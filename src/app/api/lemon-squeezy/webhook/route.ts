import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import {
  sendSubscriptionEmail,
  type SubscriptionEmailEvent,
} from "@/lib/subscription-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LsCustomData {
  user_id?: string;
  interval?: "year" | "month";
}

interface LsWebhookPayload {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown> | string;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      customer_id?: number;
      user_email?: string;
      subscription_id?: number;
      status?: string;
      renews_at?: string | null;
      ends_at?: string | null;
      cancelled?: boolean;
      variant_id?: number | null;
      first_subscription_item?: { subscription_id?: number; variant_id?: number };
      first_order_item?: { variant_id?: number };
    };
  };
}

function parseCustomData(
  customData: Record<string, unknown> | string | undefined,
): LsCustomData {
  let parsed: Record<string, unknown> = {};
  if (typeof customData === "string") {
    try {
      parsed = JSON.parse(customData) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (customData && typeof customData === "object") {
    parsed = customData;
  }
  const userId = parsed.user_id == null ? undefined : String(parsed.user_id);
  const interval =
    parsed.interval === "year" || parsed.interval === "month"
      ? (parsed.interval as "year" | "month")
      : undefined;
  return { user_id: userId, interval };
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Statuses allowed by the user_credits.subscription_status CHECK constraint.
const VALID_STATUSES = new Set([
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

// Lemon Squeezy reports statuses that are not valid subscription states for
// our CHECK constraint — order events carry order statuses ("paid",
// "refunded", "pending", "cancelled"). Coerce through the whitelist and fall
// back to the state the event implies.
function coerceStatus(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && VALID_STATUSES.has(value) ? value : fallback;
}

// Pull the Lemon Squeezy customer/subscription ids out of any event payload so
// the billing portal route can find the subscription later.
function extractIds(
  data: NonNullable<LsWebhookPayload["data"]>,
): { customerId: string | null; subscriptionId: string | null } {
  const attributes = data.attributes ?? {};
  const customerId =
    attributes.customer_id == null ? null : String(attributes.customer_id);
  let subscriptionId: string | null = null;
  if (data.type === "subscriptions" && data.id != null) {
    // Subscription events carry the subscription id as the resource id.
    subscriptionId = String(data.id);
  } else if (attributes.subscription_id != null) {
    subscriptionId = String(attributes.subscription_id);
  } else if (attributes.first_subscription_item?.subscription_id != null) {
    subscriptionId = String(attributes.first_subscription_item.subscription_id);
  }
  return { customerId, subscriptionId };
}

// ---------------------------------------------------------------------------
// Plan state write. Undefined fields are omitted so a partial payload can't
// wipe values like renews_at that didn't arrive with the event.
// ---------------------------------------------------------------------------
interface PlanState {
  plan: "free" | "pro";
  status?: string | null;
  renewsAt?: string | null;
  endsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  variantId?: string | null;
  billingInterval?: "month" | "year" | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}

function toRow(user_id: string, state: PlanState): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id,
    plan: state.plan,
    updated_at: new Date().toISOString(),
  };
  if (state.status !== undefined) row.subscription_status = state.status;
  if (state.renewsAt !== undefined) row.renews_at = state.renewsAt;
  if (state.endsAt !== undefined) row.ends_at = state.endsAt;
  if (state.cancelAtPeriodEnd !== undefined) {
    row.cancel_at_period_end = state.cancelAtPeriodEnd;
  }
  if (state.variantId !== undefined) row.variant_id = state.variantId;
  if (state.billingInterval !== undefined) {
    row.billing_interval = state.billingInterval;
  }
  if (state.customerId !== undefined) row.ls_customer_id = state.customerId;
  if (state.subscriptionId !== undefined) {
    row.ls_subscription_id = state.subscriptionId;
  }
  return row;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function applyPlan(user_id: string, state: PlanState): Promise<void> {
  const supabase = serviceClient();
  const { error } = await supabase
    .from("user_credits")
    .upsert(toRow(user_id, state), { onConflict: "user_id" });

  if (error) {
    console.error(`[ls-webhook] plan update failed for ${user_id}:`, error);
    throw error;
  }
}

async function currentPlan(user_id: string): Promise<"free" | "pro"> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("plan")
    .eq("user_id", user_id)
    .maybeSingle();
  return data?.plan === "pro" ? "pro" : "free";
}

async function sendBestEffort(
  event: SubscriptionEmailEvent,
  to?: string,
): Promise<void> {
  if (!to) return;
  try {
    await sendSubscriptionEmail(event, to);
  } catch (err) {
    console.error(`[ls-webhook] email "${event}" failed:`, err);
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") ?? "";

  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: LsWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = payload.meta?.event_name;
  const custom = parseCustomData(payload.meta?.custom_data);
  const user_id = custom.user_id;

  if (!event || !user_id) {
    // Not one of our events, or no user link — nothing to do.
    return NextResponse.json({ received: true });
  }

  // Idempotency: log every processed event once. A unique violation means the
  // event was already handled (Lemon Squeezy retries deliveries). The key must
  // include the event name — data.id alone is the subscription id, which is
  // shared by every subscription event, so it can't identify a delivery.
  const supabase = serviceClient();
  const dataRef = payload.data ?? {};
  const lsEventId = dataRef.id
    ? `${event}:${dataRef.type ?? "event"}:${dataRef.id}`
    : null;
  if (lsEventId) {
    const { error: logError } = await supabase.from("subscription_events").insert({
      ls_event_id: lsEventId,
      user_id,
      event_name: event,
      payload,
    });
    if (logError) {
      if (logError.code === "23505") {
        // Duplicate delivery — already processed.
        return NextResponse.json({ received: true });
      }
      console.error("[ls-webhook] event log insert failed:", logError);
    }
  }

  const attributes = dataRef.attributes ?? {};
  const status = attributes.status ?? null;
  const renewsAt = attributes.renews_at ?? null;
  const endsAt = attributes.ends_at ?? null;
  const variantId =
    attributes.variant_id ??
    attributes.first_subscription_item?.variant_id ??
    attributes.first_order_item?.variant_id ??
    null;
  const billingInterval = custom.interval ?? null;
  const email = attributes.user_email;
  const ids = extractIds(dataRef);

  const grantEmails: Record<string, SubscriptionEmailEvent | null> = {
    order_created: "pro_activated",
    subscription_created: "pro_activated",
    subscription_payment_success: "payment_success",
    subscription_resumed: null,
    subscription_unpaused: null,
  };
  const revokeEmails: Record<string, SubscriptionEmailEvent | null> = {
    subscription_expired: "expired",
    subscription_paused: null,
    order_refunded: "refunded",
    subscription_payment_refunded: "refunded",
  };

  try {
    // --- Events that grant (or keep) Pro ------------------------------------
    if (event in grantEmails) {
      await applyPlan(user_id, {
        plan: "pro",
        status: coerceStatus(status, "active"),
        renewsAt,
        endsAt,
        cancelAtPeriodEnd: false,
        variantId: variantId == null ? null : String(variantId),
        billingInterval,
        ...ids,
      });
      const mail = grantEmails[event];
      if (mail) await sendBestEffort(mail, email);
      return NextResponse.json({ received: true });
    }

    // --- Events that revoke Pro ---------------------------------------------
    if (event in revokeEmails) {
      await applyPlan(user_id, {
        plan: "free",
        status: coerceStatus(status, "expired"),
        renewsAt: null,
        endsAt: status === "active" ? null : endsAt,
        cancelAtPeriodEnd: false,
        variantId: variantId == null ? null : String(variantId),
        billingInterval,
        ...ids,
      });
      const mail = revokeEmails[event];
      if (mail) await sendBestEffort(mail, email);
      return NextResponse.json({ received: true });
    }

    // --- Cancellation: customer keeps Pro until the end of the paid period --
    if (event === "subscription_cancelled") {
      await applyPlan(user_id, {
        plan: "pro",
        status: "cancelled",
        renewsAt: null,
        endsAt,
        cancelAtPeriodEnd: true,
        variantId: variantId == null ? null : String(variantId),
        billingInterval,
        ...ids,
      });
      await sendBestEffort("cancelled", email);
      return NextResponse.json({ received: true });
    }

    // --- Failed renewal: LS retries; keep Pro, mark past-due, notify -------
    if (event === "subscription_payment_failed") {
      await applyPlan(user_id, {
        plan: await currentPlan(user_id),
        status: coerceStatus(status, "past_due"),
        renewsAt,
        endsAt: endsAt ?? null,
        cancelAtPeriodEnd: attributes.cancelled === true,
        variantId: variantId == null ? null : String(variantId),
        billingInterval,
        ...ids,
      });
      await sendBestEffort("payment_failed", email);
      return NextResponse.json({ received: true });
    }

    // --- Generic subscription state change ----------------------------------
    if (event === "subscription_updated") {
      if (status === "expired") {
        await applyPlan(user_id, {
          plan: "free",
          status: "expired",
          renewsAt: null,
          endsAt: endsAt ?? null,
          cancelAtPeriodEnd: false,
          variantId: variantId == null ? null : String(variantId),
          billingInterval,
          ...ids,
        });
        await sendBestEffort("expired", email);
      } else if (status === "paused") {
        await applyPlan(user_id, {
          plan: "free",
          status: "paused",
          renewsAt: null,
          endsAt: endsAt ?? null,
          cancelAtPeriodEnd: false,
          variantId: variantId == null ? null : String(variantId),
          billingInterval,
          ...ids,
        });
      } else {
        const retained = await currentPlan(user_id);
        const s = coerceStatus(status, "active");
        await applyPlan(user_id, {
          plan: s === "cancelled" ? "pro" : retained,
          status: s,
          renewsAt,
          endsAt,
          cancelAtPeriodEnd:
            s === "cancelled" ? true : attributes.cancelled === true,
          variantId: variantId == null ? null : String(variantId),
          billingInterval,
          ...ids,
        });
      }
      return NextResponse.json({ received: true });
    }

    // Other events (coupon processed, license keys, ...) — nothing to do.
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[ls-webhook] processing failed:", err);
    // Remove the idempotency record so a Lemon Squeezy retry can reprocess
    // this event; otherwise the unique constraint would swallow the retry and
    // the plan change would never be applied.
    if (lsEventId) {
      try {
        await supabase
          .from("subscription_events")
          .delete()
          .eq("ls_event_id", lsEventId);
      } catch {
        // Best effort — a stale log row only means a duplicate delivery.
      }
    }
    return NextResponse.json(
      { error: "Failed to process webhook." },
      { status: 500 },
    );
  }
}