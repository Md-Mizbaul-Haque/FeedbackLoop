import React, { Suspense } from "react";
import LoginPage from "@/components/login-form";

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
