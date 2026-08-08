"use client";

import { useState } from "react";
import { UploadCloud, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

const initialReviews = `Delivery was super fast and the packaging was great!
Amazing quality product. Highly recommended.
Customer support was very helpful and responsive.
Love the product! It works exactly as described.
Shipping was faster than I expected. Great experience!
Will definitely buy again.
The best customer service I've ever received.
Very satisfied with the quality and build.
Easy to use and worth every penny.
Five stars from me!`;

export default function CreateSummaryPage() {
  const [reviews, setReviews] = useState(initialReviews);

  const reviewCount = reviews.trim() ? reviews.trim().split("\n").filter(Boolean).length : 0;
  const characterCount = reviews.length;

  const handleClear = () => {
    setReviews("");
  };

  return (
    <div className="space-y-6">
      {/* Title Section */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Create New Summary</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste your customer reviews below or upload a CSV file.
        </p>
      </div>

      {/* Main Container Card */}
      <Card className="border border-border shadow-sm rounded-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Textarea Input */}
            <div className="lg:col-span-7 flex flex-col space-y-2">
              <label className="font-semibold text-sm">Paste Reviews</label>
              <p className="text-xs text-muted-foreground mb-1">
                Paste 10-50 customer reviews (one per line)
              </p>
              
              <div className="relative flex-1 flex flex-col">
                <Textarea
                  value={reviews}
                  onChange={(e) => setReviews(e.target.value)}
                  placeholder="Paste your reviews here..."
                  className="min-h-[280px] p-4 text-sm font-normal resize-none focus-visible:ring-primary border-border bg-white rounded-xl"
                />
                
                {/* Meta Info Footer inside Textarea space */}
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>
                    {reviewCount} reviews • {characterCount.toLocaleString()} characters
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 text-xs border-border px-3 rounded-md hover:bg-muted"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column: File Drag & Drop Upload */}
            <div className="lg:col-span-5 flex flex-col space-y-2">
              <label className="font-semibold text-sm">Or Upload CSV</label>
              <p className="text-xs text-muted-foreground mb-1">
                Upload a CSV file with your reviews
              </p>
              
              <div className="border-2 border-dashed border-primary/20 bg-secondary/30 rounded-xl p-6 flex flex-col items-center justify-center text-center h-[280px] transition-colors hover:border-primary/40 cursor-pointer">
                <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-xs text-primary mb-3">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  CSV file (max. 5MB)
                </p>
              </div>

              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">How should the CSV be formatted? </span>
                <a href="#" className="text-primary hover:underline font-medium">
                  Download sample CSV
                </a>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <div className="pt-2">
            <Button 
              size="lg" 
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium h-12 rounded-xl text-sm transition-all shadow-sm"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 