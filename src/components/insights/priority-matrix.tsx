"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryModel } from "./data";
import type { Severity } from "./types";
import { AIBadge, NotEnoughEvidence, SectionHeading } from "./ui";

const SEVERITY_Y: Record<Severity, number> = { high: 82, medium: 52, low: 22 };
const SEVERITY_FILL: Record<Severity, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export function PriorityMatrix({ model }: { model: SummaryModel }) {
  if (!model.hasThemes) {
    return (
      <Card className="h-full">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <SectionHeading
            title="Priority Matrix"
            description="Plot themes by frequency and severity to see what to fix first."
          />
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="Theme-level analysis is required to build the priority matrix."
          />
        </CardContent>
      </Card>
    );
  }

  const themes = model.themes.slice(0, 6);

  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Priority Matrix"
          description="Where each theme sits on frequency vs. severity. High frequency + high severity should be fixed first."
          actions={<AIBadge label="AI analysis" />}
        />

        <div className="relative aspect-[16/11] w-full overflow-hidden rounded-xl border border-border bg-card">
          {/* quadrant dividers */}
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" />
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border/70" />

          {/* quadrant labels */}
          <span className="absolute right-2 top-2 text-[10px] font-medium text-rose-600/80 dark:text-rose-300/80">
            Fix immediately
          </span>
          <span className="absolute left-2 top-2 text-[10px] font-medium text-amber-600/80 dark:text-amber-300/80">
            Investigate
          </span>
          <span className="absolute bottom-2 right-2 text-[10px] font-medium text-amber-600/80 dark:text-amber-300/80">
            Monitor / improve
          </span>
          <span className="absolute bottom-2 left-2 text-[10px] font-medium text-muted-foreground/80">
            Low priority
          </span>

          {/* axis labels */}
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground">
            Frequency →
          </span>
          <span className="absolute left-1 top-1/2 origin-left -rotate-90 text-[10px] font-medium text-muted-foreground">
            Severity ↑
          </span>

          {/* theme dots */}
          {themes.map((theme, index) => {
            const x = Math.min(94, Math.max(6, theme.reviewsPct || 10));
            const y = SEVERITY_Y[theme.severity];
            return (
              <div
                key={`${theme.name}-${index}`}
                title={`${theme.name} — ${theme.mentions} mentions, ${theme.severity} severity`}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div
                  className={cn(
                    "h-3 w-3 rounded-full border-2 border-background shadow-sm",
                    SEVERITY_FILL[theme.severity],
                  )}
                />
              </div>
            );
          })}
        </div>

        <ul className="space-y-1.5">
          {themes.map((theme, index) => (
<li key={`${theme.name}-${index}`} className="flex min-w-0 items-center gap-2 text-xs text-foreground/80">
  <span className={cn("h-2 w-2 shrink-0 rounded-full", SEVERITY_FILL[theme.severity])} />
  <span className="min-w-0 truncate font-medium">{theme.name}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {theme.mentions} mentions · {theme.reviewsPct}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}