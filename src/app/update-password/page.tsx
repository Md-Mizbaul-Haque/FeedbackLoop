"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage } from "@/lib/friendly-auth-error";

export default function UpdatePasswordPage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      toast.error(friendlyAuthMessage(error));
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setDone(true);
  };

  const wrapper = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">FeedbackLoop</span>
        </div>
        {children}
      </div>
    </div>
  );

  if (checking) {
    return wrapper(
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>,
    );
  }

  if (!hasSession) {
    return wrapper(
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-center">
          Link invalid or expired
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          That link is invalid or has expired. Please request a new one.
        </p>
        <Button
          className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
          render={
            <Link href="/forgot-password" target="_blank" rel="noopener noreferrer" />
          }
        >
          Request a New Link
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>,
    );
  }

  if (done) {
    return wrapper(
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">
            Password set successfully!
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            You can now sign in with your email and password.
          </p>
        </div>
        <Button
          className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
          render={
            <Link href="/login" target="_blank" rel="noopener noreferrer" />
          }
        >
          Sign in
        </Button>
      </div>,
    );
  }

  return wrapper(
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a password for your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <FieldContent>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pl-10 pr-10 rounded-xl focus-visible:ring-primary"
                required
                minLength={8}
              />
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <FieldContent>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 pl-10 rounded-xl focus-visible:ring-primary"
                required
                minLength={8}
              />
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </FieldContent>
        </Field>

        <p className="text-xs text-muted-foreground">
          Password must be at least 8 characters long.
        </p>

        <Button
          type="submit"
          className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Set Password
        </Button>
      </form>
    </div>,
  );
}
