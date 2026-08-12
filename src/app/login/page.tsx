import type { Metadata } from "next";
import LoginPage from "@/components/login-form";

export const metadata: Metadata = {
  title: "Login",
};

export default function page() {
  return <LoginPage />;
}
