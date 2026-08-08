"use client";

import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const SETTINGS_KEY = "feedbackloop-settings";

const defaultSettings = {
  defaultView: "dashboard",
  language: "en",
  emailNotifications: true,
  productUpdates: true,
  weeklyDigest: false,
};

type Settings = typeof defaultSettings;

function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

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
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  const update = (patch: Partial<Settings>) => {
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

  const handleDeleteAccount = () => {
    toast.info("Account deletion isn't available yet.");
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
                Choose your default view and language.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default view</label>
              <Select
                value={settings.defaultView}
                onValueChange={(value) =>
                  update({ defaultView: value ?? "dashboard" })
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
                Permanently remove your account and all data.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
