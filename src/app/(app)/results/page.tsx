import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SummaryResults } from "@/components/summary-result";
import { WidgetPreview } from "@/components/widget-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  if (!id) {
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

  const supabase = await createClient();
  const { data: summary } = await supabase
    .from("summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!summary) {
    return (
      <Card className="border border-border shadow-sm rounded-xl">
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            This summary could not be found or you don&apos;t have access to it.
          </p>
          <Button render={<Link href="/" />}>Create New Summary</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <SummaryResults summary={summary} />
      <WidgetPreview items={summary.keywords?.map((k: { label: string }) => k.label) ?? []} />
    </>
  );
}
