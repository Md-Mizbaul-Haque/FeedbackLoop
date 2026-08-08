"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  Gauge,
  Globe,
  Loader2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Upload,
  User as UserIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
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

const ANALYSES_PER_HOUR = 10;

function formatDate(value: string | undefined) {
  if (!value) return "â€”";
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
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useAvatarUrl(user);
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [usageUsed, setUsageUsed] = useState<number | null>(null);
  const [usageResetAt, setUsageResetAt] = useState<Date | null>(null);

  const loadUsage = useCallback(async (uid: string) => {
    const supabase = createClient();
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);
    hourStart.setSeconds(0, 0);

    const { count, error } = await supabase
      .from("analysis_usage")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", uid)
      .gte("bucket", hourStart.toISOString());

    if (error) return;
    setUsageUsed(count ?? 0);
    setUsageResetAt(new Date(hourStart.getTime() + 60 * 60 * 1000));
  }, []);

  const loadBusiness = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("business_name, website")
      .eq("id", uid)
      .maybeSingle();

    if (error) return;
    setBusinessName(data?.business_name ?? "");
    setWebsite(data?.website ?? "");
  }, []);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUser(u);
      if (u) {
        setFullName(
          (u.user_metadata?.full_name as string) ??
            (u.user_metadata?.name as string) ??
            "",
        );
        setAvatarPath((u.user_metadata?.avatar_url as string) ?? "");
        loadUsage(u.id);
        loadBusiness(u.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setFullName(
          (session.user.user_metadata?.full_name as string) ??
            (session.user.user_metadata?.name as string) ??
            "",
        );
        setAvatarPath(
          (session.user.user_metadata?.avatar_url as string) ?? "",
        );
        loadUsage(session.user.id);
        loadBusiness(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadBusiness, loadUsage]);

  useEffect(() => {
    if (!user) return;
    const handleFocus = () => loadUsage(user.id);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [user, loadUsage]);

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
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim(),
      },
    });

    setSaving(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
      return;
    }

    toast.success("Profile updated successfully!");
  };

  const handleAvatarChange = async (file: File | null) => {
    if (!file || !user || uploading) return;

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      toast.error("Please choose a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      toast.error("The image must be smaller than 2 MB.");
      return;
    }

    setUploading(true);
    const supabase = createClient();

    try {
      const blob = await resizeAvatar(file);
      const path = getAvatarStoragePath(user.id);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/webp" });

      if (uploadError) {
        toast.error("Could not upload the image. Please try again.");
        return;
      }

      const { data: existing, error: listError } = await supabase.storage
        .from("avatars")
        .list(user.id);
      if (!listError && existing) {
        const stale = existing
          .map((item) => `${user.id}/${item.name}`)
          .filter((itemPath) => itemPath !== path);
        if (stale.length > 0) {
          await supabase.storage.from("avatars").remove(stale);
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: path },
      });

      if (updateError) {
        await supabase.storage.from("avatars").remove([path]);
        toast.error(friendlyAuthMessage(updateError));
        return;
      }

      setAvatarPath(path);
      toast.success("Profile photo updated!");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error("Could not process the image. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || uploading) return;

    const supabase = createClient();
    if (isStorageAvatarPath(avatarPath)) {
      const { error: removeError } = await supabase.storage
        .from("avatars")
        .remove([avatarPath]);
      if (removeError) {
        toast.error("Could not remove the photo. Please try again.");
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: "" },
    });

    if (updateError) {
      toast.error(friendlyAuthMessage(updateError));
      return;
    }

    setAvatarPath("");
    toast.success("Profile photo removed.");
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
    if (data.user) setUser(data.user);

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

    const trimmedWebsite = website.trim();
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
          business_name: businessName.trim(),
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

    toast.success("Business info saved!");
  };

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
              {avatarUrl ? (
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
                  {user?.email ?? "â€”"}
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
              <div>
                <h2 className="font-bold text-base tracking-tight">Usage</h2>
                <p className="text-xs text-muted-foreground">
                  AI analyses this hour
                </p>
              </div>
            </div>

            {usageUsed === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading usageâ€¦
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {usageUsed} of {ANALYSES_PER_HOUR} used
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
                      usageUsed >= ANALYSES_PER_HOUR
                        ? "bg-destructive"
                        : "bg-primary",
                    )}
                    style={{
                      width: `${Math.min(100, (usageUsed / ANALYSES_PER_HOUR) * 100)}%`,
                    }}
                  />
                </div>
                {usageUsed >= ANALYSES_PER_HOUR ? (
                  <p className="text-xs text-destructive">
                    You&apos;ve reached the hourly limit. Try again later.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Free plan: up to {ANALYSES_PER_HOUR} analyses per hour.
                  </p>
                )}
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
                    {avatarUrl ? (
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
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="hover:bg-muted h-9"
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {uploading ? "Uploadingâ€¦" : "Upload photo"}
                      </Button>
                      {avatarPath ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploading}
                          onClick={() => setRemoveAvatarOpen(true)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/5 h-9"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, WebP, or GIF up to 2 MB. Resized to 256px
                      automatically.
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
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
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
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
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
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
          if (!open && !uploading) setRemoveAvatarOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove profile photo?</DialogTitle>
            <DialogDescription>
              Your profile photo will be permanently deleted from your
              account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border"
              disabled={uploading}
              onClick={() => setRemoveAvatarOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={uploading}
              onClick={() => {
                setRemoveAvatarOpen(false);
                handleRemoveAvatar();
              }}
            >
              Remove photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
