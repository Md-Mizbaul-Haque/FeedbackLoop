"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { SummaryModel } from "./data";
import { AIBadge, NotEnoughEvidence, SectionHeading } from "./ui";

export function SentimentDistribution({ model }: { model: SummaryModel }) {
  const rows = [
    {
      label: "Positive",
      pct: model.pcts.positive,
      bar: "bg-emerald-500",
      value: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Neutral",
      pct: model.pcts.neutral,
      bar: "bg-sky-400",
      value: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Negative",
      pct: model.pcts.negative,
      bar: "bg-rose-500",
      value: "text-rose-600 dark:text-rose-400",
    },
  ];
  const total = model.pcts.positive + model.pcts.neutral + model.pcts.negative;

  return (
    <Card className="h-full">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <SectionHeading
          title="Sentiment Distribution"
          description="The share of reviews classified by tone."
          actions={<AIBadge label="AI analysis" />}
        />

        {total > 0 ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-border">
              {rows.map((row) =>
                row.pct > 0 ? (
                  <div
                    key={row.label}
                    className={row.bar}
                    style={{ width: `${row.pct}%` }}
                  />
                ) : null,
              )}
            </div>

            <div className="space-y-2.5">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-medium text-foreground/80">
                    {row.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full ${row.bar}`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                  <span className={`w-12 shrink-0 text-right text-xs font-semibold ${row.value}`}>
                    {row.pct}%
                  </span>
                </div>
              ))}
            </div>

            {model.interpretation ? (
              <p className="border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
                {model.interpretation}
              </p>
            ) : null}
          </>
        ) : (
          <NotEnoughEvidence hint="Sentiment could not be derived for this result." />
        )}
      </CardContent>
    </Card>
  );
}