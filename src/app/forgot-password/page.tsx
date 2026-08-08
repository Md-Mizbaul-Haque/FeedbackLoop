import React from "react";
import type { Metadata } from "next";
import ForgotPasswordPage from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default function page() {
  return <ForgotPasswordPage />;
}
