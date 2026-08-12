"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { SummaryModel, ReviewRecord } from "./data";
import { SEVERITY_RANK, excerpt, severityLabel } from "./data";
import type { Sentiment } from "./types";
import { NotEnoughEvidence, SectionHeading, SentimentBadge } from "./ui";

function pickDefaultSentiment(model: SummaryModel): Sentiment {
  if (model.dominant === "positive") return "positive";
  if (model.dominant === "negative") return "negative";
  const buckets: Record<Sentiment, number> = model.counts;
  const order: Sentiment[] = ["positive", "neutral", "negative"];
  let best: Sentiment = "neutral";
  let bestCount = -1;
  for (const s of order) {
    if (buckets[s] > bestCount) {
      bestCount = buckets[s];
      best = s;
    }
  }
  return best;
}

export function CustomerVoice({
  model,
  onViewAll,
}: {
  model: SummaryModel;
  onViewAll: (sentiment: Sentiment | "all") => void;
}) {
  const [active, setActive] = useState<Sentiment>(() => pickDefaultSentiment(model));
  const bySentiment = useMemo(() => {
    const map: Record<Sentiment, ReviewRecord[]> = {
      positive: [],
      neutral: [],
      negative: [],
    };
    for (const record of model.reviewRecords) map[record.sentiment].push(record);
    return map;
  }, [model.reviewRecords]);

  const tabs: Sentiment[] = ["positive", "neutral", "negative"];
  const counts: Record<Sentiment, number> = model.counts;

  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Customer Voice"
          description="Representative excerpts from the reviews you submitted. Quotes are verbatim."
          actions={
            <Button variant="outline" className="border-border h-8 text-xs" onClick={() => onViewAll(active)}>
              View all reviews
            </Button>
          }
        />

        {model.reviewRecords.length > 0 ? (
          <Tabs value={active} onValueChange={(v) => setActive(v as Sentiment)}>
<TabsList className="grid h-9 w-full grid-cols-3">
  {tabs.map((tab) => (
    <TabsTrigger key={tab} value={tab} className="min-w-0 px-2 text-xs">
      {tab === "positive" ? "Positive" : tab === "negative" ? "Negative" : "Neutral"}
      <span className="ml-1 min-w-0 truncate text-muted-foreground">({counts[tab]})</span>
    </TabsTrigger>
  ))}
</TabsList>

            {tabs.map((tab) => (
              <TabsContent key={tab} value={tab}>
                {bySentiment[tab].length > 0 ? (
                  <ul className="space-y-2.5">
                    {bySentiment[tab].slice(0, 3).map((record) => (
                      <li
                        key={record.index}
                        className="rounded-xl border border-border/70 bg-secondary/30 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            Review #{record.index + 1}
                          </span>
                          <SentimentBadge sentiment={record.sentiment} />
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                          &ldquo;{excerpt(record.text)}&rdquo;
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                    No {tab === "positive" ? "positive" : tab === "negative" ? "negative" : "neutral"} reviews in this batch.
                  </p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="No review excerpts are available for this result."
          />
        )}
      </CardContent>
    </Card>
  );
}

const SENTIMENT_ORDER: Record<Sentiment, number> = {
  positive: 0,
  neutral: 1,
  negative: 2,
};

export function ReviewBreakdown({
  model,
  initialSentiment = "all",
}: {
  model: SummaryModel;
  initialSentiment?: "all" | Sentiment;
}) {
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState<"all" | Sentiment>(initialSentiment);
  const [theme, setTheme] = useState<"all" | number>("all");
  const [sort, setSort] = useState<"index" | "severity" | "sentiment">("index");

  const hasClassifiedThemes = model.reviewRecords.some((r) => r.themes.length > 0);

  const filtered = useMemo(() => {
    let rows = model.reviewRecords.slice();
    if (sentiment !== "all") rows = rows.filter((r) => r.sentiment === sentiment);
    if (theme !== "all") rows = rows.filter((r) => r.themes.includes(theme));
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.text.toLowerCase().includes(q));

    if (sort === "index") {
      rows.sort((a, b) => a.index - b.index);
    } else if (sort === "severity") {
      rows.sort(
        (a, b) =>
          SEVERITY_RANK[b.severity ?? "low"] - SEVERITY_RANK[a.severity ?? "low"] ||
          a.index - b.index,
      );
    } else {
      rows.sort(
        (a, b) =>
          SENTIMENT_ORDER[a.sentiment] - SENTIMENT_ORDER[b.sentiment] ||
          a.index - b.index,
      );
    }
    return rows;
  }, [model.reviewRecords, sentiment, theme, search, sort]);

  if (model.reviewRecords.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <SectionHeading title="Source Reviews" />
          <NotEnoughEvidence
            title="Not enough evidence"
            hint="The full review list is not available for this result."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SectionHeading
          title="Source Reviews"
          badge={`${filtered.length} of ${model.reviewsCount}`}
          description="Browse the original reviews. Filter by sentiment or theme and sort by severity."
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reviews..."
              className="h-9 pl-9 pr-9 text-sm"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <Select value={sentiment} onValueChange={(v) => setSentiment((v ?? "all") as "all" | Sentiment)}>
            <SelectTrigger className="h-9 w-full text-sm lg:w-40">
              <SelectValue placeholder="All sentiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sentiment</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>

          {hasClassifiedThemes ? (
            <Select
              value={String(theme)}
              onValueChange={(v) => setTheme(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="h-9 w-full text-sm lg:w-44">
                <SelectValue placeholder="All themes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All themes</SelectItem>
                {model.themes.map((t, index) => (
                  <SelectItem key={t.name} value={String(index)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select value={sort} onValueChange={(v) => setSort((v ?? "index") as "index" | "severity" | "sentiment")}>
            <SelectTrigger className="h-9 w-full text-sm lg:w-40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="index">Order submitted</SelectItem>
              <SelectItem value="severity">Severity (high first)</SelectItem>
              <SelectItem value="sentiment">Sentiment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[480px] space-y-2.5 overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-3">
          {filtered.length > 0 ? (
            filtered.map((record) => (
              <div
                key={record.index}
                className="rounded-lg border border-border/60 bg-card p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    #{record.index + 1}
                  </span>
                  <SentimentBadge sentiment={record.sentiment} className="px-1.5 py-0 text-[10px]" />
                  {record.themes.map((themeIdx, idx) => {
                    const theme = model.themes[themeIdx];
                    return theme ? (
                      <Badge key={idx} variant="secondary" className="px-2 text-[10px] font-medium">
                        {theme.name}
                      </Badge>
                    ) : null;
                  })}
                  {record.severity ? (
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {severityLabel(record.severity)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                  {record.text}
                </p>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No reviews match the current filters.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}