import type { Metadata } from "next";
import { MySummaries } from "@/components/my-summary";

export const metadata: Metadata = {
  title: "My Summaries",
};

export default function SummariesPage() {
  return <MySummaries />;
}