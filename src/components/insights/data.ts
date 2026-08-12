import type {
  AnalysisInsights,
  ImpactItem,
  Keyword,
  Recommendation,
  Sentiment,
  Severity,
  SentimentSummary,
  SummaryRow,
  ThemeInsight,
} from "./types";

// ---------------------------------------------------------------------------
// Small parse helpers (tolerant of jsonb / nested-object input)
// ---------------------------------------------------------------------------

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Math.round(asNumber(value, fallback))));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const SENTIMENTS: readonly Sentiment[] = ["positive", "neutral", "negative"];
const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

// ---------------------------------------------------------------------------
// Analysis parsing
// ---------------------------------------------------------------------------

export function parseAnalysis(raw: unknown): AnalysisInsights | null {
  const source = isObj(raw) ? raw : {};
  const themes: ThemeInsight[] = [];
  if (Array.isArray(source["themes"])) {
    for (const rawTheme of source["themes"]) {
      if (themes.length >= 6) break;
      if (!isObj(rawTheme)) continue;
      const name = asText(rawTheme["name"], 60);
      if (!name) continue;
      themes.push({
        name,
        sentiment: pick(
          rawTheme["sentiment"],
          ["positive", "neutral", "negative", "mixed"],
          "neutral",
        ),
        mentions: clampInt(rawTheme["mentions"], 0, 100000, 0),
        severity: pick(rawTheme["severity"], SEVERITIES, "low"),
        explanation: asText(rawTheme["explanation"], 260),
      });
    }
  }

  const impact: ImpactItem[] = [];
  if (Array.isArray(source["impact"])) {
    for (const rawItem of source["impact"]) {
      if (impact.length >= 4) break;
      if (!isObj(rawItem)) continue;
      const area = asText(rawItem["area"], 60);
      const summary = asText(rawItem["summary"], 280);
      if (!area || !summary) continue;
      impact.push({
        area,
        risk: pick(rawItem["risk"], SEVERITIES, "medium"),
        summary,
      });
    }
  }

  const recommendations: Recommendation[] = [];
  if (Array.isArray(source["recommendations"])) {
    for (const raw of source["recommendations"]) {
      if (recommendations.length >= 3) break;
      if (!isObj(raw)) continue;
      const title = asText(raw["title"], 80);
      if (!title) continue;
      const actions = Array.isArray(raw["actions"])
        ? raw["actions"]
            .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
            .map((a) => a.trim().slice(0, 160))
            .slice(0, 4)
        : [];
      recommendations.push({
        priority: recommendations.length + 1,
        title,
        impact: pick(raw["impact"], SEVERITIES, "medium"),
        actions,
        why: asText(raw["why"], 240),
      });
    }
  }

  const rawSentiment = isObj(source["sentiment"]) ? source["sentiment"] : {};
  const sentiment: SentimentSummary = {
    positive_pct: clampInt(rawSentiment["positive_pct"], 0, 100, 0),
    neutral_pct: clampInt(rawSentiment["neutral_pct"], 0, 100, 0),
    negative_pct: clampInt(rawSentiment["negative_pct"], 0, 100, 0),
    primary_issue: asText(rawSentiment["primary_issue"], 120) || null,
    interpretation: asText(rawSentiment["interpretation"], 360),
  };

  const rawRating = isObj(source["rating"]) ? source["rating"] : {};
  const estimated = Number(rawRating["estimated"]);
  const rating = Number.isFinite(estimated)
    ? Math.min(5, Math.max(0, Math.round(estimated * 10) / 10))
    : null;

  const reviewRecords: { i: number; s: Sentiment; t: number[] }[] = [];
  if (Array.isArray(source["reviews"])) {
    const seen = new Set<number>();
    for (const raw of source["reviews"]) {
      if (!isObj(raw)) continue;
      const i = clampInt(raw["i"], 0, 1_000_000, -1);
      if (i < 0 || seen.has(i)) continue;
      seen.add(i);
      const t = Array.isArray(raw["t"])
        ? Array.from(
            new Set(
              raw["t"]
                .map((idx) => clampInt(idx, 0, Math.max(0, themes.length - 1), -1))
                .filter((idx) => idx >= 0),
            ),
          ).slice(0, 6)
        : [];
      reviewRecords.push({
        i,
        s: pick(raw["s"], SENTIMENTS, "neutral"),
        t,
      });
    }
  }

  if (themes.length === 0 && reviewRecords.length === 0 && !asText(source["executive_summary"])) {
    return null;
  }

  return {
    version: 2,
    title: asText(source["title"], 120) || asText(source["executive_summary"], 60),
    executive_summary: asText(source["executive_summary"], 800),
    sentiment,
    rating: { estimated: rating },
    themes,
    impact,
    recommendations,
    reviews: reviewRecords,
  };
}

// ---------------------------------------------------------------------------
// Legacy lexicon classifier (fallback for summaries without a rich analysis)
// ---------------------------------------------------------------------------

const POSITIVE_TERMS = new Set([
  "great", "love", "loved", "loves", "best", "amazing", "excellent", "awesome",
  "perfect", "recommend", "recommended", "satisfied", "fantastic", "beautiful",
  "easy", "fast", "quick", "nice", "happy", "wonderful", "friendly", "helpful",
  "responsive", "quality", "worth", "impressed", "clean", "fresh", "delicious",
  "kind", "supportive", "positive", "highly", "superb", "outstanding", "gorgeous",
  "comfortable", "convenient", "affordable", "durable", "reliable", "smooth",
  "seamless", "prompt", "polite", "exceeded", "impressive", "solid", "reliable",
]);

const NEGATIVE_TERMS = new Set([
  "bad", "worst", "terrible", "awful", "poor", "horrible", "disappointed",
  "disappointing", "waste", "broken", "damaged", "late", "delay", "delayed",
  "missing", "wrong", "complaint", "complaints", "issue", "issues", "problem",
  "problems", "slow", "rudely", "rude", "unprofessional", "unhelpful", "defective",
  "mold", "spoiled", "rotten", "stale", "smell", "sour", "scratched", "scratch",
  "scratching", "refund", "refunded", "canceled", "cancelled", "scam", "frustrating",
  "dirty", "overpriced", "uncomfortable", "unhappy", "upset", "angry", "gross",
  "bruised", "bruising", "expired", "leak", "leaking", "cold", "melted",
]);

const NEGATORS = new Set([
  "not", "no", "never", "hardly", "barely", "n't", "don't", "dont", "doesn't",
  "doesnt", "didn't", "didnt", "isn't", "isnt", "wasn't", "wasnt", "won't",
  "wont", "can't", "cant", "cannot", "without",
]);

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Deterministic, lexicon-based sentiment guess used only when no LLM
 * classification exists. Never used when rich analysis is present. */
export function classifyReviewLexicon(text: string): Sentiment {
  const words = splitWords(text);
  let score = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    let value = 0;
    if (POSITIVE_TERMS.has(word)) value = 1;
    else if (NEGATIVE_TERMS.has(word)) value = -1;

    if (value !== 0) {
      const prev = words[i - 1];
      if (prev && NEGATORS.has(prev)) value = -value;
      score += value;
    }
  }
  if (score > 0.75) return "positive";
  if (score < -0.75) return "negative";
  return "neutral";
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "has", "had",
  "was", "were", "are", "but", "not", "you", "your", "they", "them", "their",
  "there", "then", "than", "its", "it's", "our", "will", "would", "could",
  "should", "been", "being", "very", "really", "just", "about", "were", "because",
  "out", "get", "got", "one", "two", "three", "some", "more", "most", "other",
  "what", "when", "where", "which", "while", "into", "over", "after", "before",
  "thing", "things", "time", "also", "can", "do", "does", "did", "so", "up",
]);

/** Fallback "topics" derived from frequent terms — only used in legacy mode.
 * Labelled as keyword-frequency, never confused with LLM themes. */
interface FallbackTopic {
  name: string;
  mentions: number;
  sentiment: Sentiment | "mixed";
  severity: Severity;
  explanation: string;
  supportingIndexes: number[];
}

function fallbackTopics(reviews: string[]): FallbackTopic[] {
  const mentions = new Map<string, { count: number; sentiment: Sentiment[]; indexes: number[] }>();
  for (let r = 0; r < reviews.length; r += 1) {
    const review = reviews[r];
    const words = splitWords(review);
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i += 1) {
      const candidates: string[] = [];
      const word = words[i];
      if (word.length >= 4 && !STOPWORDS.has(word)) candidates.push(word);
      if (i < words.length - 1) {
        const pair = `${word} ${words[i + 1]}`;
        if (word.length >= 3 && words[i + 1].length >= 3 && !STOPWORDS.has(word)) {
          candidates.push(pair);
        }
      }
      for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        const entry = mentions.get(candidate) ?? { count: 0, sentiment: [], indexes: [] };
        entry.count += 1;
        entry.sentiment.push(classifyReviewLexicon(review));
        entry.indexes.push(r);
        mentions.set(candidate, entry);
      }
    }
  }

  const minMentions = Math.max(2, Math.ceil(reviews.length * 0.1));
  return Array.from(mentions.entries())
    .filter(([, v]) => v.count >= minMentions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, value]) => {
      const pos = value.sentiment.filter((s) => s === "positive").length;
      const neg = value.sentiment.filter((s) => s === "negative").length;
      const sentiment: Sentiment | "mixed" =
        pos > 0 && neg > 0
          ? "mixed"
          : pos > neg
            ? "positive"
            : neg > pos
              ? "negative"
              : "neutral";
      return {
        name,
        mentions: value.count,
        sentiment,
        severity: "low" as const,
        explanation:
          "Frequently mentioned in the submitted reviews. Re-run the analysis for theme-level detail.",
        supportingIndexes: value.indexes,
      };
    });
}

/** Keyword label -> customer-facing topic name, so legacy summaries keep
 * meaningful theme names (e.g. "freshness" -> "Product freshness"). */
const KEYWORD_TOPIC_NAMES: Record<string, string> = {
  freshness: "Product freshness",
  fresh: "Product freshness",
  mold: "Product freshness",
  moldy: "Product freshness",
  spoiled: "Product freshness",
  stale: "Product freshness",
  quality: "Product quality",
  delivery: "Delivery reliability",
  shipping: "Delivery reliability",
  shipment: "Delivery reliability",
  timing: "Delivery reliability",
  arrive: "Delivery reliability",
  arrived: "Delivery reliability",
  order: "Order fulfillment",
  orders: "Order fulfillment",
  fulfillment: "Order fulfillment",
  missing: "Order fulfillment",
  incorrect: "Order fulfillment",
  wrong: "Order fulfillment",
  packaging: "Packaging quality",
  package: "Packaging quality",
  packed: "Packaging quality",
  support: "Support quality",
  customer: "Support quality",
  service: "Support quality",
  refund: "Support quality",
  taste: "Taste quality",
  flavor: "Taste quality",
  price: "Pricing",
  pricing: "Pricing",
  cost: "Pricing",
  speed: "Speed",
};

function humanizeTopicName(label: string): string {
  const mapped = KEYWORD_TOPIC_NAMES[label.trim().toLowerCase()];
  if (mapped) return mapped;
  const words = label
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 3);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return name || "Top mention";
}

/** Fallback topics derived from the summary's keyword list (legacy analyses).
 * Keyword frequency labels are mapped to stable, customer-facing topic names. */
function topicsFromKeywords(
  keywords: Keyword[],
  reviewsText: string[],
  total: number,
): FallbackTopic[] {
  const topics: FallbackTopic[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    if (topics.length >= 6) break;
    const name = humanizeTopicName(keyword.label);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const mentions = clampInt(keyword.count, 0, total, 0);
    if (mentions <= 0) continue;
    seen.add(key);

    const term = keyword.label.toLowerCase();
    const containing: number[] = [];
    for (let i = 0; i < reviewsText.length; i += 1) {
      if (splitWords(reviewsText[i]).includes(term)) containing.push(i);
    }
    const lex = containing.map((i) => classifyReviewLexicon(reviewsText[i]));
    const pos = lex.filter((s) => s === "positive").length;
    const neg = lex.filter((s) => s === "negative").length;
    const sentiment: Sentiment | "mixed" =
      pos > 0 && neg > 0
        ? "mixed"
        : pos > neg
          ? "positive"
          : neg > pos
            ? "negative"
            : "neutral";

    topics.push({
      name,
      mentions,
      sentiment,
      severity: "low",
      explanation:
        "Frequently mentioned in the submitted reviews. Re-run the analysis for theme-level detail.",
      supportingIndexes: containing,
    });
  }
  return topics;
}

// ---------------------------------------------------------------------------
// Derived model
// ---------------------------------------------------------------------------

export type DominantMix = Sentiment | "mixed";
export type Satisfaction = "strong_positive" | "mostly_positive" | "mixed" | "mostly_negative" | "strong_negative";

export interface ReviewRecord {
  index: number;
  text: string;
  sentiment: Sentiment;
  themes: number[];
  severity: Severity | null;
}

export interface ThemeDisplay extends ThemeInsight {
  mentions: number;
  reviewsPct: number;
  supportingIndexes: number[];
  isFallback?: boolean;
}

export interface SummaryModel {
  id: string;
  title: string;
  reviewsCount: number;
  keywords: Keyword[];
  summaryPoints: string[];
  widgetId: string;
  createdAt: string;
  reviewsText: string[];
  analysis: AnalysisInsights | null;
  reviewRecords: ReviewRecord[];
  counts: Record<Sentiment, number>;
  pcts: Record<Sentiment, number>;
  dominant: DominantMix;
  headline: string;
  satisfaction: Satisfaction;
  satisfactionLabel: string;
  themes: ThemeDisplay[];
  findings: ThemeDisplay[];
  primaryIssue: string | null;
  interpretation: string;
  executiveSummary: string;
  impact: ImpactItem[];
  recommendations: Recommendation[];
  rating: number | null;
  hasExecutiveSummary: boolean;
  hasThemes: boolean;
  hasImpact: boolean;
  hasRecommendations: boolean;
}

export const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export function severityLabel(severity: Severity): string {
  return severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
}

export function dominantSentiment(
  positive: number,
  neutral: number,
  negative: number,
): DominantMix {
  const margin = 15;
  if (positive >= Math.max(neutral, negative) + margin && positive >= 40) return "positive";
  if (negative >= Math.max(neutral, positive) + margin && negative >= 40) return "negative";
  if (neutral >= positive + margin && neutral >= negative + margin && neutral >= 50) {
    return "neutral";
  }
  return "mixed";
}

export function headlineFor(dominant: DominantMix, negativePct: number): string {
  if (dominant === "positive") return "What customers love";
  if (dominant === "negative") return "What customers dislike";
  if (dominant === "mixed" && negativePct >= 40) return "What customers say";
  if (dominant === "neutral") return "Customer feedback";
  return "What customers say";
}

export function satisfactionFor(positive: number, negative: number): { label: Satisfaction; text: string } {
  if (negative >= 65) return { label: "mostly_negative", text: "Mostly negative" };
  if (positive <= 15 && negative >= 40) return { label: "mostly_negative", text: "Mostly negative" };
  if (positive >= 65) return { label: "strong_positive", text: "Strongly positive" };
  if (positive >= 45 && negative <= 25) return { label: "mostly_positive", text: "Mostly positive" };
  if (positive >= 45 && positive >= negative) return { label: "mostly_positive", text: "Mostly positive" };
  if (negative >= 40) return { label: "mostly_negative", text: "Mostly negative" };
  return { label: "mixed", text: "Mixed feedback" };
}

export function excerpt(text: string, max = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 40 ? cut.slice(0, lastSpace) : cut}…`;
}

export function buildSummaryModel(summary: SummaryRow): SummaryModel {
  const reviewsText = summary.reviews
    ? summary.reviews.split("\n").map((r) => r.trim()).filter(Boolean)
    : [];
  const analysis = parseAnalysis(summary.analysis);
  const keywords: Keyword[] = Array.isArray(summary.keywords)
    ? summary.keywords
        .filter((k): k is Keyword => isObj(k))
        .map((k) => ({
          label: typeof k.label === "string" ? k.label.slice(0, 60) : "",
          count: clampInt(k.count, 0, summary.reviews_count, 0),
        }))
        .filter((k) => k.label && k.count > 0)
    : [];
  const summaryPoints = Array.isArray(summary.summary_points)
    ? summary.summary_points.filter((p): p is string => typeof p === "string")
    : [];

  // --- Review level classification -----------------------------------------
  let reviewRecords: ReviewRecord[];
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };

  const classifiedByLlama = analysis !== null && analysis.reviews.length > 0;
  if (classifiedByLlama) {
    const byIndex = new Map(analysis.reviews.map((r) => [r.i, r]));
    reviewRecords = reviewsText.map((text, index) => {
      const c = byIndex.get(index);
      const sentiment = c ? c.s : "neutral";
      counts[sentiment] += 1;
      return {
        index,
        text,
        sentiment,
        themes: c ? c.t : [],
        severity: null,
      };
    });
  } else if (reviewsText.length > 0) {
    reviewRecords = reviewsText.map((text, index) => {
      const sentiment = classifyReviewLexicon(text);
      counts[sentiment] += 1;
      return { index, text, sentiment, themes: [], severity: null };
    });
  } else {
    reviewRecords = [];
  }

  // --- Sentiment percentages -------------------------------------------------
  const n = Math.max(1, reviewRecords.length || summary.reviews_count);
  let pcts: Record<Sentiment, number>;
  if (classifiedByLlama || reviewRecords.length > 0) {
    pcts = {
      positive: Math.round((counts.positive / n) * 100),
      neutral: Math.round((counts.neutral / n) * 100),
      negative: Math.round((counts.negative / n) * 100),
    };
  } else if (analysis) {
    pcts = {
      positive: analysis.sentiment.positive_pct,
      neutral: analysis.sentiment.neutral_pct,
      negative: analysis.sentiment.negative_pct,
    };
  } else {
    const pos = summary.positive_sentiment_pct ?? 0;
    pcts = { positive: pos, neutral: 0, negative: 0 };
  }

  const dominant = dominantSentiment(pcts.positive, pcts.neutral, pcts.negative);
  const headline = headlineFor(dominant, pcts.negative);
  const satisfaction = satisfactionFor(pcts.positive, pcts.negative);

  // --- Themes ---------------------------------------------------------------
  const themes: ThemeDisplay[] = (analysis?.themes ?? []).map((t, index) => {
    const supportingIndexes = classifiedByLlama
      ? reviewRecords.filter((r) => r.themes.includes(index)).map((r) => r.index)
      : [];
    const mentions =
      supportingIndexes.length > 0 ? supportingIndexes.length : Math.min(t.mentions, n);
    return {
      ...t,
      mentions,
      reviewsPct: Math.round((mentions / n) * 100),
      supportingIndexes,
    };
  });

  if (themes.length === 0 && reviewsText.length > 0) {
    const fallback = keywords.length > 0
      ? topicsFromKeywords(keywords, reviewsText, n)
      : fallbackTopics(reviewsText);
    for (const topic of fallback) {
      themes.push({
        name: topic.name,
        sentiment: topic.sentiment,
        mentions: topic.mentions,
        severity: topic.severity,
        explanation: topic.explanation,
        reviewsPct: Math.round((topic.mentions / n) * 100),
        supportingIndexes: topic.supportingIndexes,
        isFallback: true,
      });
    }
  }

  const hasThemes = themes.length > 0;
  const findings = [...themes]
    .sort(
      (a, b) =>
        b.mentions - a.mentions ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    )
    .slice(0, 3);

  // Severity per review (from themes) for the review breakdown sort.
  if (classifiedByLlama) {
    for (const record of reviewRecords) {
      let max = -1;
      for (const themeIdx of record.themes) {
        const theme = themes[themeIdx];
        if (theme) max = Math.max(max, SEVERITY_RANK[theme.severity]);
      }
      record.severity =
        max >= 0 ? (max === 2 ? "high" : max === 1 ? "medium" : "low") : null;
    }
  }

  const impact = analysis?.impact ?? [];
  const recommendations = analysis?.recommendations ?? [];
  const primaryIssue =
    analysis?.sentiment.primary_issue ??
    (dominant === "negative" && findings[0] ? findings[0].name : null);
  const interpretation =
    analysis?.sentiment.interpretation ||
    (dominant === "negative"
      ? "Customer sentiment is largely negative. Most complaints relate to the issues highlighted below."
      : dominant === "positive"
        ? "Customer sentiment is positive overall, with satisfaction driven by the themes highlighted below."
        : "Customer sentiment is mixed. Feedback covers both positive and negative experiences.");

  return {
    id: summary.id,
    title: summary.title || summaryPoints[0] || "Customer Feedback Analysis",
    reviewsCount: summary.reviews_count,
    keywords,
    summaryPoints,
    widgetId: summary.widget_id,
    createdAt: summary.created_at,
    reviewsText,
    analysis,
    reviewRecords,
    counts,
    pcts,
    dominant,
    headline,
    satisfaction: satisfaction.label,
    satisfactionLabel: satisfaction.text,
    themes,
    findings,
    primaryIssue,
    interpretation,
    executiveSummary: analysis?.executive_summary ?? "",
    impact,
    recommendations,
    rating: analysis?.rating.estimated ?? (summary.average_rating ?? null),
    hasExecutiveSummary: Boolean(analysis?.executive_summary),
    hasThemes,
    hasImpact: impact.length > 0,
    hasRecommendations: recommendations.length > 0,
  };
}