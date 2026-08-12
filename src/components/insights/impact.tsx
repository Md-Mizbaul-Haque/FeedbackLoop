"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryModel } from "./data";
import type { Severity } from "./types";
import { AIBadge, NotEnoughEvidence, SectionHeading } from "./ui";

const RISK_TONES: Record<Severity, string> = {
  high: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
};

function RiskBadge({ level, label }: { level: Severity; label: string }) {
  return (
    <Badge variant="outline" className={cn("border px-2 shrink-0", RISK_TONES[level])}>
      {label}
    </Badge>
  );
}

export function BusinessImpact({ model }: { model: SummaryModel }) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Business Impact"
          description="Potential consequences inferred from the reviews."
          actions={<AIBadge label="AI analysis" />}
        />

        {model.hasImpact ? (
          <>
            <ul className="space-y-3">
              {model.impact.map((item) => (
                <li
                  key={item.area}
                  className="rounded-xl border border-border/70 bg-card p-4"
                >
<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
  <div className="min-w-0 flex-1">
    <span className="text-sm font-semibold">{item.area}</span>
  </div>
  <RiskBadge level={item.risk} label={`${item.risk} risk`} />
</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              Impact is inferred from the submitted reviews and expressed with
              hedged language (&ldquo;may&rdquo;, &ldquo;could&rdquo;,
              &ldquo;appears&rdquo;) rather than stated as fact.
            </p>
          </>
        ) : (
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="Re-run the analysis to see potential business impact."
          />
        )}
      </CardContent>
    </Card>
  );
}

export function RecommendedActions({ model }: { model: SummaryModel }) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Recommended Actions"
          description="Prioritized, specific actions grounded in the review themes."
          actions={<AIBadge label="AI analysis" />}
        />

        {model.hasRecommendations ? (
          <ol className="space-y-4">
            {model.recommendations.map((rec) => (
              <li
                key={rec.priority}
                className="rounded-xl border border-border/70 bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {rec.priority}
                    </span>
                    <span className="text-sm font-semibold">{rec.title}</span>
                  </div>
                  <RiskBadge level={rec.impact} label={`${rec.impact} impact`} />
                </div>

                {rec.actions.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {rec.actions.map((action, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {rec.why ? (
                  <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/70">Why: </span>
                    {rec.why}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="Re-run the analysis to get actionable recommendations."
          />
        )}
      </CardContent>
    </Card>
  );
}