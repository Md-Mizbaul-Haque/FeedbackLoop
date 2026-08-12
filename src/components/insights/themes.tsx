"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareQuote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryModel } from "./data";
import { excerpt } from "./data";
import {
  AIBadge,
  EvidenceLine,
  NotEnoughEvidence,
  SectionHeading,
  SentimentBadge,
  SeverityBadge,
} from "./ui";

export function TopThemes({ model }: { model: SummaryModel }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!model.hasThemes) {
    return (
      <Card className="h-full">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <SectionHeading
            title="Top Customer Themes"
            description="Grouped topics across your reviews."
          />
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="Theme-level analysis was not included for this result."
          />
        </CardContent>
      </Card>
    );
  }

  const hasFallback = model.themes.some((theme) => theme.isFallback);

  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Top Customer Themes"
          description="Grouped topics across your reviews, ranked by frequency and severity."
          actions={<AIBadge label="AI analysis" />}
        />

        {hasFallback ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            This result predates theme-level analysis. Topics below are a
            keyword-frequency estimate, not AI-detected themes.
          </p>
        ) : null}

        <div className="space-y-3">
          {model.themes.map((theme, index) => {
            const open = openIndex === index;
            const support = theme.supportingIndexes.length
              ? theme.supportingIndexes.slice(0, 3).map((i) => model.reviewRecords[i]).filter(Boolean)
              : [];

            return (
              <div
                key={`${theme.name}-${index}`}
                className="rounded-xl border border-border/70 bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{theme.name}</span>
                    <SentimentBadge sentiment={theme.sentiment} className="shrink-0" />
                  </div>
                  <SeverityBadge severity={theme.severity} className="shrink-0" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <EvidenceLine mentions={theme.mentions} total={model.reviewsCount} />
                  <span className="text-xs text-muted-foreground">
                    {theme.reviewsPct}% of reviews
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {theme.explanation ||
                    "Customers mentioned this topic in their reviews."}
                </p>

                {support.length > 0 ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? null : index)}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                      aria-expanded={open}
                    >
                      <MessageSquareQuote className="h-3.5 w-3.5" />
                      Supporting reviews
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    {open ? (
                      <ul className="mt-2 space-y-2">
                        {support.map((record) => (
                          <li
                            key={record.index}
                            className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs leading-relaxed text-foreground/90"
                          >
                            &ldquo;{excerpt(record.text)}&rdquo;
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}