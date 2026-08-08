import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  const { data: summary, error } = await supabase
    .from("summaries")
    .select("title, reviews_count, keywords, positive_sentiment_pct, average_rating, created_at")
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
