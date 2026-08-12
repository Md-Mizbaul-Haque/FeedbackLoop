"use client";

import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryModel } from "./data";
import { dominantSentiment } from "./data";
import { SectionHeading } from "./ui";

export interface WidgetContent {
  header: string;
  subtitle?: string;
  items: string[];
}

/** Deterministic widget copy that adapts to the actual sentiment data.
 * Mirrored by public/widget.js so the preview matches the real widget. */
export function widgetContent(model: SummaryModel): WidgetContent {
  const themes = [...model.themes].sort((a, b) => b.mentions - a.mentions).slice(0, 3);
  const items = themes.length
    ? themes.map((theme) => theme.name)
    : model.keywords.slice(0, 3).map((keyword) => keyword.label);

  // Use the same source of truth as widget.js: the LLM sentiment distribution
  // when available, otherwise the derived distribution.
  const sentiment = model.analysis?.sentiment;
  const positive = sentiment?.positive_pct ?? model.pcts.positive;
  const neutral = sentiment?.neutral_pct ?? model.pcts.neutral;
  const negative = sentiment?.negative_pct ?? model.pcts.negative;
  const dominant = dominantSentiment(positive, neutral, negative);

  if (dominant === "positive") {
    return { header: "What customers love", items };
  }
  if (dominant === "negative") {
    return {
      header: "Customer Feedback",
      subtitle: "Customers are currently highlighting areas for improvement.",
      items,
    };
  }
  if (dominant === "neutral") {
    return { header: "Customer feedback", items };
  }
  return { header: "What customers say", items };
}

function WidgetFace({
  theme,
  content,
}: {
  theme: "light" | "dark";
  content: WidgetContent;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-xs rounded-xl border p-4",
        theme === "dark"
          ? "border-slate-700 bg-[#12161f] text-white"
          : "border-border bg-card",
      )}
      role="complementary"
      aria-label="FeedbackLoop widget preview"
    >
      <p className="text-xs font-bold">{content.header}</p>
      {content.subtitle ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {content.subtitle}
        </p>
      ) : null}
      <ul className="mt-2.5 space-y-2">
        {content.items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-border/70 pt-2.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="h-3 w-3 text-emerald-500" />
        Verified by FeedbackLoop
      </div>
    </div>
  );
}

export function WidgetSection({ model }: { model: SummaryModel }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const content = widgetContent(model);
  const snippet = `<div id="feedbackloop-widget" data-id="${model.widgetId}"${theme === "dark" ? ` data-theme="dark"` : ""}></div>\n<script src="${origin}/widget.js" async></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <SectionHeading
          title="Embeddable Widget"
          description="Paste this into your website to display live customer feedback. The widget adapts to the sentiment of your analysis and is verified by FeedbackLoop."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Embed code */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Embed code</h3>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    theme === "light"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    theme === "dark"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Dark
                </button>
              </div>
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
                <code className="text-slate-300">
                  <span className="text-purple-300">{`<div `}</span>
                  <span className="text-sky-300">id</span>
                  <span className="text-slate-400">=</span>
                  <span className="text-emerald-300">&quot;feedbackloop-widget&quot;</span>
                  <span className="text-sky-300"> data-id</span>
                  <span className="text-slate-400">=</span>
                  <span className="text-emerald-300">&quot;{model.widgetId}&quot;</span>
                  {theme === "dark" ? (
                    <>
                      <span className="text-sky-300"> data-theme</span>
                      <span className="text-slate-400">=</span>
                      <span className="text-emerald-300">&quot;dark&quot;</span>
                    </>
                  ) : null}
                  <span className="text-purple-300">{`></div>\n`}</span>
                  <span className="text-purple-300">{`<script `}</span>
                  <span className="text-sky-300"> src</span>
                  <span className="text-slate-400">=</span>
                  <span className="text-emerald-300">&quot;{origin}/widget.js&quot;</span>
                  <span className="text-sky-300"> async</span>
                  <span className="text-purple-300">{`></script>`}</span>
                </code>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              The widget links to your live analysis, updates automatically, and
              always shows a verification mark so visitors know it is real
              customer feedback.
            </p>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Preview</h3>
            <div className="flex items-start justify-center rounded-xl border border-border bg-secondary/30 p-4 sm:p-6">
              <WidgetFace theme={theme} content={content} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}