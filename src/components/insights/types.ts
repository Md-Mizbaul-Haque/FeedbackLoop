export type Sentiment = "positive" | "neutral" | "negative";
export type MixedSentiment = Sentiment | "mixed";
export type Severity = "high" | "medium" | "low";

export interface Keyword {
  label: string;
  count: number;
}

export interface ThemeInsight {
  name: string;
  sentiment: MixedSentiment;
  mentions: number;
  severity: Severity;
  explanation: string;
}

export interface ImpactItem {
  area: string;
  risk: Severity;
  summary: string;
}

export interface Recommendation {
  priority: number;
  title: string;
  impact: Severity;
  actions: string[];
  why: string;
}

export interface ReviewClassification {
  i: number;
  s: Sentiment;
  t: number[];
}

export interface SentimentSummary {
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  primary_issue: string | null;
  interpretation: string;
}

export interface AnalysisInsights {
  version: 2;
  title: string;
  executive_summary: string;
  sentiment: SentimentSummary;
  rating: { estimated: number | null };
  themes: ThemeInsight[];
  impact: ImpactItem[];
  recommendations: Recommendation[];
  reviews: ReviewClassification[];
}

/** The shape of a row in the `summaries` table. */
export interface SummaryRow {
  id: string;
  title: string;
  reviews_count: number;
  keywords: Keyword[] | null;
  summary_points: string[] | null;
  positive_sentiment_pct: number | null;
  average_rating: number | null;
  reviews: string | null;
  widget_id: string;
  analysis: unknown;
  created_at: string;
}