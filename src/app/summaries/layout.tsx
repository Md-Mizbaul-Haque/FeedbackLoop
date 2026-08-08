import { AppShell } from "@/components/app-shell";

export default function SummariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell showHeader={false}>{children}</AppShell>;
}
