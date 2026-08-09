"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Eye,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

interface SummaryItem {
  id: string;
  title: string;
  reviewsCount: number;
  keywords: { label: string; colorClass: string }[];
  createdAt: string;
  createdAtRaw: string;
}

const colorPalettes = [
  "bg-orange-50 text-orange-600 border-orange-200",
  "bg-rose-50 text-rose-600 border-rose-200",
  "bg-purple-50 text-purple-600 border-purple-200",
  "bg-amber-50 text-amber-600 border-amber-200",
  "bg-emerald-50 text-emerald-600 border-emerald-200",
  "bg-sky-50 text-sky-600 border-sky-200",
  "bg-indigo-50 text-indigo-600 border-indigo-200",
  "bg-blue-50 text-blue-600 border-blue-200",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function downloadSummary(summary: SummaryItem) {
  const lines = [
    summary.title,
    `${summary.reviewsCount} reviews analyzed`,
    `Created: ${summary.createdAt}`,
    "",
    "Top keywords:",
    ...summary.keywords.map((kw) => `- ${kw.label}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${summary.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MySummaries() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SummaryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [cutoff, setCutoff] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
      const now = Date.now();
      setCutoff(
        timeRange === "7days"
          ? now - 7 * 24 * 60 * 60 * 1000
          : timeRange === "30days"
            ? now - 30 * 24 * 60 * 60 * 1000
            : timeRange === "year"
              ? new Date(new Date().getFullYear(), 0, 1).getTime()
              : null,
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, timeRange]);

  const applyRows = useCallback(
    (rows: { id: string; title: string; reviews_count: number; keywords: { label: string }[]; created_at: string }[], error: { message: string } | null) => {
      if (error) {
        console.error(error);
        toast.error("Failed to load summaries.");
      }
      setSummaries(
        (rows ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          reviewsCount: row.reviews_count,
          keywords: (row.keywords ?? []).map(
            (kw, index) => ({
              label: kw.label,
              colorClass: colorPalettes[index % colorPalettes.length],
            }),
          ),
          createdAt: formatDate(row.created_at),
          createdAtRaw: row.created_at,
        })),
      );
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setSummaries([]);
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);
      const { data, error } = await supabase
        .from("summaries")
        .select("id, title, reviews_count, keywords, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      applyRows(data ?? [], error);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [applyRows]);

  const reload = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setSummaries([]);
        setSignedIn(false);
        setLoading(false);
        return;
      }
      setSignedIn(true);
      supabase
        .from("summaries")
        .select("id, title, reviews_count, keywords, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => applyRows(data ?? [], error));
    });
  }, [applyRows]);

  const handleDelete = async (summary: SummaryItem) => {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("summaries").delete().eq("id", summary.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      console.error(error);
      toast.error("Failed to delete summary.");
      return;
    }
    toast.success("Summary deleted.");
    reload();
  };

  const filteredSummaries = useMemo(() => {
    const q = debouncedQuery;

    return summaries.filter((item) => {
      if (cutoff !== null && new Date(item.createdAtRaw).getTime() < cutoff) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.label.toLowerCase().includes(q))
      );
    });
  }, [summaries, debouncedQuery, cutoff]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            My Summaries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all your previously generated summaries.
          </p>
        </div>

        <Button
          className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs"
          onClick={() => router.push("/")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create New Summary
        </Button>
      </div>

      {/* Main Container Card */}
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Controls Bar: Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by title or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 h-10 rounded-lg text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select
              value={timeRange}
              onValueChange={(value) => setTimeRange(value ?? "all")}
            >
              <SelectTrigger className="w-full sm:w-36 h-10 text-sm">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="year">This year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summaries Table */}
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs text-muted-foreground uppercase tracking-wider py-3.5">
                    TITLE
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground uppercase tracking-wider py-3.5">
                    REVIEWS
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground uppercase tracking-wider py-3.5">
                    KEYWORDS
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-muted-foreground uppercase tracking-wider py-3.5">
                    CREATED AT
                  </TableHead>
                  <TableHead className="w-[100px] text-right py-3.5"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>
                    {Array.from({ length: 4 }, (_, rowIndex) => (
                      <TableRow key={rowIndex} className="border-border">
                        <TableCell className="py-4">
                          <Skeleton className="h-5 w-2/3 max-w-64" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Skeleton className="h-5 w-16" />
                            <Skeleton className="h-5 w-20" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-8 w-8" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : filteredSummaries.length > 0 ? (
                  filteredSummaries.map((summary) => (
                    <TableRow
                      key={summary.id}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="font-semibold text-sm text-foreground py-4">
                        {summary.title}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground py-4">
                        {summary.reviewsCount} reviews
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {summary.keywords.map((kw, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className={`text-xs font-medium border px-2.5 py-0.5 rounded-md ${kw.colorClass}`}
                            >
                              {kw.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground py-4">
                        {summary.createdAt}
                      </TableCell>

                      <TableCell className="text-right py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => router.push(`/results?id=${summary.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                />
                              }
                            >
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => router.push(`/results?id=${summary.id}`)}
                              >
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => downloadSummary(summary)}>
                                Export Summary
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget(summary)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      {signedIn === false
                        ? "Sign in to view your generated summaries."
                        : searchQuery
                          ? "No summaries found matching your search."
                          : "No summaries yet. Generate your first summary to get started!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border"
              disabled
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="h-8 w-8 p-0 bg-primary/10 text-primary font-semibold"
            >
              1
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border"
              disabled
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete summary?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteTarget?.title}&rdquo;? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
