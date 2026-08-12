"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo-mark";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { AuthVisual } from "@/components/auth-visual";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage } from "@/lib/friendly-auth-error";
import { resolveDefaultLanding } from "@/lib/settings";

const RESEND_COOLDOWN = 60;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const countingDown = step === "otp" && resendIn > 0;

  useEffect(() => {
    if (!countingDown) return;
    const timer = setInterval(
      () => setResendIn((seconds) => (seconds > 0 ? seconds - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [countingDown]);

  const handleGoogleSignup = async () => {
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (error) {
      toast.error(friendlyAuthMessage(error));
      return;
    }

    toast.success("Check your inbox (and spam folder) — a magic link has been sent.");
  };

  const sendOtp = async (targetEmail: string, targetPassword: string) => {
    const res = await fetch("/api/signup-otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail, password: targetPassword }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: data.error };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    const result = await sendOtp(email, password);

    setLoading(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not send the code. Please try again.");
      return;
    }

    setCode("");
    setOtpError("");
    setResendIn(RESEND_COOLDOWN);
    setStep("otp");
  };

  const handleResend = async () => {
    if (resending || resendIn > 0) return;

    setResending(true);
    const result = await sendOtp(email, password);
    setResending(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not resend the code. Please try again.");
      return;
    }

    setCode("");
    setOtpError("");
    setResendIn(RESEND_COOLDOWN);
    toast.success("A new code has been sent.");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || verifying) return;

    setVerifying(true);
    setOtpError("");

    try {
      const res = await fetch("/api/signup-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setOtpError(data.error ?? "Could not verify the code.");
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        toast.success("Account created! Sign in to continue.");
        router.push("/login");
        return;
      }

      toast.success("Account created — welcome!");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        router.push(await resolveDefaultLanding(supabase, user, "/"));
      } else {
        router.push("/");
      }
      router.refresh();
    } finally {
      setVerifying(false);
    }
  };

  const formatCountdown = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
      seconds % 60,
    ).padStart(2, "0")}`;

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Column: Brand, Form & OAuth */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 lg:p-16 bg-background">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-auto" />
          <span className="font-bold text-xl tracking-tight">FeedbackLoop</span>
        </div>

        <div className="max-w-md w-full mx-auto my-8 space-y-6">
          {step === "details" ? (
            <>
              <div className="space-y-1.5 text-left">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Create your account
                </h1>
                <p className="text-sm text-muted-foreground">
                  Start summarizing customer feedback with AI
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full h-11 justify-center font-medium rounded-xl"
                  disabled={loading}
                  onClick={handleGoogleSignup}
                >
                  {loading ? (
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
                  className="w-full h-11 justify-center font-medium rounded-xl"
                  disabled={loading}
                  onClick={handleMagicLink}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 mr-2.5 animate-spin text-primary" />
                  ) : (
                    <Mail className="h-5 w-5 mr-2.5 text-primary" />
                  )}
                  Continue with Magic Link
                </Button>
              </div>

              <div className="relative flex items-center justify-center">
                <Separator className="w-full" />
                <span className="absolute bg-background px-3 text-xs text-muted-foreground uppercase font-medium">
                  Or sign up with email
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 pl-10 rounded-xl focus-visible:ring-primary"
                        required
                      />
                      <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 pl-10 pr-10 rounded-xl focus-visible:ring-primary"
                        required
                      />
                      <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm password
                  </FieldLabel>
                  <FieldContent>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11 pl-10 pr-10 rounded-xl focus-visible:ring-primary"
                        required
                      />
                      <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={
                          showConfirmPassword ? "Hide password" : "Show password"
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FieldContent>
                </Field>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="space-y-1.5 text-left">
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Enter the verification code
                </h1>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs font-medium text-primary bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                  Didn&apos;t receive it? Check your spam or promotions folder.
                </p>
              </div>

              <form onSubmit={handleVerify} className="space-y-5">
                <Field>
                  <FieldContent>
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(value) => {
                        setCode(value);
                        setOtpError("");
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      containerClassName="justify-center"
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }, (_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className="h-12 w-11 sm:w-12 bg-background text-lg font-bold"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </FieldContent>
                </Field>

                <FieldError className="text-center">{otpError}</FieldError>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all shadow-xs"
                  disabled={verifying || code.length !== 6}
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Verify & Create Account
                </Button>
              </form>

              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                {resendIn > 0 ? (
                  <span>
                    Resend code in{" "}
                    <span className="font-semibold text-foreground">
                      {formatCountdown(resendIn)}
                    </span>
                  </span>
                ) : (
                  <>
                    <span>Didn&apos;t get it?</span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className="text-primary font-semibold hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {resending ? "Sending..." : "Resend code"}
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep("details")}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change email
              </button>
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div className="text-xs text-muted-foreground text-center lg:text-left">
          © {new Date().getFullYear()} FeedbackLoop Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column: Hero Visual Illustration */}
      <AuthVisual variant="signup" />
    </div>
  );
}
