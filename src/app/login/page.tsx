import React, { Suspense } from "react";
import type { Metadata } from "next";
import LoginPage from "@/components/login-form";

export const metadata: Metadata = {
  title: "Login",
};

export default function page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
