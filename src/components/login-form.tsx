"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Sparkles, Heart, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorParam === "auth" ? "Something went wrong. Please try again." : null,
  );
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState<"password" | "google" | "magic" | null>(
    null,
  );

  const supabase = createClient();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading("password");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(null);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(next);
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading("google");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });

    setLoading(null);

    if (error) {
      setError(error.message);
    }
  };

  const handleMagicLink = async () => {
    setError(null);
    setLoading("magic");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });

    setLoading(null);

    if (error) {
      setError(error.message);
      return;
    }

    setMagicLinkSent(true);
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Column: Brand, Form & OAuth */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 lg:p-16 bg-white">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">FeedbackLoop</span>
        </div>

        {/* Main Form Section */}
        <div className="max-w-md w-full mx-auto my-8 space-y-6">
          <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back!
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {magicLinkSent && (
            <div
              role="status"
              className="rounded-lg border border-primary/30 bg-secondary px-4 py-3 text-sm text-foreground"
            >
              Check your inbox — a magic link has been sent to{" "}
              <span className="font-semibold">{email}</span>.
            </div>
          )}

          {/* OAuth & Social Login */}
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-11 border-border justify-center font-medium hover:bg-slate-50 rounded-xl"
              disabled={loading !== null}
              onClick={handleGoogleLogin}
            >
              {loading === "google" ? (
                <Loader2 className="h-5 w-5 mr-2.5 animate-spin" />
              ) : (
                <svg className="h-5 w-5 mr-2.5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            <Button
              variant="outline"
              className="w-full h-11 border-border justify-center font-medium hover:bg-slate-50 rounded-xl"
              disabled={loading !== null}
              onClick={handleMagicLink}
            >
              {loading === "magic" ? (
                <Loader2 className="h-5 w-5 mr-2.5 animate-spin text-primary" />
              ) : (
                <Mail className="h-5 w-5 mr-2.5 text-primary" />
              )}
              Continue with Magic Link
            </Button>
          </div>

          {/* Separator */}
          <div className="relative flex items-center justify-center">
            <Separator className="w-full" />
            <span className="absolute bg-white px-3 text-xs text-muted-foreground uppercase font-medium">
              Or sign in with email
            </span>
          </div>

          {/* Manual Login Form */}
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-border bg-white focus-visible:ring-primary"
                  required
                />
                <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-border bg-white focus-visible:ring-primary"
                  required
                />
                <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
              disabled={loading !== null}
            >
              {loading === "password" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Sign In
            </Button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link
              href="/signup"
              className="text-primary font-semibold hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div className="text-xs text-muted-foreground text-center lg:text-left">
          © {new Date().getFullYear()} FeedbackLoop Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column: Hero Visual Illustration */}
      <div className="hidden lg:flex w-1/2 bg-secondary/60 relative items-center justify-center p-12 overflow-hidden border-l border-border/40">
        {/* Background decorative elements */}
        <div className="absolute top-20 right-20 h-40 w-40 rounded-full bg-primary/10 filter blur-3xl" />
        <div className="absolute bottom-20 left-20 h-40 w-40 rounded-full bg-primary/15 filter blur-3xl" />

        {/* Floating Mockup Illustration */}
        <div className="relative w-full max-w-lg space-y-4">
          {/* Main Card */}
          <Card className="border border-primary/20 shadow-xl bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden p-6 space-y-4">
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

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-border/50 text-xs text-foreground/80">
              <p>
                "The product quality is outstanding! Fast shipping and
                excellent support."
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
    </div>
  );
}
