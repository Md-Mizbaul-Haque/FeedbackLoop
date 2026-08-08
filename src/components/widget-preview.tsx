"use client";

import { Truck, ShieldCheck, MessageSquare, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const defaultItems = [
  "Fast and reliable shipping",
  "High quality products",
  "Excellent customer support",
];

const icons = [Truck, ShieldCheck, MessageSquare];

export function WidgetPreview({ items = defaultItems }: { items?: string[] }) {
  const listItems = items.length > 0 ? items.slice(0, 3) : defaultItems;

  return (
    <div className="space-y-4">
      {/* Title */}
      <h2 className="text-base font-semibold text-foreground tracking-tight">
        Embedded Widget Preview <span className="text-muted-foreground font-normal text-sm">(How it looks on your website)</span>
      </h2>

      {/* Widget Containers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Light Theme Widget */}
        <Card className="bg-white overflow-hidden">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-center text-foreground">
              What customers love
            </h3>

            <ul className="space-y-3 text-xs text-foreground/80 font-medium">
              {listItems.map((item, index) => {
                const Icon = icons[index % icons.length];
                return (
                  <li key={index} className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>

            <div className="pt-3 border-t border-border flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Verified by FeedbackLoop</span>
            </div>
          </CardContent>
        </Card>

        {/* Dark Theme Widget */}
        <Card className="border border-slate-800 bg-[#12161f] text-white overflow-hidden ring-0">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-center text-white">
              What customers love
            </h3>

            <ul className="space-y-3 text-xs text-slate-200 font-medium">
              {listItems.map((item, index) => (
                <li key={index} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-emerald-400/20 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-primary fill-primary/20" />
              <span>Verified by FeedbackLoop</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
