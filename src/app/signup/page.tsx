import React from "react";
import type { Metadata } from "next";
import SignupPage from "@/components/signup-form";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function page() {
  return <SignupPage />;
}
