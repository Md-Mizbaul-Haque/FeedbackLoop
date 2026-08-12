"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useCredits, useUser, isExpiredSubscription } from "@/lib/queries";
import { cn } from "@/lib/utils";

const PRO_MONTHLY_PRICE = "$9";
const PRO_YEARLY_PRICE = "$90";

const FREE_FEATURES = [
  "10 AI summaries per 24 hours",
  "Sentiment analysis",
  "Top themes & keywords",
  "Ranked recommendations",
  "Embeddable summary widget",
  "CSV import (up to 50 reviews)",
];

const PRO_FEATURES = [
  "Unlimited AI summaries",
  "Unlimited reviews per batch",
  "Everything in Free",
  "Priority processing",
  "Deeper insights & impact matrix",
  "Email support",
];

function PricingContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user, isLoading } = useUser();
  const { credits } = useCredits(user?.id ?? null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("month");

  const plan = credits?.plan ?? "free";
  const loadingPlan = isLoading || (user !== null && credits === null);
  const expired = isExpiredSubscription(credits);

  useEffect(() => {
    const status = searchParams.get("checkout");
    if (status === "cancelled") {
      toast.error("Checkout was cancelled. You can upgrade anytime.");
      router.replace("/pricing");
      return;
    }
    if (status !== "success" || !user) return;

    let stopped = false;
    const poll = async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase
          .from("user_credits")
          .select("plan")
          .eq("user_id", user.id)
          .maybeSingle();
        if (stopped) return;
        if (data?.plan === "pro") {
          stopped = true;
          window.clearInterval(timer);
          window.clearTimeout(failTimer);
          queryClient.invalidateQueries({ queryKey: ["credits"] });
          toast.success("Welcome to Pro! Your plan is now active.");
          router.replace("/pricing");
        }
      } catch {
        // transient read errors: keep polling
      }
    };
    const timer = window.setInterval(poll, 2000);
    const failTimer = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(timer);
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      toast.info(
        "Payment received — your Pro plan is activating. You'll get a confirmation email once it's live.",
      );
      router.replace("/pricing");
    }, 30_000);
    poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(failTimer);
    };
  }, [user, searchParams, queryClient, router]);

  const handleUpgrade = async () => {
    if (checkingOut) return;
    setCheckingOut(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login?next=/pricing");
        return;
      }

      const response = await fetch("/api/lemon-squeezy/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ interval }),
      });

      const body = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !body.url) {
        toast.error(body?.error ?? "Could not start checkout. Please try again.");
        return;
      }

      window.location.href = body.url;
    } catch (err) {
      console.error("Checkout failed:", err);
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4">
          <Zap className="h-3.5 w-3.5" />
          Simple, flat pricing
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Start free, upgrade when you grow
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm md:text-base">
          Turn customer reviews into actionable insights. Upgrade to Pro for
          unlimited summaries.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-border bg-secondary/40 p-1 text-sm">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-full px-4 py-1.5 font-medium transition-colors",
              interval === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "rounded-full px-4 py-1.5 font-medium transition-colors",
              interval === "year"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Yearly
            <span className="ml-1.5 text-xs font-semibold text-primary">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Free */}
        <Card className="h-fit">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Free</h2>
              {plan === "free" && !loadingPlan && (
                <Badge className="bg-secondary text-secondary-foreground border-0">
                  Current plan
                </Badge>
              )}
            </div>
            <div>
              <span className="text-3xl font-bold">$0</span>
              <span className="text-sm text-muted-foreground"> / forever</span>
            </div>
            <ul className="space-y-2.5">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              nativeButton={false}
              render={<Link href="/" />}
              variant="outline"
              className="w-full border-border"
            >
              Start with Free
            </Button>
          </CardContent>
        </Card>

        {/* Pro */}
        <Card className="relative h-fit overflow-visible border-primary/40 shadow-lg shadow-primary/5">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-white border-0 px-3 py-1">
              <Crown className="h-3 w-3 mr-1" />
              Most popular
            </Badge>
          </div>
          <CardContent className="p-6 space-y-6 pt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">Pro</h2>
              {plan === "pro" && !loadingPlan && (
                <Badge className="bg-primary/10 text-primary border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Current plan
                </Badge>
              )}
            </div>
            <div>
              <span className="text-3xl font-bold">
                {interval === "month" ? PRO_MONTHLY_PRICE : PRO_YEARLY_PRICE}
              </span>
              <span className="text-sm text-muted-foreground">
                {" "}
                / {interval === "month" ? "month" : "year"}
              </span>
              {interval === "year" ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Save 17%
                </span>
              ) : null}
            </div>
            <ul className="space-y-2.5">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {plan === "pro" && !loadingPlan ? (
              <div className="space-y-2">
                <Button
                  disabled
                  className="w-full bg-primary/60 text-white font-medium"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  You&apos;re on Pro
                </Button>
                {credits?.cancelAtPeriodEnd && credits?.endsAt ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Subscription cancelled — Pro access until{" "}
                    {new Date(credits.endsAt).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            ) : (
              <Button
                onClick={handleUpgrade}
                disabled={checkingOut}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium"
              >
                {checkingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Preparing checkout…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {expired ? "Renew Pro" : "Upgrade to Pro"}
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground max-w-md mx-auto">
        Payments are handled securely by Lemon Squeezy. Cancel anytime — you&apos;ll
        keep Pro benefits until the end of your billing period.
      </p>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}