import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientIp, hashIp } from "@/lib/client-ip";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Public widget endpoint limits. Generous per-visitor and global buckets: real
// embedded widgets share visitor IPs behind NATs and repeat requests are
// served from the CDN cache (Cache-Control below), while a hostile scraper
// cannot hammer the database. Bucket keys are SHA-256 hashes of the visitor IP
// (clientIp + hashIp, same helpers the signup routes use) — no raw IPs are
// ever stored in signup_rate_limits.
const WIDGET_IP_LIMIT = 60;
const WIDGET_IP_WINDOW_SECONDS = 60;
const WIDGET_GLOBAL_LIMIT = 3000;
const WIDGET_GLOBAL_WINDOW_SECONDS = 60;

async function withinRateLimits(
  supabase: SupabaseClient,
  buckets: { key: string; limit: number; windowSeconds: number }[],
): Promise<boolean> {
  for (const bucket of buckets) {
    const { data, error } = await supabase.rpc("rate_limit_take", {
      p_key: bucket.key,
      p_limit: bucket.limit,
      p_window_seconds: bucket.windowSeconds,
    });
    if (error) {
      // Fail-open: a rate-limit failure must never take a live widget down.
      console.error("[widget] rate limit rpc failed:", error);
      return true;
    }
    if (data !== true) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const widgetId = request.nextUrl.searchParams.get("widget_id");

  if (!widgetId) {
    return NextResponse.json(
      { error: "Missing widget_id parameter." },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Widget backend is not configured." },
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
  );

  const buckets = [
    {
      key: "widget:global",
      limit: WIDGET_GLOBAL_LIMIT,
      windowSeconds: WIDGET_GLOBAL_WINDOW_SECONDS,
    },
  ];
  const ip = clientIp(request.headers);
  if (ip) {
    buckets.push({
      key: `widget:ip:${hashIp(ip)}`,
      limit: WIDGET_IP_LIMIT,
      windowSeconds: WIDGET_IP_WINDOW_SECONDS,
    });
  }

  const allowed = await withinRateLimits(supabase, buckets);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { ...corsHeaders, "Retry-After": String(WIDGET_IP_WINDOW_SECONDS) },
      },
    );
  }

  const { data: summary, error } = await supabase
    .from("summaries")
    .select("title, reviews_count, keywords, positive_sentiment_pct, average_rating, analysis, created_at")
    .eq("widget_id", widgetId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load summary." },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!summary) {
    return NextResponse.json(
      { error: "Summary not found." },
      { status: 404, headers: corsHeaders },
    );
  }

  return NextResponse.json(summary, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
