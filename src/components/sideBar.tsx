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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "My Summaries", href: "/summaries", icon: FileText },
  { name: "Profile", href: "/profile", icon: UserIcon },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  onNavClick?: () => void;
}

export function Sidebar({ onNavClick }: SidebarProps) {
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
    onNavClick?.();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex flex-col h-full bg-white border-r border-border p-4 w-64 justify-between">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">FeedbackLoop</span>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Auth Action */}
      <div className="pt-4 border-t border-border">
        {user ? (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted px-3"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Log out
          </Button>
        ) : (
          <Button
            nativeButton={false}
            render={<Link href="/login" onClick={onNavClick} />}
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted px-3"
          >
            <LogIn className="h-4 w-4 mr-3" />
            Sign in
          </Button>
        )}
      </div>
    </aside>
  );
}
