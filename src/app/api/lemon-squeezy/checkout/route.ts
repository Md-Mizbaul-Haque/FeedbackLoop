import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

// P2-4: the post-payment redirect must always point at a site we control.
// Only NEXT_PUBLIC_SITE_URL is trusted; the request Origin is never used in
// production, so a crafted Origin header cannot turn the checkout redirect
// into an open redirect. In development a loopback Origin is accepted as an
// explicit convenience so local testing keeps working without extra config.
export function trustedCheckoutSuccessUrl(originHeader: string | null): string | null {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `${parsed.origin}/pricing?checkout=success`;
      }
    } catch {
      // An invalid configured value must fail safe, never fall back.
    }
    return null;
  }

  if (process.env.NODE_ENV === "development") {
    const origin = (originHeader ?? "").trim().replace(/\/+$/, "");
    if (
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
    ) {
      return `${origin}/pricing?checkout=success`;
    }
  }
  return null;
}

function missingConfig(): boolean {
  return !(
    process.env.LEMONSQUEEZY_API_KEY &&
    process.env.LEMONSQUEEZY_STORE_ID &&
    process.env.LEMONSQUEEZY_PRO_VARIANT_ID
  );
}

export async function POST(req: NextRequest) {
  if (missingConfig()) {
    return NextResponse.json(
      { error: "Checkout is not configured yet." },
      { status: 500 },
    );
  }

  const interval = (await req.json().catch(() => ({})) as { interval?: string })
    .interval === "year"
    ? "year"
    : "month";

  const apiKey = process.env.LEMONSQUEEZY_API_KEY!;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID!;
  let variantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID!;
  if (interval === "year") {
    variantId = process.env.LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID ?? "";
    if (!variantId) {
      return NextResponse.json(
        { error: "The yearly plan is not configured yet." },
        { status: 500 },
      );
    }
  }
  const successUrl = trustedCheckoutSuccessUrl(req.headers.get("origin"));
  if (!successUrl) {
    return NextResponse.json(
      { error: "Checkout is not configured yet." },
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

  try {
    const response = await fetch(`${LS_API_BASE}/checkouts`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: { user_id: user.id, interval },
              email: user.email ?? undefined,
            },
            product_options: {
              enabled_variants: [variantId],
              redirect_url: successUrl,
            },
            checkout_options: {
              dark: false,
            },
          },
          relationships: {
            store: {
              data: { type: "stores", id: storeId },
            },
            variant: {
              data: { type: "variants", id: variantId },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Lemon Squeezy checkout error:", response.status, text);
      return NextResponse.json(
        { error: "Could not create checkout." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      data?: { attributes?: { url?: string } };
    };
    const url = payload.data?.attributes?.url;
    if (!url) {
      return NextResponse.json(
        { error: "Checkout URL missing." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      url,
      success_url: successUrl,
    });
  } catch (err) {
    console.error("Checkout failed:", err);
    return NextResponse.json(
      { error: "Could not create checkout." },
      { status: 500 },
    );
  }
}
