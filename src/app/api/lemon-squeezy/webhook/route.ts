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
    test_mode?: boolean;
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
      updated_at?: string | null;
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
// Webhook event identity (P0-1)
// ---------------------------------------------------------------------------
// Lemon Squeezy payloads do not carry a per-delivery event id: retries resend
// the identical payload, while distinct events for one resource share the
// resource id (data.id). Distinguish event occurrences by the resource's
// updated_at timestamp — microsecond precision, bumped on every change — so
// two legitimate subscription_updated events for the same subscription get
// different keys and both process, while an exact retry delivery keeps the
// same key and is deduplicated. If updated_at is absent, fall back to the
// mutable state fields the change itself carries.
function buildLsEventId(
  event: string,
  data: NonNullable<LsWebhookPayload["data"]>,
): string | null {
  if (!data.id) return null;
  const attributes = data.attributes ?? {};
  const occurrence =
    typeof attributes.updated_at === "string" && attributes.updated_at
      ? attributes.updated_at
      : [attributes.status, attributes.ends_at, attributes.renews_at]
          .filter((v): v is string => typeof v === "string")
          .join("|");
  return `${event}:${data.type ?? "event"}:${data.id}:${occurrence}`;
}

// ---------------------------------------------------------------------------
// Pro-variant validation (P0-2)
// ---------------------------------------------------------------------------
// Only subscriptions of the configured FeedbackLoop Pro product may grant or
// retain Pro. The product has one monthly variant (LEMONSQUEEZY_PRO_VARIANT_ID)
// and, when configured, a yearly variant (LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID);
// the checkout route picks between them. Events for any other variant belong
// to a different product or a one-time purchase and must never touch
// user_credits. Comparison normalizes both sides to trimmed strings because
// Lemon Squeezy sends numeric variant ids while the environment variables are
// strings.
function configuredProVariants(): Set<string> {
  const configured = [
    process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
    process.env.LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID,
  ];
  return new Set(
    configured
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim()),
  );
}

function isProVariantEvent(eventVariant: string | null): boolean {
  const proVariants = configuredProVariants();
  if (proVariants.size === 0) {
    console.error(
      "[ls-webhook] LEMONSQUEEZY_PRO_VARIANT_ID is not configured — refusing to grant Pro.",
    );
    return false;
  }
  return eventVariant !== null && proVariants.has(eventVariant);
}

function ignoredVariant(
  event: string,
  subscriptionId: string | null,
  eventVariant: string | null,
): NextResponse {
  console.warn(
    `[ls-webhook] ignoring ${event} (subscription ${subscriptionId ?? "unknown"}) — variant ${eventVariant ?? "missing"} is not a configured Pro variant`,
  );
  return NextResponse.json({ received: true, ignored: "variant" });
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

// ---------------------------------------------------------------------------
// Out-of-order protection (P1-A)
// ---------------------------------------------------------------------------
// Lemon Squeezy retries deliveries and may deliver events out of order (an
// older subscription_updated arriving after a newer cancelled event). Each
// resource carries attributes.updated_at — microsecond precision, bumped on
// every change — which we store in user_credits.ls_updated_at as the
// authoritative "state as of" timestamp. Events whose timestamp is older than
// the recorded state are ignored, so a delayed delivery can never roll back
// newer state; exact duplicate deliveries are already deduplicated by the
// subscription_events unique key. A missing/unparseable timestamp fails safe:
// the event may only apply when no timestamped state has ever been recorded.
function parseOccurrenceTs(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
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

async function applyPlanState(
  user_id: string,
  state: PlanState,
  occurrenceTs: string | null,
  event: string,
  subscriptionId: string | null,
): Promise<void> {
  const supabase = serviceClient();
  const row = toRow(user_id, state);
  if (occurrenceTs) row.ls_updated_at = occurrenceTs;

  // Atomic compare-and-set: only a row whose recorded timestamp is older (or
  // not yet set) may be overwritten. The predicate and the write are a single
  // database statement, so two concurrent deliveries cannot both win and the
  // guard holds across serverless instances.
  const guard = occurrenceTs
    ? `ls_updated_at.is.null,ls_updated_at.lte.${occurrenceTs}`
    : "ls_updated_at.is.null";
  const { data: updated, error: updateError } = await supabase
    .from("user_credits")
    .update(row)
    .eq("user_id", user_id)
    .or(guard)
    .select("user_id");
  if (updateError) {
    console.error(`[ls-webhook] plan update failed for ${user_id}:`, updateError);
    throw updateError;
  }
  if (updated && updated.length > 0) return;

  // No row yet (first event for this user) — insert it, ignoring a concurrent
  // winner of the race (upsert + ignoreDuplicates = insert-if-absent).
  const { data: inserted, error: insertError } = await supabase
    .from("user_credits")
    .upsert(row, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");
  if (insertError) {
    console.error(`[ls-webhook] plan insert failed for ${user_id}:`, insertError);
    throw insertError;
  }
  if (inserted && inserted.length > 0) return;

  // The row exists but its recorded state is at least as new as this event:
  // an out-of-order delivery. Never roll back newer state.
  console.warn(
    `[ls-webhook] ignoring out-of-order ${event} (subscription ${subscriptionId ?? "unknown"}) for user ${user_id} — recorded state is newer than the event`,
  );
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
  // event was already handled (Lemon Squeezy retries deliveries with the
  // identical payload). The key identifies the event occurrence — event name +
  // resource id + the resource's updated_at — so distinct events for the same
  // subscription both process while exact retries are deduplicated.
  const supabase = serviceClient();
  const dataRef = payload.data ?? {};
  const ids = extractIds(dataRef);
  const lsEventId = buildLsEventId(event, dataRef);

  // -------------------------------------------------------------------------
  // Test-mode protection (P2-3)
  // -------------------------------------------------------------------------
  // Lemon Squeezy marks test-mode deliveries with meta.test_mode = true; they
  // are signed with the same secret as production events. A stray test event
  // must never grant (or revoke) Pro in production, so test events are dropped
  // unless explicitly enabled with LEMONSQUEEZY_ALLOW_TEST_MODE=true (local
  // development only). Rejected events are audited in subscription_events and
  // logged, without leaking any payload secrets.
  if (payload.meta?.test_mode === true && process.env.LEMONSQUEEZY_ALLOW_TEST_MODE !== "true") {
    console.warn(
      `[ls-webhook] rejecting test_mode ${event} (subscription ${ids.subscriptionId ?? "unknown"}) — test events are not accepted in this environment`,
    );
    if (lsEventId) {
      try {
        await supabase.from("subscription_events").insert({
          ls_event_id: `test:${lsEventId}`,
          user_id,
          event_name: event,
          payload,
        });
      } catch (err) {
        console.error("[ls-webhook] test event audit insert failed:", err);
      }
    }
    return NextResponse.json({ received: true, ignored: "test_mode" });
  }

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

  // User association: checkout embeds the signed-in user's id in
  // meta.custom_data (never a frontend-supplied value). Verify the user still
  // exists so a stale/deleted id can't create a ghost row or grant Pro to an
  // account that no longer exists.
  const { data: account, error: accountError } =
    await supabase.auth.admin.getUserById(user_id);
  if (accountError || !account?.user) {
    console.warn(
      `[ls-webhook] ignoring ${event} (subscription ${ids.subscriptionId ?? "unknown"}) — user ${user_id} not found`,
    );
    return NextResponse.json({ received: true, ignored: "user" });
  }

  const attributes = dataRef.attributes ?? {};
  const status = attributes.status ?? null;
  const renewsAt = attributes.renews_at ?? null;
  const endsAt = attributes.ends_at ?? null;
  const occurrenceTs = parseOccurrenceTs(attributes.updated_at);
  const variantId =
    attributes.variant_id ??
    attributes.first_subscription_item?.variant_id ??
    attributes.first_order_item?.variant_id ??
    null;
  const billingInterval = custom.interval ?? null;
  const email = attributes.user_email;
  const eventVariant = variantId == null ? null : String(variantId);
  const proVariantEvent = isProVariantEvent(eventVariant);

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
      if (!proVariantEvent) {
        return ignoredVariant(event, ids.subscriptionId, eventVariant);
      }
      await applyPlanState(
        user_id,
        {
          plan: "pro",
          status: coerceStatus(status, "active"),
          renewsAt,
          endsAt,
          cancelAtPeriodEnd: false,
          variantId: eventVariant,
          billingInterval,
          ...ids,
        },
        occurrenceTs,
        event,
        ids.subscriptionId,
      );
      const mail = grantEmails[event];
      if (mail) await sendBestEffort(mail, email);
      return NextResponse.json({ received: true });
    }

    // --- Events that revoke Pro ---------------------------------------------
    // Variant validation applies to revocations too (P1-B): an expired, paused
    // or refunded event for any OTHER product or a one-time purchase must
    // never downgrade a paying Pro customer.
    if (event in revokeEmails) {
      if (!proVariantEvent) {
        return ignoredVariant(event, ids.subscriptionId, eventVariant);
      }
      await applyPlanState(
        user_id,
        {
          plan: "free",
          status: coerceStatus(status, "expired"),
          renewsAt: null,
          endsAt: status === "active" ? null : endsAt,
          cancelAtPeriodEnd: false,
          variantId: variantId == null ? null : String(variantId),
          billingInterval,
          ...ids,
        },
        occurrenceTs,
        event,
        ids.subscriptionId,
      );
      const mail = revokeEmails[event];
      if (mail) await sendBestEffort(mail, email);
      return NextResponse.json({ received: true });
    }

    // --- Cancellation: customer keeps Pro until the end of the paid period --
    if (event === "subscription_cancelled") {
      if (!proVariantEvent) {
        return ignoredVariant(event, ids.subscriptionId, eventVariant);
      }
      await applyPlanState(
        user_id,
        {
          plan: "pro",
          status: "cancelled",
          renewsAt: null,
          endsAt,
          cancelAtPeriodEnd: true,
          variantId: eventVariant,
          billingInterval,
          ...ids,
        },
        occurrenceTs,
        event,
        ids.subscriptionId,
      );
      await sendBestEffort("cancelled", email);
      return NextResponse.json({ received: true });
    }

    // --- Failed renewal: LS retries; keep Pro, mark past-due, notify -------
    if (event === "subscription_payment_failed") {
      if (!proVariantEvent) {
        return ignoredVariant(event, ids.subscriptionId, eventVariant);
      }
      await applyPlanState(
        user_id,
        {
          plan: await currentPlan(user_id),
          status: coerceStatus(status, "past_due"),
          renewsAt,
          endsAt: endsAt ?? null,
          cancelAtPeriodEnd: attributes.cancelled === true,
          variantId: eventVariant,
          billingInterval,
          ...ids,
        },
        occurrenceTs,
        event,
        ids.subscriptionId,
      );
      await sendBestEffort("payment_failed", email);
      return NextResponse.json({ received: true });
    }

    // --- Generic subscription state change ----------------------------------
    if (event === "subscription_updated") {
      if (!proVariantEvent) {
        return ignoredVariant(event, ids.subscriptionId, eventVariant);
      }
      if (status === "expired") {
        await applyPlanState(
          user_id,
          {
            plan: "free",
            status: "expired",
            renewsAt: null,
            endsAt: endsAt ?? null,
            cancelAtPeriodEnd: false,
            variantId: eventVariant,
            billingInterval,
            ...ids,
          },
          occurrenceTs,
          event,
          ids.subscriptionId,
        );
        await sendBestEffort("expired", email);
      } else if (status === "paused") {
        await applyPlanState(
          user_id,
          {
            plan: "free",
            status: "paused",
            renewsAt: null,
            endsAt: endsAt ?? null,
            cancelAtPeriodEnd: false,
            variantId: eventVariant,
            billingInterval,
            ...ids,
          },
          occurrenceTs,
          event,
          ids.subscriptionId,
        );
      } else {
        const retained = await currentPlan(user_id);
        const s = coerceStatus(status, "active");
        await applyPlanState(
          user_id,
          {
            plan: s === "cancelled" ? "pro" : retained,
            status: s,
            renewsAt,
            endsAt,
            cancelAtPeriodEnd:
              s === "cancelled" ? true : attributes.cancelled === true,
            variantId: eventVariant,
            billingInterval,
            ...ids,
          },
          occurrenceTs,
          event,
          ids.subscriptionId,
        );
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