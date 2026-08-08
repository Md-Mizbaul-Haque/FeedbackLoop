"use client";

import React, { useState } from "react";
import {
  Search,
  Plus,
  Eye,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface SummaryItem {
  id: string;
  title: string;
  reviewsCount: number;
  keywords: { label: string; colorClass: string }[];
  createdAt: string;
}

const summariesData: SummaryItem[] = [
  {
    id: "1",
    title: "Awesome Headphones Reviews",
    reviewsCount: 34,
    createdAt: "Aug 8, 2025",
    keywords: [
      {
        label: "High Quality",
        colorClass: "bg-orange-50 text-orange-600 border-orange-200",
      },
      {
        label: "Great Sound",
        colorClass: "bg-rose-50 text-rose-600 border-rose-200",
      },
      {
        label: "Comfortable",
        colorClass: "bg-purple-50 text-purple-600 border-purple-200",
      },
    ],
  },
  {
    id: "2",
    title: "Coffee Shop Feedback",
    reviewsCount: 28,
    createdAt: "Aug 7, 2025",
    keywords: [
      {
        label: "Great Coffee",
        colorClass: "bg-amber-50 text-amber-600 border-amber-200",
      },
      {
        label: "Cozy Atmosphere",
        colorClass: "bg-emerald-50 text-emerald-600 border-emerald-200",
      },
      {
        label: "Friendly Staff",
        colorClass: "bg-sky-50 text-sky-600 border-sky-200",
      },
    ],
  },
  {
    id: "3",
    title: "Online Store Reviews",
    reviewsCount: 41,
    createdAt: "Aug 6, 2025",
    keywords: [
      {
        label: "Fast Shipping",
        colorClass: "bg-purple-50 text-purple-600 border-purple-200",
      },
      {
        label: "Great Support",
        colorClass: "bg-emerald-50 text-emerald-600 border-emerald-200",
      },
      {
        label: "Good Value",
        colorClass: "bg-indigo-50 text-indigo-600 border-indigo-200",
      },
    ],
  },
  {
    id: "4",
    title: "Fitness App Feedback",
    reviewsCount: 22,
    createdAt: "Aug 5, 2025",
    keywords: [
      {
        label: "Easy to Use",
        colorClass: "bg-sky-50 text-sky-600 border-sky-200",
      },
      {
        label: "Great Workouts",
        colorClass: "bg-rose-50 text-rose-600 border-rose-200",
      },
      {
        label: "Motivating",
        colorClass: "bg-purple-50 text-purple-600 border-purple-200",
      },
    ],
  },
  {
    id: "5",
    title: "Skincare Product Reviews",
    reviewsCount: 31,
    createdAt: "Aug 4, 2025",
    keywords: [
      {
        label: "Effective",
        colorClass: "bg-indigo-50 text-indigo-600 border-indigo-200",
      },
      {
        label: "Good Quality",
        colorClass: "bg-orange-50 text-orange-600 border-orange-200",
      },
      {
        label: "Great Packaging",
        colorClass: "bg-blue-50 text-blue-600 border-blue-200",
      },
    ],
  },
];

export function MySummaries() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSummaries = summariesData.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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

        <Button className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs">
          <Plus className="h-4 w-4 mr-2" />
          Create New Summary
        </Button>
      </div>

      {/* Main Container Card */}
      <Card className="border border-border shadow-xs rounded-xl">
        <CardContent className="p-6 space-y-6">
          {/* Controls Bar: Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search summaries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-white border-border rounded-lg text-sm"
              />
            </div>

            <Select defaultValue="all">
              <SelectTrigger className="w-full sm:w-36 h-10 border-border bg-white text-sm">
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
              <TableHeader className="bg-slate-50/50">
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
                {filteredSummaries.length > 0 ? (
                  filteredSummaries.map((summary) => (
                    <TableRow
                      key={summary.id}
                      className="hover:bg-slate-50/60 border-border"
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
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>
                                Export Summary
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
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
                      No summaries found matching your search.
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
    </div>
  );
}
