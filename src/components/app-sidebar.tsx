"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  User as UserIcon,
  Settings,
  LogOut,
  LogIn,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { User } from "@supabase/supabase-js";

const navItems = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "My Summaries", href: "/summaries", icon: FileText },
  { name: "Profile", href: "/profile", icon: UserIcon },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-bold text-lg tracking-tight">FeedbackLoop</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="p-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={item.name}
                      render={<Link href={item.href} />}
                      className="h-9 gap-3 rounded-lg px-3"
                    >
                      <Icon />
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            {user ? (
              <SidebarMenuButton
                tooltip="Log out"
                onClick={handleLogout}
                className="h-9 gap-3 rounded-lg px-3"
              >
                <LogOut />
                <span>Log out</span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                tooltip="Sign in"
                render={
                  <Link href="/login" target="_blank" rel="noopener noreferrer" />
                }
                className="h-9 gap-3 rounded-lg px-3"
              >
                <LogIn />
                <span>Sign in</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}