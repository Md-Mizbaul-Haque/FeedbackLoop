"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Loader2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage } from "@/lib/friendly-auth-error";

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
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

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
        setAvatarUrl((u.user_metadata?.avatar_url as string) ?? "");
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
        setAvatarUrl(
          (session.user.user_metadata?.avatar_url as string) ?? "",
        );
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
        avatar_url: avatarUrl.trim(),
      },
    });

    setSaving(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
      return;
    }

    toast.success("Profile updated successfully!");
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
        {/* Left: Account Summary Card */}
        <Card className="border border-border shadow-xs rounded-xl h-fit">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <Avatar size="lg" className="!size-20">
              {user?.user_metadata?.avatar_url ? (
                <AvatarImage
                  src={user.user_metadata.avatar_url as string}
                  alt={displayName}
                />
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

        {/* Right: Edit Profile Card */}
        <Card className="border border-border shadow-xs rounded-xl lg:col-span-2 h-fit">
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
                    className="h-10 bg-white border-border rounded-lg text-sm"
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
                <Label htmlFor="avatar-url">Profile photo URL</Label>
                <Input
                  id="avatar-url"
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="h-10 bg-white border-border rounded-lg text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a link to an image to use as your profile photo.
                </p>
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

      {/* Password Card */}
      <Card className="border border-border shadow-xs rounded-xl mt-6">
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
                    className="h-10 pl-10 pr-10 bg-white border-border rounded-lg text-sm"
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
                    className="h-10 pl-10 pr-10 bg-white border-border rounded-lg text-sm"
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
    </div>
  );
}
