import type { ReactNode } from "react";
import { Inbox, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { severityLabel } from "./data";
import type { MixedSentiment, Severity } from "./types";

export function SentimentBadge({
  sentiment,
  className,
}: {
  sentiment: MixedSentiment;
  className?: string;
}) {
  const map: Record<MixedSentiment, string> = {
    positive:
      "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    neutral:
      "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
    negative:
      "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
    mixed:
      "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  };
  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
  return (
    <Badge variant="outline" className={cn("border px-2", map[sentiment], className)}>
      {label}
    </Badge>
  );
}

export function SeverityBadge({
  severity,
  label,
  className,
  tone = "severity",
}: {
  severity: Severity;
  label?: string;
  className?: string;
  tone?: "severity" | "impact";
}) {
  const map: Record<Severity, string> = {
    high: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
    medium: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
    low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  };
  const text =
    tone === "impact"
      ? `${severityLabel(severity)} impact`
      : `${severityLabel(severity)} priority`;
  return (
    <Badge variant="outline" className={cn("border px-2", map[severity], className)}>
      {label ?? text}
    </Badge>
  );
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  const map: Record<Severity, string> = {
    high: "bg-rose-500",
    medium: "bg-amber-500",
    low: "bg-emerald-500",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", map[severity], className)}
    />
  );
}

export function SectionHeading({
  title,
  badge,
  description,
  actions,
  className,
}: {
  title: string;
  badge?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {badge ? (
            <Badge variant="secondary" className="px-2 text-[10px] font-medium uppercase tracking-wide">
              {badge}
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EvidenceLine({
  mentions,
  total,
  className,
}: {
  mentions: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((mentions / total) * 100) : 0;
  return (
    <span className={cn("text-xs font-medium text-muted-foreground", className)}>
      {mentions} of {total} reviews · {pct}%
    </span>
  );
}

export function AIBadge({ label = "AI generated" }: { label?: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}

export function InlineEvidence({
  mentions,
  total,
  label,
}: {
  mentions: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.round((mentions / total) * 100) : 0;
  return (
    <p className="text-xs text-muted-foreground">
      {label ?? `${mentions} of ${total} reviews`}
      {total > 0 ? ` (${pct}%)` : ""} support this insight.
    </p>
  );
}

export function NotEnoughEvidence({
  title = "Not enough evidence",
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground/60" />
      <p className="mt-2 text-sm font-medium text-muted-foreground">{title}</p>
      {hint ? <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}