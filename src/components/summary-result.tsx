"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Trophy,
  Copy,
  Check,
  Sparkles,
  Heart,
  ShieldCheck,
  Plus,
  MessageSquareText,
  ThumbsUp,
  Star,
  ChevronDown,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SummaryKeyword {
  label: string;
  count: number;
}

export interface Summary {
  id: string;
  title: string;
  reviews_count: number;
  keywords: SummaryKeyword[];
  summary_points: string[];
  positive_sentiment_pct: number | null;
  average_rating: number | null;
  widget_id: string;
  reviews?: string | null;
  created_at: string;
}

export function SummaryResults({
  summary,
  onSave,
  saving = false,
}: {
  summary: Summary;
  onSave?: () => void;
  saving?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const snippetCode = `<div id="feedbackloop-widget" data-id="${summary.widget_id}"></div>\n<script src="${origin}/widget.js" async></script>`;

  const stats = [
    {
      label: "Reviews Analyzed",
      value: String(summary.reviews_count),
      icon: MessageSquareText,
      chipClasses: "bg-primary/10 text-primary",
      estimated: false,
    },
    ...(summary.positive_sentiment_pct != null
      ? [
          {
            label: "Positive Sentiment",
            value: `${summary.positive_sentiment_pct}%`,
            icon: ThumbsUp,
            chipClasses: "bg-emerald-500/10 text-emerald-600",
            estimated: true,
          },
        ]
      : []),
    ...(summary.average_rating != null
      ? [
          {
            label: "Estimated Rating",
            value: `${summary.average_rating} / 5`,
            icon: Star,
            chipClasses: "bg-amber-500/10 text-amber-600",
            estimated: true,
          },
        ]
      : []),
  ];

  const maxKeywordCount = Math.max(1, ...summary.keywords.map((k) => k.count));
  const keywords = summary.keywords.map((keyword) => ({
    ...keyword,
    width: `${Math.round((keyword.count / maxKeywordCount) * 100)}%`,
  }));

  const handleCopy = () => {
    navigator.clipboard.writeText(snippetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {summary.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what your customers are saying!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onSave ? (
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs"
              onClick={onSave}
              disabled={saving}
            >
              <Save />
              {saving ? "Saving..." : "Save Summary"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="border-border"
            nativeButton={false}
            render={<Link href="/" />}
          >
            <Plus />
            Create Another
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.chipClasses}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {stat.label}
                    {stat.estimated ? (
                      <span
                        className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                        title="AI-estimated from review sentiment, not a reported score"
                      >
                        AI est.
                      </span>
                    ) : null}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Summary & Sentiment Cards */}
        <div className="space-y-6 lg:col-span-7">
          {/* AI Summary (TL;DR) */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-base font-semibold text-primary">
                <Sparkles className="h-5 w-5" />
                <h2>AI Summary (TL;DR)</h2>
                <Badge variant="secondary" className="ml-auto">
                  AI Generated
                </Badge>
              </div>

              <div className="space-y-3">
                {summary.summary_points.map((point, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/40 p-4"
                  >
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-foreground/90">
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Sentiment Keywords */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h2>Top Sentiment Keywords</h2>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                The most frequently mentioned topics across your reviews
              </p>

              <div className="grid grid-cols-3 gap-3 md:gap-4">
                {keywords.map((keyword) => (
                  <div
                    key={keyword.label}
                    className="flex min-h-[120px] flex-col rounded-xl border border-primary/10 bg-secondary/60 p-3.5 md:p-4"
                  >
                    <span className="text-xs font-semibold leading-snug text-primary md:text-sm">
                      {keyword.label}
                    </span>
                    <span className="mt-1 text-xl font-bold tracking-tight md:text-2xl">
                      {keyword.count}
                    </span>
                    <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: keyword.width }}
                      />
                    </div>
                    <span className="mt-1.5 text-[10px] text-muted-foreground">
                      mentions
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Embeddable Widget & Preview */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardContent className="space-y-5 p-6">
              {/* Embed Code Section */}
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold">
                  Your Embeddable Widget
                </h3>
                <p className="text-xs text-muted-foreground">
                  Copy and paste this code into your website to show off your
                  customer love!
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 px-4 py-2.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Embed HTML
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Copy embed code"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
                  <code className="text-purple-300">
                    {`<div `}
                    <span className="text-sky-300">id</span>=
                    <span className="text-emerald-300">
                      &quot;feedbackloop-widget&quot;
                    </span>
                    <span className="text-sky-300"> data-id</span>=
                    <span className="text-emerald-300">
                      &quot;{summary.widget_id}&quot;
                    </span>
                    {`></div>\n`}
                    {`<script `}
                    <span className="text-sky-300"> src</span>=
                    <span className="text-emerald-300">
                      &quot;{origin}/widget.js&quot;
                    </span>
                    <span className="text-sky-300"> async</span>
                    {`></script>`}
                  </code>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </span>

                <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                    <span>What customers love</span>
                  </div>

                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {keywords.slice(0, 3).map((keyword) => (
                      <li key={keyword.label} className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{keyword.label}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-1 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    <span>Verified by FeedbackLoop</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Source Reviews */}
      {summary.reviews ? (
        <Card className="border border-border shadow-xs rounded-xl">
          <CardContent className="p-6">
            <button
              type="button"
              onClick={() => setShowReviews((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
              aria-expanded={showReviews}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">
                  Source Reviews
                </h2>
                <Badge variant="secondary">
                  {summary.reviews.split("\n").filter(Boolean).length} reviews
                </Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  showReviews ? "rotate-180" : ""
                }`}
              />
            </button>

            {showReviews ? (
              <ol className="mt-4 max-h-96 space-y-2.5 overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-4">
                {summary.reviews
                  .split("\n")
                  .filter(Boolean)
                  .map((review, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 rounded-lg bg-white p-3 text-sm text-foreground/90 border border-border/60"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-primary">
                        {index + 1}
                      </span>
                      <span>{review}</span>
                    </li>
                  ))}
              </ol>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
