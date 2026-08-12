import { Heart, Sparkles, Star, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

type AuthVisualProps = {
  variant?: "login" | "signup";
};

export function AuthVisual({ variant = "login" }: AuthVisualProps) {
  return variant === "signup" ? (
    <div className="hidden lg:flex w-1/2 bg-secondary/60 relative items-center justify-center p-12 overflow-hidden border-l border-border/40">
      {/* Background decorative elements */}
      <div className="absolute top-24 left-16 h-36 w-36 rounded-full bg-emerald-500/10 filter blur-3xl" />
      <div className="absolute bottom-24 right-16 h-36 w-36 rounded-full bg-primary/10 filter blur-3xl" />

      {/* Floating Mockup Illustration */}
      <div className="relative w-full max-w-lg space-y-4">
        {/* Main Card */}
        <Card className="shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Weekly Feedback Digest</h3>
              <p className="text-xs text-muted-foreground">
                AI-powered insights
              </p>
            </div>
          </div>

          {/* Sentiment Breakdown */}
          <div className="space-y-3 bg-muted/50 p-3.5 rounded-xl border border-border/50">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground/80">
                  Positive
                </span>
                <span className="font-semibold text-foreground">78%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border/60">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{ width: "78%" }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground/80">
                  Neutral
                </span>
                <span className="font-semibold text-foreground">15%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border/60">
                <div
                  className="h-1.5 rounded-full bg-muted-foreground/60"
                  style={{ width: "15%" }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground/80">
                  Negative
                </span>
                <span className="font-semibold text-foreground">7%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border/60">
                <div
                  className="h-1.5 rounded-full bg-rose-500"
                  style={{ width: "7%" }}
                />
              </div>
            </div>
          </div>

          {/* Keyword Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {["Fast shipping", "Great support", "Pricing", "UX"].map((k) => (
              <span
                key={k}
                className="text-[11px] font-medium rounded-full bg-secondary px-2.5 py-1 border border-border/50 text-muted-foreground"
              >
                #{k}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-foreground">4.8</span>
            average rating this week
          </div>
        </Card>

        {/* Floating Accent Badge */}
        <div className="absolute -bottom-6 -right-6 bg-emerald-600 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span>Insights Unlocked</span>
        </div>
      </div>
    </div>
  ) : (
    <div className="hidden lg:flex w-1/2 bg-secondary/60 relative items-center justify-center p-12 overflow-hidden border-l border-border/40">
      {/* Background decorative elements */}
      <div className="absolute top-20 right-20 h-40 w-40 rounded-full bg-primary/10 filter blur-3xl" />
      <div className="absolute bottom-20 left-20 h-40 w-40 rounded-full bg-primary/15 filter blur-3xl" />

      {/* Floating Mockup Illustration */}
      <div className="relative w-full max-w-lg space-y-4">
        {/* Main Card */}
        <Card className="shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              <Heart className="h-5 w-5 fill-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Customer Feedback</h3>
              <p className="text-xs text-muted-foreground">
                Real-time AI Sentiment
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-muted/50 p-3.5 rounded-xl border border-border/50 text-xs text-foreground/80">
            <p>
              &ldquo;The product quality is outstanding! Fast shipping and
              excellent support.&rdquo;
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex text-amber-400 gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400" />
              ))}
            </div>
            <span className="text-xs font-semibold text-primary">
              Verified Review
            </span>
          </div>
        </Card>

        {/* Floating Accent Badge */}
        <div className="absolute -bottom-6 -left-6 bg-primary text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span>AI Summarizer Active</span>
        </div>
      </div>
    </div>
  );
}