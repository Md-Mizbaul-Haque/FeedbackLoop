"use client";

import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export const userQueryKey = ["auth", "user"] as const;
export const creditsQueryKey = (userId: string) => ["credits", userId] as const;
export const businessQueryKey = (userId: string) => ["profile", userId] as const;

export type SubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired"
  | null;

export interface Credits {
  used: number;
  plan: "free" | "pro";
  windowStart: string | null;
  subscriptionStatus: SubscriptionStatus;
  renewsAt: string | null;
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: "month" | "year" | null;
}

/**
 * The state of a brand-new user who has never used the product: free plan,
 * zero credits used. `user_credits` rows are created lazily on first use,
 * so a missing row must read as a fresh free user — not "loading".
 */
const DEFAULT_CREDITS: Credits = {
  used: 0,
  plan: "free",
  windowStart: null,
  subscriptionStatus: null,
  renewsAt: null,
  endsAt: null,
  cancelAtPeriodEnd: false,
  billingInterval: null,
};

/** True when the user had a paid subscription that is no longer active. */
export function isExpiredSubscription(credits: Credits | null): boolean {
  if (!credits) return false;
  if (credits.plan === "pro") return false;
  if (
    credits.subscriptionStatus === "expired" ||
    credits.subscriptionStatus === "paused"
  ) {
    return true;
  }
  return (
    credits.subscriptionStatus === "cancelled" &&
    credits.endsAt !== null &&
    new Date(credits.endsAt) < new Date()
  );
}

export function useUser(): {
  user: User | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: userQueryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { user: data ?? null, isLoading };
}

export function useCredits(userId: string | null): {
  credits: Credits;
  /** True only while the credits row is actually being fetched. */
  isLoading: boolean;
} {
  const { data, isPending } = useQuery({
    queryKey: creditsQueryKey(userId ?? ""),
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_credits")
        .select(
          "used, plan, window_start, subscription_status, renews_at, ends_at, cancel_at_period_end, billing_interval",
        )
        .eq("user_id", userId ?? "")
        .maybeSingle();

      if (!data) return DEFAULT_CREDITS;
      const status = (data.subscription_status as string | null) ?? null;
      const interval = (data.billing_interval as string | null) ?? null;
      return {
        used: data.used ?? 0,
        plan: data.plan === "pro" ? ("pro" as const) : ("free" as const),
        windowStart: (data.window_start as string | null) ?? null,
        subscriptionStatus: (
          [
            "on_trial",
            "active",
            "paused",
            "past_due",
            "unpaid",
            "cancelled",
            "expired",
          ].includes(status ?? "")
            ? status
            : null
        ) as SubscriptionStatus,
        renewsAt: (data.renews_at as string | null) ?? null,
        endsAt: (data.ends_at as string | null) ?? null,
        cancelAtPeriodEnd: data.cancel_at_period_end === true,
        billingInterval:
          interval === "year" || interval === "month"
            ? (interval as "year" | "month")
            : null,
      };
    },
    enabled: !!userId,
  });

  return {
    credits: data ?? DEFAULT_CREDITS,
    // A disabled query (guest / no userId) reports `pending` but is not loading.
    isLoading: !!userId && isPending,
  };
}

export function useBusinessProfile(userId: string | null): {
  businessName: string;
  website: string;
} {
  const { data } = useQuery({
    queryKey: businessQueryKey(userId ?? ""),
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("business_name, website")
        .eq("id", userId ?? "")
        .maybeSingle();

      return {
        businessName: (data?.business_name as string | undefined) ?? "",
        website: (data?.website as string | undefined) ?? "",
      };
    },
    enabled: !!userId,
  });

  return {
    businessName: data?.businessName ?? "",
    website: data?.website ?? "",
  };
}