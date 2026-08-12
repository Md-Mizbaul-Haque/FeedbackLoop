"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSummaryModel } from "@/components/insights/data";
import type { SummaryRow } from "@/components/insights/types";
import { ExecutiveOverview, ExecutiveSummarySection } from "@/components/insights/executive";
import { SentimentDistribution } from "@/components/insights/sentiment";
import { TopThemes } from "@/components/insights/themes";
import { PriorityMatrix } from "@/components/insights/priority-matrix";
import { BusinessImpact, RecommendedActions } from "@/components/insights/impact";
import { CustomerVoice, ReviewBreakdown } from "@/components/insights/customer-voice";
import { WidgetSection } from "@/components/insights/widget-section";

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
  analysis?: unknown;
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
  const model = useMemo(() => buildSummaryModel(summary as SummaryRow), [summary]);
  const breakdownRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    sentiment: "positive" | "neutral" | "negative" | "all";
    nonce: number;
  } | null>(null);

  const handleViewAll = (
    sentiment: "positive" | "neutral" | "negative" | "all",
  ) => {
    setFocusRequest((prev) => ({
      sentiment,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    requestAnimationFrame(() => {
      breakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {model.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {model.reviewsCount} customer reviews analyzed. {model.satisfactionLabel}{" "}
            overall.
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

      <ExecutiveOverview model={model} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ExecutiveSummarySection model={model} />
        </div>
        <div className="lg:col-span-5">
          <SentimentDistribution model={model} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <TopThemes model={model} />
        </div>
        <div className="lg:col-span-5">
          <BusinessImpact model={model} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RecommendedActions model={model} />
        </div>
        <div className="lg:col-span-5">
          <PriorityMatrix model={model} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <CustomerVoice model={model} onViewAll={handleViewAll} />
        </div>
        <div className="lg:col-span-7">
          <div ref={breakdownRef}>
            <ReviewBreakdown
              key={`breakdown-${focusRequest?.nonce ?? 0}`}
              model={model}
              initialSentiment={focusRequest?.sentiment ?? "all"}
            />
          </div>
        </div>
      </div>

      <WidgetSection model={model} />
    </div>
  );
}