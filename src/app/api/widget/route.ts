import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientIp, hashIp } from "@/lib/client-ip";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// widget_id is a UUID (crypto.randomUUID) or a legacy numeric fallback string.
// Reject anything longer or containing characters that are not URL/attribute
// safe, so a crafted id can neither bloat the indexed equality lookup nor
// break out of the embed snippet's data-id attribute.
const WIDGET_ID_RE = /^[A-Za-z0-9._:-]+$/;
const WIDGET_ID_MAX = 64;

// The public endpoint returns exactly what public/widget.js renders — nothing
// more. The full `analysis` jsonb contains AI prose that can quote review
// text, so it is never shipped to embedding sites; only the fields the widget
// actually reads are projected here.
function projectWidgetResponse(summary: {
  title: string;
  reviews_count: number;
  keywords: unknown;
  positive_sentiment_pct: number;
  analysis: {
    themes?: { name?: string; mentions?: number }[];
    sentiment?: {
      positive_pct?: number | null;
      neutral_pct?: number | null;
      negative_pct?: number | null;
    };
  } | null;
  created_at: string;
}) {
  const themes = Array.isArray(summary.analysis?.themes)
    ? summary.analysis.themes.map((t) => ({
        name: typeof t.name === "string" ? t.name : "",
        mentions: typeof t.mentions === "number" ? t.mentions : 0,
      }))
    : [];
  const sentiment = summary.analysis?.sentiment;
  return {
    title: summary.title,
    reviews_count: summary.reviews_count,
    keywords: summary.keywords,
    positive_sentiment_pct: summary.positive_sentiment_pct,
    analysis: {
      themes,
      sentiment: {
        positive_pct: sentiment?.positive_pct ?? null,
        neutral_pct: sentiment?.neutral_pct ?? null,
        negative_pct: sentiment?.negative_pct ?? null,
      },
    },
    created_at: summary.created_at,
  };
}

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

  if (!WIDGET_ID_RE.test(widgetId) || widgetId.length > WIDGET_ID_MAX) {
    return NextResponse.json(
      { error: "Invalid widget_id parameter." },
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

  return NextResponse.json(projectWidgetResponse(summary), {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
