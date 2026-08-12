import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

export async function POST(req: NextRequest) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: credits } = await supabase
    .from("user_credits")
    .select("ls_subscription_id, ls_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscriptionId = credits?.ls_subscription_id;
  const customerId = credits?.ls_customer_id;

  if (!subscriptionId && !customerId) {
    return NextResponse.json(
      { error: "No subscription found for this account." },
      { status: 404 },
    );
  }

  const headers = {
    Accept: "application/vnd.api+json",
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    let portalUrl: string | null = null;

    if (subscriptionId) {
      const response = await fetch(`${LS_API_BASE}/subscriptions/${subscriptionId}`, {
        headers,
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          data?: { attributes?: { urls?: { customer_portal?: string | null } } };
        };
        portalUrl = payload.data?.attributes?.urls?.customer_portal ?? null;
      }
    }

    if (!portalUrl && customerId) {
      const response = await fetch(`${LS_API_BASE}/customers/${customerId}`, {
        headers,
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          data?: { attributes?: { urls?: { customer_portal?: string | null } } };
        };
        portalUrl = payload.data?.attributes?.urls?.customer_portal ?? null;
      }
    }

    if (!portalUrl) {
      return NextResponse.json(
        { error: "No active subscription to manage." },
        { status: 404 },
      );
    }

    return NextResponse.json({ url: portalUrl });
  } catch (err) {
    console.error("Customer portal failed:", err);
    return NextResponse.json(
      { error: "Could not open the billing portal." },
      { status: 500 },
    );
  }
}