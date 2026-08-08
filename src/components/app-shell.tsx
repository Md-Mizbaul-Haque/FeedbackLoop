import { Sidebar } from "@/components/sideBar";
import { Header } from "@/components/header";

export function AppShell({
  children,
  showHeader = true,
}: {
  children: React.ReactNode;
  showHeader?: boolean;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block h-full">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-y-auto">
        {showHeader && <Header />}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
