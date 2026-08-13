"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  CreditCard,
  Gauge,
  Globe,
  Loader2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage } from "@/lib/friendly-auth-error";
import {
  AVATAR_MAX_SIZE,
  AVATAR_MIME_TYPES,
  getAvatarStoragePath,
  isStorageAvatarPath,
  resizeAvatar,
  useAvatarUrl,
} from "@/lib/avatar";
import {
  businessQueryKey,
  isExpiredSubscription,
  useBusinessProfile,
  useCredits,
  useUser,
  userQueryKey,
} from "@/lib/queries";

const CREDITS_PER_WINDOW = 10;
const WINDOW_HOURS = 24;

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function providerLabel(provider: string | undefined) {
  if (!provider) return "Email";
  const map: Record<string, string> = {
    email: "Email",
    google: "Google",
    github: "GitHub",
  };
  return map[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useUser();
  const {
    credits,
    isLoading: creditsLoading,
  } = useCredits(user?.id ?? null);
  const { businessName, website } = useBusinessProfile(user?.id ?? null);
  const [fullName, setFullName] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [businessNameForm, setBusinessNameForm] = useState("");
  const [websiteForm, setWebsiteForm] = useState("");
  const [prevUser, setPrevUser] = useState(user);
  const [prevBusiness, setPrevBusiness] = useState<{
    name: string;
    website: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<{
    blob: Blob;
    previewUrl: string;
  } | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useAvatarUrl(user);
  const [savingBusiness, setSavingBusiness] = useState(false);

  // Revoke the pending avatar's object URL whenever it's replaced or when the
  // page unmounts, so previews never leak memory.
  useEffect(() => {
    return () => {
      if (pendingAvatar) URL.revokeObjectURL(pendingAvatar.previewUrl);
    };
  }, [pendingAvatar]);

  if (prevUser !== user) {
    setPrevUser(user);
    setFullName(
      (user?.user_metadata?.full_name as string) ??
        (user?.user_metadata?.name as string) ??
        "",
    );
    setAvatarPath((user?.user_metadata?.avatar_url as string) ?? "");
  }

  if (
    prevBusiness?.name !== businessName ||
    prevBusiness?.website !== website
  ) {
    setPrevBusiness({ name: businessName, website });
    setBusinessNameForm(businessName);
    setWebsiteForm(website);
  }

  const usageUsed = credits?.used ?? 0;
  const plan = credits?.plan ?? "free";
  const expired = isExpiredSubscription(credits);
  const usageResetAt = credits?.windowStart
    ? new Date(new Date(credits.windowStart).getTime() + WINDOW_HOURS * 60 * 60 * 1000)
    : null;

  const subscriptionStatusInfo: Record<
    string,
    { label: string; className: string }
  > = {
    active: {
      label: "Active",
      className: "bg-emerald-500/10 text-emerald-600 border-0",
    },
    on_trial: {
      label: "Trial",
      className: "bg-emerald-500/10 text-emerald-600 border-0",
    },
    past_due: {
      label: "Payment failed",
      className: "bg-destructive/10 text-destructive border-0",
    },
    unpaid: {
      label: "Payment failed",
      className: "bg-destructive/10 text-destructive border-0",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-amber-500/10 text-amber-600 border-0",
    },
    paused: {
      label: "Paused",
      className: "bg-secondary text-secondary-foreground border-0",
    },
    expired: {
      label: "Expired",
      className: "bg-secondary text-secondary-foreground border-0",
    },
  };
  const statusInfo = credits?.subscriptionStatus
    ? subscriptionStatusInfo[credits.subscriptionStatus]
    : null;

  const [managingSubscription, setManagingSubscription] = useState(false);

  const handleManageSubscription = async () => {
    if (managingSubscription) return;
    setManagingSubscription(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in again.");
        return;
      }
      const response = await fetch("/api/lemon-squeezy/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        toast.error(body?.error ?? "Could not open the billing portal.");
        return;
      }
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Billing portal failed:", err);
      toast.error("Could not open the billing portal.");
    } finally {
      setManagingSubscription(false);
    }
  };

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (user?.email ? user.email.split("@")[0] : "");
  const initials =
    displayName
      .split(" ")
      .map((part: string) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const supabase = createClient();
    const metadata: Record<string, string> = {
      full_name: fullName.trim(),
    };
    let uploadedPath: string | null = null;

    try {
      if (pendingAvatar) {
        // Upload the new photo first so a failed metadata update can roll back.
        uploadedPath = getAvatarStoragePath(user.id);
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(uploadedPath, pendingAvatar.blob, {
            contentType: "image/webp",
          });
        if (uploadError) {
          console.error("Avatar upload failed:", uploadError);
          toast.error("Could not upload the image. Please try again.");
          return;
        }
        metadata.avatar_url = uploadedPath;
      } else if (removePending) {
        metadata.avatar_url = "";
      }

      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) {
        if (uploadedPath) {
          await supabase.storage.from("avatars").remove([uploadedPath]);
        }
        toast.error(friendlyAuthMessage(error));
        return;
      }

      if (uploadedPath) {
        // Sweep stale files in the user's folder so old avatars don't linger.
        const { data: existing, error: listError } = await supabase.storage
          .from("avatars")
          .list(user.id);
        if (!listError && existing) {
          const stale = existing
            .map((item) => `${user.id}/${item.name}`)
            .filter((itemPath) => itemPath !== uploadedPath);
          if (stale.length > 0) {
            await supabase.storage.from("avatars").remove(stale);
          }
        }
      } else if (removePending && isStorageAvatarPath(avatarPath)) {
        // Deletion after the metadata update so a failed update keeps the file.
        await supabase.storage.from("avatars").remove([avatarPath]);
      }

      setPendingAvatar(null);
      setRemovePending(false);
      setAvatarPath(uploadedPath ?? (removePending ? "" : avatarPath));
      queryClient.invalidateQueries({ queryKey: userQueryKey });
      toast.success("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to save profile:", err);
      toast.error("Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (file: File | null) => {
    if (!file || !user) return;

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      toast.error("Please choose a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      toast.error("The image must be smaller than 2 MB.");
      return;
    }

    try {
      const blob = await resizeAvatar(file);
      setPendingAvatar({ blob, previewUrl: URL.createObjectURL(blob) });
      setRemovePending(false);
    } catch {
      toast.error("Could not process the image. Please try again.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmRemoveAvatar = () => {
    setRemoveAvatarOpen(false);
    setRemovePending(true);
  };

  const hasEmailIdentity =
    user?.identities?.some((identity) => identity.provider === "email") ?? false;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    const alreadyHadPassword = hasEmailIdentity;
    setSettingPassword(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSettingPassword(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    if (data.user) queryClient.setQueryData(userQueryKey, data.user);

    toast.success(
      alreadyHadPassword
        ? "Password updated successfully!"
        : "Password set! You can now sign in with your email and password.",
    );
  };

  const provider = (user?.app_metadata?.provider as string) ?? "email";

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedWebsite = websiteForm.trim();
    if (trimmedWebsite) {
      try {
        const url = new URL(
          trimmedWebsite.startsWith("http") ? trimmedWebsite : `https://${trimmedWebsite}`,
        );
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        toast.error("Enter a valid website URL.");
        return;
      }
    }

    setSavingBusiness(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          business_name: businessNameForm.trim(),
          website: trimmedWebsite,
        },
        { onConflict: "id" },
      );
    setSavingBusiness(false);

    if (error) {
      console.error("Failed to save business info:", error);
      toast.error("Could not save business info. Please try again.");
      return;
    }

    queryClient.invalidateQueries({ queryKey: businessQueryKey(user.id) });
    toast.success("Business info saved!");
  };

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-20 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                </div>
                <Skeleton className="h-px w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          </div>
          <Card className="lg:col-span-2">
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="ml-auto h-10 w-36" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage your account information.
          </p>
        </div>

        <div className="flex min-h-[55vh] items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 flex flex-col items-center text-center space-y-5">
              <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-primary">
                <ShieldCheck className="h-7 w-7" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight">
                  Sign in to access your profile
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your account details, usage, business info, and password
                  settings are managed here.
                </p>
              </div>

              <ul className="w-full space-y-3 text-sm text-left">
                <li className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    Save and manage your AI summaries
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Gauge className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    Track your plan and daily credits
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    Personalize your business details
                  </span>
                </li>
              </ul>

              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  nativeButton={false}
                  render={<Link href="/login" />}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white font-medium h-10"
                >
                  Sign in
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href="/signup" />}
                  variant="outline"
                  className="flex-1 border-border h-10"
                >
                  Create an account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage your account information.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Account Summary + Usage */}
        <div className="space-y-6">
        <Card className="h-fit">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <Avatar size="lg" className="!size-20">
              {pendingAvatar ? (
                <AvatarImage
                  src={pendingAvatar.previewUrl}
                  alt={displayName}
                />
              ) : !removePending && avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={displayName} />
              ) : null}
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>

            <div>
              <h2 className="font-bold text-lg text-foreground">
                {user ? displayName : "Guest"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {user?.email ?? "Not signed in"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-secondary text-secondary-foreground border-0 px-2.5 py-0.5">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {providerLabel(provider)} Account
              </Badge>
            </div>

            <Separator className="w-full" />

            <div className="w-full space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="flex items-center text-muted-foreground">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </span>
                <span className="font-medium text-foreground truncate">
                  {user?.email ?? "—"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="flex items-center text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-2" />
                  Member since
                </span>
                <span className="font-medium text-foreground">
                  {formatDate(user?.created_at)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="flex items-center text-muted-foreground">
                  <UserIcon className="h-4 w-4 mr-2" />
                  Last sign in
                </span>
                <span className="font-medium text-foreground">
                  {formatDate(user?.last_sign_in_at)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-primary">
                <Gauge className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-base tracking-tight">Usage</h2>
                <p className="text-xs text-muted-foreground">
                  {plan === "pro"
                    ? "Unlimited AI analyses"
                    : `AI analyses in this 24-hour window`}
                </p>
              </div>
              <Badge
                className={
                  plan === "pro"
                    ? "bg-primary/10 text-primary border-0 px-2.5 py-0.5"
                    : "bg-secondary text-secondary-foreground border-0 px-2.5 py-0.5"
                }
              >
                <Sparkles
                  className={
                    plan === "pro"
                      ? "h-3 w-3 mr-1 text-primary"
                      : "h-3 w-3 mr-1"
                  }
                />
                {plan === "pro" ? "Pro" : "Free"}
              </Badge>
            </div>

            {plan === "pro" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
                  <p className="font-semibold">Unlimited summaries</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You&apos;re on the Pro plan. No credit limits apply to your
                    account.
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Subscription</span>
                    {statusInfo ? (
                      <Badge className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                    ) : (
                      <Badge className="bg-primary/10 text-primary border-0">
                        Pro
                      </Badge>
                    )}
                  </div>
                  {credits?.subscriptionStatus === "active" &&
                    credits?.renewsAt ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Renews</span>
                      <span className="font-medium">
                        {new Date(credits.renewsAt).toLocaleDateString()}
                      </span>
                    </div>
                  ) : null}
                  {credits?.cancelAtPeriodEnd && credits?.endsAt ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Access until</span>
                      <span className="font-medium">
                        {new Date(credits.endsAt).toLocaleDateString()}
                      </span>
                    </div>
                  ) : null}
                  {credits?.billingInterval ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Plan</span>
                      <span className="font-medium capitalize">
                        Pro ({credits.billingInterval})
                      </span>
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  disabled={managingSubscription}
                  onClick={handleManageSubscription}
                  className="w-full border-border h-9"
                >
                  {managingSubscription ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Manage subscription
                    </>
                  )}
                </Button>
              </div>
            ) : creditsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading usage…
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {usageUsed} of {CREDITS_PER_WINDOW} credits used
                  </span>
                  {usageResetAt ? (
                    <span className="text-xs text-muted-foreground">
                      Resets at{" "}
                      {usageResetAt.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usageUsed >= CREDITS_PER_WINDOW
                        ? "bg-destructive"
                        : "bg-primary",
                    )}
                    style={{
                      width: `${Math.min(100, (usageUsed / CREDITS_PER_WINDOW) * 100)}%`,
                    }}
                  />
                </div>
                {usageUsed >= CREDITS_PER_WINDOW ? (
                  <p className="text-xs text-destructive">
                    You&apos;ve used all your credits. Upgrade to Pro for
                    unlimited summaries.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Free plan: up to {CREDITS_PER_WINDOW} credits every{" "}
                    {WINDOW_HOURS} hours.
                  </p>
                )}
                <Button
                  nativeButton={false}
                  render={<Link href="/pricing" />}
                  className="mt-2 w-full bg-primary hover:bg-primary/90 text-white font-medium h-9"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {expired ? "Renew Pro" : "Upgrade to Pro"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Right: Edit Profile Card */}
        <Card className="lg:col-span-2 h-fit">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Edit Profile</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Update your display name and profile photo.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full name</Label>
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-10 rounded-lg text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email ?? ""}
                    readOnly
                    disabled
                    className="h-10 bg-muted border-border rounded-lg text-sm opacity-70"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Profile photo</Label>
                <div className="flex items-center gap-4">
                  <Avatar size="lg" className="!size-16">
                    {pendingAvatar ? (
                      <AvatarImage
                        src={pendingAvatar.previewUrl}
                        alt={fullName || "Profile"}
                      />
                    ) : !removePending && avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={fullName || "Profile"} />
                    ) : null}
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => fileInputRef.current?.click()}
                        className="hover:bg-muted h-9"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {pendingAvatar ? "Change photo" : "Upload photo"}
                      </Button>
                      {avatarPath || pendingAvatar || removePending ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => {
                            if (pendingAvatar) {
                              setPendingAvatar(null);
                            } else if (removePending) {
                              setRemovePending(false);
                            } else {
                              setRemoveAvatarOpen(true);
                            }
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/5 h-9"
                        >
                          {removePending
                            ? "Undo removal"
                            : pendingAvatar
                              ? "Discard photo"
                              : "Remove"}
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, WebP, or GIF up to 2 MB. Resized to 256px
                      automatically. Changes apply when you save.
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_MIME_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs px-6 h-10"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Business Card */}
      <Card className="mt-6">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Business</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Tell us about the business behind your reviews.
            </p>
          </div>

          <form onSubmit={handleSaveBusiness} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="business-name">Business name</Label>
                <div className="relative">
                  <Input
                    id="business-name"
                    type="text"
                    placeholder="My Grocery Store"
                    value={businessNameForm}
                    onChange={(e) => setBusinessNameForm(e.target.value)}
                    className="h-10 pl-10 rounded-lg text-sm"
                  />
                  <Building2 className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website URL</Label>
                <div className="relative">
                  <Input
                    id="website"
                    type="text"
                    placeholder="https://mygrocerystore.com"
                    value={websiteForm}
                    onChange={(e) => setWebsiteForm(e.target.value)}
                    className="h-10 pl-10 rounded-lg text-sm"
                  />
                  <Globe className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              Optional. Used to personalize summaries and support the embed
              widget.
            </p>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={savingBusiness}
                className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs px-6 h-10"
              >
                {savingBusiness ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save Business Info
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password Card */}
      <Card className="mt-6">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {hasEmailIdentity ? "Change Password" : "Set a Password"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {hasEmailIdentity
                ? "Update the password used to sign in to your account."
                : "You signed up with Google. Set a password to also sign in with your email and password."}
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 pl-10 pr-10 rounded-lg text-sm"
                    required
                    minLength={8}
                  />
                  <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10 pl-10 pr-10 rounded-lg text-sm"
                    required
                    minLength={8}
                  />
                  <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              Password must be at least 8 characters long.
            </p>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={settingPassword}
                className="bg-primary hover:bg-primary/90 text-white font-medium shadow-xs px-6 h-10"
              >
                {settingPassword ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {hasEmailIdentity ? "Update Password" : "Set Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={removeAvatarOpen}
        onOpenChange={(open) => {
          if (!open) setRemoveAvatarOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove profile photo?</DialogTitle>
            <DialogDescription>
              Your profile photo will be removed when you click Save Changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setRemoveAvatarOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveAvatar}
            >
              Remove photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
