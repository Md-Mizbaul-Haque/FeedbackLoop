import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") ?? "https://api.groq.com/openai/v1";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "llama-3.3-70b-versatile";

const MIN_REVIEWS = 10;
const MAX_REVIEWS = 50;
const MAX_REVIEW_LENGTH = 1000;
const MAX_TOTAL_CHARS = 30000;

interface Keyword {
  label: string;
  count: number;
}

interface AnalysisResult {
  title: string;
  summary_points: string[];
  keywords: Keyword[];
  positive_sentiment_pct: number | null;
  average_rating: number | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseReviews(raw: unknown): { reviews: string[]; error?: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { reviews: [], error: "No reviews provided." };
  }

  const reviews = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (reviews.length < MIN_REVIEWS) {
    return {
      reviews: [],
      error: `Please provide at least ${MIN_REVIEWS} reviews (one per line). You entered ${reviews.length}.`,
    };
  }
  if (reviews.length > MAX_REVIEWS) {
    return {
      reviews: [],
      error: `Please provide at most ${MAX_REVIEWS} reviews. You entered ${reviews.length}.`,
    };
  }

  const totalChars = reviews.reduce((sum, r) => sum + r.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return {
      reviews: [],
      error: `Reviews are too long (max ${MAX_TOTAL_CHARS.toLocaleString()} characters total).`,
    };
  }
  if (reviews.some((r) => r.length > MAX_REVIEW_LENGTH)) {
    return {
      reviews: [],
      error: `Each review must be at most ${MAX_REVIEW_LENGTH} characters.`,
    };
  }

  return { reviews };
}

function extractJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM response did not contain JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function optionalPercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function optionalRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10));
}

function normalize(parsed: Record<string, unknown>, reviewCount: number): AnalysisResult {
  const rawPoints = parsed["summary_points"];
  const summaryPoints = Array.isArray(rawPoints)
    ? rawPoints
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim().slice(0, 200))
        .slice(0, 3)
    : [];
  while (summaryPoints.length < 3) {
    summaryPoints.push("Customers are overall satisfied with their experience.");
  }

  const rawKeywords = parsed["keywords"];
  const keywords: Keyword[] = Array.isArray(rawKeywords)
    ? rawKeywords
        .filter(
          (k): k is Record<string, unknown> =>
            typeof k === "object" && k !== null,
        )
        .map((k) => ({
          label: String(k["label"] ?? "")
            .trim()
            .slice(0, 60),
          count: clampInt(k["count"], 0, reviewCount, 0),
        }))
        .filter((k) => k.label.length > 0)
        .slice(0, 5)
    : [];
  if (keywords.length === 0) {
    keywords.push({ label: "Satisfied Customers", count: reviewCount });
  }

  const title =
    typeof parsed["title"] === "string" && parsed["title"].trim()
      ? parsed["title"].trim().slice(0, 120)
      : `Reviews Summary — ${new Date().toLocaleDateString()}`;
  const titlePoints = summaryPoints[0].slice(0, 40);
  const fallbackTitle = title === `Reviews Summary — ${new Date().toLocaleDateString()}`
    ? `Reviews Summary — "${titlePoints}..."`.slice(0, 120)
    : title;

  return {
    title: fallbackTitle,
    summary_points: summaryPoints,
    keywords: Array.from(
      new Map(keywords.map((k) => [k.label.toLowerCase(), k])).values(),
    ),
    positive_sentiment_pct: optionalPercent(parsed["positive_sentiment_pct"]),
    average_rating: optionalRating(parsed["average_rating"]),
  };
}

async function callLLM(reviews: string[]): Promise<AnalysisResult> {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY secret is not configured. Set it in Supabase Edge Function secrets.",
    );
  }

  const systemPrompt =
    "You are an expert customer reviews analyst. You analyze a batch of customer reviews and produce a structured summary. Respond ONLY with valid JSON — no markdown, no extra text.";

  const userPrompt = [
    "Reviews (one per line):",
    reviews.map((r) => `- ${r}`).join("\n"),
    "",
    "Produce JSON with exactly this shape:",
    '{"title":"a short catchy summary title (max 10 words)","summary_points":["exactly 3 concise bullet points (max ~20 words each) capturing the most common praise or themes across ALL reviews","...","..."],"keywords":[{"label":"frequently mentioned topic (1-5 words)","count":N}],"positive_sentiment_pct":N,"average_rating":N}',
    "",
    "Rules:",
    "- summary_points count must be 3.",
    "- keywords: top 3-5 most frequent topics; count = number of reviews mentioning it, must be plausible given " +
      `${reviews.length} reviews total (between 1 and ${reviews.length}).`,
    "- positive_sentiment_pct: integer 0-100 estimating % of reviews with positive sentiment.",
    "- average_rating: number 0-5 with one decimal, estimated from overall sentiment (4-5 positive, ~3 neutral, 1-2 negative).",
    "- Do not invent facts not supported by the reviews.",
  ].join("\n");

  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  return normalize(parsed, reviews.length);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const auth = req.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { reviews?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { reviews, error } = parseReviews(typeof body.reviews === "string" ? body.reviews : "");
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let analysis: AnalysisResult;
  try {
    analysis = await callLLM(reviews);
  } catch (err) {
    console.error("LLM call failed:", err);
    return new Response(
      JSON.stringify({ error: "AI analysis failed. Please try again." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: row, error: insertError } = await supabase
    .from("summaries")
    .insert({
      title: analysis.title,
      reviews_count: reviews.length,
      keywords: analysis.keywords,
      summary_points: analysis.summary_points,
      positive_sentiment_pct: analysis.positive_sentiment_pct,
      reviews: reviews.join("\n"),
    })
    .select("id, widget_id")
    .single();

  if (insertError) {
    console.error("Insert failed:", insertError);
    return new Response(
      JSON.stringify({ error: "Failed to save summary. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      widget_id: row.widget_id,
      reviews_count: reviews.length,
      ...analysis,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", Connection: "keep-alive" },
    },
  );
});