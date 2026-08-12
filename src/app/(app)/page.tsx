"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCredits, useUser, isExpiredSubscription } from "@/lib/queries";
import { UploadCloud, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  columnLabel,
  columnValues,
  guessReviewColumn,
  parseCsv,
} from "@/lib/csv";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FREE_MAX_REVIEWS = 50;

const sampleCsv = `Title,Content,Rating
Great product,"Delivery was super fast, and the packaging was great!",5
Amazing quality,"Amazing quality product. Highly recommended.",5
Helpful support,"Customer support was very helpful and responsive.",4
Works as described,"Love the product! It works exactly as described.",5
Fast shipping,"Shipping was faster than I expected. Great experience!",4
Will buy again,"Will definitely buy again.",5
Best service,"The best customer service I've ever received.",5
Satisfied,"Very satisfied with the quality and build.",4
Worth every penny,"Easy to use and worth every penny.",5
Five stars,"Five stars from me!",5`;

export default function CreateSummaryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();
  const { credits } = useCredits(user?.id ?? null);
  const [reviews, setReviews] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [csvColumnCount, setCsvColumnCount] = useState(0);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const plan = credits?.plan ?? "free";
  const expired = isExpiredSubscription(credits);

  const reviewCount = reviews.trim() ? reviews.trim().split("\n").filter(Boolean).length : 0;
  const characterCount = reviews.length;
  const overFreeLimit = plan === "free" && reviewCount > FREE_MAX_REVIEWS;

  const handleClear = () => {
    setReviews("");
  };

  const applyColumn = (rows: string[][], column: number) => {
    const values = columnValues(rows, column);
    if (values.length === 0) {
      toast.error("That column has no reviews. Try another one.");
      return;
    }
    setSelectedColumn(column);
    setReviews(values.join("\n"));
    toast.success(`Imported ${values.length} reviews.`);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is larger than 5MB. Please upload a smaller CSV.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file.");
      return;
    }

    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);

      if (rows.length === 0) {
        toast.error("No reviews found in the CSV file.");
        return;
      }

      const columnCount = Math.max(
        headers?.length ?? 0,
        ...rows.map((row) => row.length),
      );
      const guess = guessReviewColumn(headers, rows);

      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvColumnCount(columnCount);
      applyColumn(rows, guess);
    } catch (err) {
      console.error(err);
      toast.error("Could not read the CSV file. Please try again.");
    }
  };

  const handleDownloadSample = () => {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-reviews.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    const reviewsList = reviews
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (reviewsList.length < 10) {
      toast.error(`Please provide at least 10 reviews (you entered ${reviewsList.length}).`);
      return;
    }
    if (plan === "free" && reviewsList.length > FREE_MAX_REVIEWS) {
      toast.error(
        `The free plan supports up to ${FREE_MAX_REVIEWS} reviews per input (you entered ${reviewsList.length}).`,
      );
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to generate a summary.");
      router.push("/login");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-summaries", {
        body: { reviews: reviewsList },
      });

      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const body = (await ctx.json()) as {
              error?: string;
              error_code?: string;
            };
            if (body?.error_code === "usage_limit_exceeded") {
              queryClient.invalidateQueries({ queryKey: ["credits"] });
              setShowUpgradeDialog(true);
              return;
            }
            if (body?.error) {
              toast.error(body.error);
              return;
            }
          } catch {
            // ignore malformed error bodies; fall through to generic error
          }
        }
        throw error;
      }

      const result = data?.data as
        | {
            title: string;
            summary_points: string[];
            keywords: { label: string; count: number }[];
            positive_sentiment_pct: number | null;
            average_rating: number | null;
            analysis?: unknown;
          }
        | undefined;

      if (!result) {
        throw new Error("Empty analysis result.");
      }

      const summary = {
        user_id: user.id,
        title: result.title,
        reviews_count: reviewsList.length,
        keywords: result.keywords,
        summary_points: result.summary_points,
        positive_sentiment_pct: result.positive_sentiment_pct ?? 0,
        average_rating: result.average_rating ?? 0,
        reviews: reviewsList.join("\n"),
        analysis: result.analysis ?? null,
        widget_id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };

      sessionStorage.setItem(
        "feedbackloop:latest-summary",
        JSON.stringify(summary),
      );

      toast.success(
        `Summary generated from ${reviewsList.length} reviews!`,
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      router.push("/results");
    } catch (err) {
      console.error(err);
      toast.error("AI analysis failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {expired && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  Your Pro subscription has ended
                </p>
                <p className="text-sm text-muted-foreground">
                  You&apos;re now on the Free plan (10 summaries per 24 hours).
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Renew Pro
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Title Section */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Create New Summary</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste your customer reviews below or upload a CSV file.
        </p>
      </div>

      {/* Main Container Card */}
      <Card>
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Textarea Input */}
            <div className="lg:col-span-7 flex flex-col space-y-2">
              <label className="font-semibold text-sm">Paste Reviews</label>
              <p className="text-xs text-muted-foreground mb-1">
                {plan === "pro"
                  ? "Paste at least 10 customer reviews (one per line)"
                  : "Paste 10-50 customer reviews (one per line)"}
              </p>
              
              <div className="relative flex-1 flex flex-col">
                <Textarea
                  value={reviews}
                  onChange={(e) => setReviews(e.target.value)}
                  placeholder="Paste your reviews here..."
                  className="h-[280px] min-h-0 p-4 text-sm font-normal resize-none overflow-y-auto focus-visible:ring-primary rounded-xl"
                />
                
                {/* Meta Info Footer inside Textarea space */}
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span className={overFreeLimit ? "text-amber-600 font-medium" : ""}>
                    {reviewCount} reviews • {characterCount.toLocaleString()} characters
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    disabled={isGenerating}
                    className="h-7 text-xs border-border px-3 rounded-md hover:bg-muted"
                  >
                    Clear
                  </Button>
                </div>

                {overFreeLimit && (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    You&apos;ve entered {reviewCount} reviews. The free plan
                    supports up to {FREE_MAX_REVIEWS} per input. Upgrade to Pro
                    for unlimited reviews.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: File Drag & Drop Upload */}
            <div className="lg:col-span-5 flex flex-col space-y-2">
              <label className="font-semibold text-sm">Or Upload CSV</label>
              <p className="text-xs text-muted-foreground mb-1">
                Upload a CSV file with your reviews
              </p>
              
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload CSV file"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center h-[280px] transition-colors cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50 outline-none ${
                  isDragging
                    ? "border-primary/60 bg-secondary/50"
                    : "border-primary/20 bg-secondary/30 hover:border-primary/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <div className="h-10 w-10 rounded-full bg-card flex items-center justify-center shadow-xs text-primary mb-3">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  CSV file (max. 5MB)
                </p>
              </div>

              {csvRows && (
                <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-secondary/40 p-3">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <label className="text-xs font-semibold text-foreground">
                      Which column has the reviews?
                    </label>
                  </div>
                  <Select
                    value={String(selectedColumn)}
                    onValueChange={(value) => {
                      if (csvRows && value) applyColumn(csvRows, Number(value));
                    }}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: csvColumnCount }, (_, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {columnLabel(
                            csvHeaders,
                            index,
                            columnValues(csvRows, index).length,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">How should the CSV be formatted? </span>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="text-primary hover:underline font-medium cursor-pointer"
                >
                  Download sample CSV
                </button>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <div className="pt-2">
            <Button 
              size="lg" 
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium h-12 rounded-xl text-sm transition-all shadow-xs"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing Reviews...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showUpgradeDialog}
        onOpenChange={(open) => {
          if (!open && !isGenerating) setShowUpgradeDialog(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">
              You&apos;ve used all your free summaries
            </DialogTitle>
            <DialogDescription className="text-center">
              The free plan includes 10 summaries every 24 hours. Upgrade to
              Pro for unlimited summaries and never wait for a reset again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-center gap-2">
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setShowUpgradeDialog(false)}
            >
              Maybe later
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/pricing" />}
              className="bg-primary hover:bg-primary/90 text-white font-medium"
              onClick={() => setShowUpgradeDialog(false)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Upgrade to Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 