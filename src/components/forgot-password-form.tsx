"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage } from "@/lib/friendly-auth-error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    setLoading(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
      return;
    }

    toast.success("If an account exists for that email, a reset link has been sent.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">FeedbackLoop</span>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5 text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              Reset your password
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <Button
              type="submit"
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Reset Link
            </Button>
          </form>

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
        </div>
      </div>
    </div>
  );
}
