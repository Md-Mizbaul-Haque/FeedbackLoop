"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { SummaryResults, type Summary } from "@/components/summary-result";
import { WidgetPreview } from "@/components/widget-preview";

const STORAGE_KEY = "feedbackloop:latest-summary";

function loadLatestSummary(): Summary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Summary) : null;
  } catch {
    return null;
  }
}

export function LatestResult() {
  const router = useRouter();
  const [summary] = useState<Summary | null>(loadLatestSummary);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!summary || saving) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to save this summary.");
      router.push("/login");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("summaries")
        .insert({
          title: summary.title,
          reviews_count: summary.reviews_count,
          keywords: summary.keywords,
          summary_points: summary.summary_points,
          positive_sentiment_pct: summary.positive_sentiment_pct ?? 0,
          average_rating: summary.average_rating ?? 0,
          reviews: summary.reviews ?? null,
          widget_id: summary.widget_id,
        })
        .select("id")
        .single();

      if (error) throw error;

      sessionStorage.removeItem(STORAGE_KEY);
      toast.success("Summary saved to your account!");
      router.replace(`/results?id=${data.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save summary. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!summary) {
    return (
      <Card className="border border-border shadow-sm rounded-xl">
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            No summary selected. Generate a new summary to see your results.
          </p>
          <Button render={<Link href="/" />}>Create New Summary</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <SummaryResults summary={summary} onSave={handleSave} saving={saving} />
      <WidgetPreview items={summary.keywords?.map((k) => k.label) ?? []} />
    </>
  );
}
