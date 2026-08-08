"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Loader2,
  LogOut,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SETTINGS,
  fetchUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      fetchUserSettings(supabase, data.user).then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setSettingsLoaded(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await saveUserSettings(supabase, user, settings);
      if (error) {
        toast.error(`Could not save settings: ${error}`);
      }
    }, 500);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const update = (patch: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out successfully.");
    router.push("/login");
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);

    const supabase = createClient();
    const { error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
    });

    if (error) {
      setDeleting(false);
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        try {
          const body = (await ctx.json()) as { error?: string };
          if (body?.error) {
            toast.error(body.error);
            return;
          }
        } catch {
          // ignore malformed error bodies; fall through to generic error
        }
      }
      toast.error("Could not delete the account. Please try again.");
      return;
    }

    await supabase.auth.signOut();
    try {
      localStorage.removeItem("feedbackloop-settings");
      sessionStorage.removeItem("feedbackloop:latest-summary");
    } catch {
      // ignore storage errors
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    toast.success("Your account and data have been deleted.");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your workspace preferences and notifications.
        </p>
      </div>

      {/* Preferences Card */}
      <Card className="border border-border shadow-xs rounded-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-primary">
              <SlidersHorizontal className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-tight">Preferences</h2>
              <p className="text-xs text-muted-foreground">
                Choose your default view and language. Saved to your account.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default view</label>
              <Select
                value={settings.defaultView}
                onValueChange={(value) =>
                  update({ defaultView: (value ?? "dashboard") as UserSettings["defaultView"] })
                }
              >
                <SelectTrigger className="w-full h-10 border-border bg-white text-sm">
                  <SelectValue placeholder="Select a view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Dashboard</SelectItem>
                  <SelectItem value="summaries">My Summaries</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Where you land after signing in.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select
                value={settings.language}
                onValueChange={(value) => update({ language: value ?? "en" })}
              >
                <SelectTrigger className="w-full h-10 border-border bg-white text-sm">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Card */}
      <Card className="border border-border shadow-xs rounded-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-primary">
              <Bell className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-tight">Notifications</h2>
              <p className="text-xs text-muted-foreground">
                Control what updates you receive by email.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Email notifications
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive emails about your account activity.
                </p>
              </div>
              <Toggle
                label="Email notifications"
                checked={settings.emailNotifications}
                onChange={(value) => update({ emailNotifications: value })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Product updates
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  News about new features and improvements.
                </p>
              </div>
              <Toggle
                label="Product updates"
                checked={settings.productUpdates}
                onChange={(value) => update({ productUpdates: value })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Weekly digest
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A summary of your activity every week.
                </p>
              </div>
              <Toggle
                label="Weekly digest"
                checked={settings.weeklyDigest}
                onChange={(value) => update({ weeklyDigest: value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="border border-destructive/30 shadow-xs rounded-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-bold text-base tracking-tight">Danger Zone</h2>
              <p className="text-xs text-muted-foreground">
                Actions that affect your account.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                End your session on this device.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-border bg-white hover:bg-muted h-9 shrink-0"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Sign out
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium text-destructive">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently remove your account, summaries, and all data.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your account, all summaries, and
              preferences. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
