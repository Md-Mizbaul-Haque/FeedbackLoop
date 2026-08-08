"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/header";

export function AppShell({
  children,
  showHeader = true,
}: {
  children: React.ReactNode;
  showHeader?: boolean;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {showHeader && <Header />}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </SidebarProvider>
  );
}