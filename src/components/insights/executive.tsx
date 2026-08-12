"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryModel } from "./data";
import { SEVERITY_RANK } from "./data";
import {
  AIBadge,
  EvidenceLine,
  NotEnoughEvidence,
  SectionHeading,
  SeverityBadge,
  SeverityDot,
} from "./ui";

function MetricTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "rating" | "positive" | "neutral" | "negative";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    rating: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    neutral: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  const Icon = icon;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 whitespace-nowrap text-2xl font-bold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
      <div className={cn("mt-2 h-1 w-10 rounded-full", tones[tone])} />
    </div>
  );
}

export function ExecutiveOverview({ model }: { model: SummaryModel }) {
  const satisfactionTone =
    model.satisfaction === "strong_positive" || model.satisfaction === "mostly_positive"
      ? "bg-emerald-500"
      : model.satisfaction === "mostly_negative" || model.satisfaction === "strong_negative"
        ? "bg-rose-500"
        : "bg-amber-500";

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Customer Feedback Overview"
          description="A snapshot of how customers responded to your product or service."
          actions={<AIBadge label="AI analysis" />}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{model.headline}</span>
          {model.themes.slice(0, 3).map((theme) => (
            <Badge
              key={theme.name}
              variant="outline"
              className="border-border bg-muted/40 text-xs font-medium"
            >
              {theme.name}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricTile
            icon={MessageSquareText}
            label="Reviews Analyzed"
            value={String(model.reviewsCount)}
            tone="primary"
          />
          <MetricTile
            icon={Star}
            label="AI Estimated Rating"
            value={model.rating != null ? `${model.rating} / 5` : "—"}
            sub="Estimated from tone, not stars"
            tone="rating"
          />
          <MetricTile
            icon={CheckCircle2}
            label="Positive"
            value={`${model.pcts.positive}%`}
            tone="positive"
          />
          <MetricTile
            icon={Star}
            label="Neutral"
            value={`${model.pcts.neutral}%`}
            tone="neutral"
          />
          <MetricTile
            icon={AlertTriangle}
            label="Negative"
            value={`${model.pcts.negative}%`}
            tone="negative"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", satisfactionTone)} />
            <span className="text-sm font-semibold">
              Overall: {model.satisfactionLabel}
            </span>
          </div>
          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className="bg-emerald-500"
              style={{ width: `${model.pcts.positive}%` }}
            />
            <div
              className="bg-sky-400"
              style={{ width: `${model.pcts.neutral}%` }}
            />
            <div
              className="bg-rose-500"
              style={{ width: `${model.pcts.negative}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {model.pcts.positive}% positive · {model.pcts.negative}% negative
          </span>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 dark:bg-rose-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Primary Issue
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {model.primaryIssue ?? "No single issue dominates the feedback."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExecutiveSummarySection({ model }: { model: SummaryModel }) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading title="AI Executive Summary" actions={<AIBadge />} />

        {model.hasExecutiveSummary ? (
          <p className="text-sm leading-relaxed text-foreground/90">
            {model.executiveSummary}
          </p>
        ) : model.summaryPoints.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              A narrative summary wasn&apos;t generated for this analysis. Key points:
            </p>
            <ul className="space-y-2.5">
              {model.summaryPoints.slice(0, 3).map((point, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/30 p-3"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <NotEnoughEvidence hint="Re-run the analysis to generate a concise executive summary." />
        )}

        <div className="border-t border-border/70 pt-4">
          <KeyFindings model={model} />
        </div>
      </CardContent>
    </Card>
  );
}

export function KeyFindings({ model }: { model: SummaryModel }) {
  if (!model.hasThemes) {
    return (
      <NotEnoughEvidence
        title="Not enough evidence for key findings"
        hint="Theme-level analysis was not included for this result."
      />
    );
  }

  const findings = [...model.findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.mentions - a.mentions,
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        Key Findings
      </h3>
      {findings.map((finding) => (
        <div
          key={finding.name}
          className="flex gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3.5"
        >
          <SeverityDot severity={finding.severity} className="mt-1.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{finding.name}</span>
              <SeverityBadge severity={finding.severity} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {finding.explanation ||
                "Frequently mentioned by customers in the submitted reviews."}
            </p>
            <EvidenceLine mentions={finding.mentions} total={model.reviewsCount} />
          </div>
        </div>
      ))}
    </div>
  );
}