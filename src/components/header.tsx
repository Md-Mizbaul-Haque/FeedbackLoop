"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/sideBar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/results": {
    title: "Summary Results",
    subtitle: "AI-generated insights from your customer feedback",
  },
  "/create": {
    title: "Create New Summary",
    subtitle: "Paste customer reviews and generate AI-powered summaries",
  },
  "/summaries": {
    title: "My Summaries",
    subtitle: "View and manage your generated summaries",
  },
  "/profile": {
    title: "Profile",
    subtitle: "Manage your account information",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Customize your workspace preferences",
  },
};

const menuItemClasses =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors data-highlighted:bg-muted data-highlighted:text-foreground";

export function Header() {
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

  const meta = pageMeta[pathname] ?? {
    title: "Dashboard",
    subtitle: "Overview of your feedback summaries",
  };

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (user?.email ? user.email.split("@")[0] : "");
  const initials =
    displayName
      .split(" ")
      .map((part: string) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-8">
        {/* Left: mobile menu + page title */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="md:hidden flex items-center">
            <Sheet>
              <SheetTrigger
                render={<Button variant="ghost" size="icon" />}
              >
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <Sidebar />
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-base md:text-lg font-bold tracking-tight text-foreground">
              {meta.title}
            </h1>
            <p className="hidden sm:block truncate text-xs text-muted-foreground">
              {meta.subtitle}
            </p>
          </div>
        </div>

        {/* Right: search + actions */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Search */}
          <div className="hidden lg:flex relative items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search…"
              className="h-9 w-56 xl:w-64 rounded-lg border border-border bg-muted/40 pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
            />
            <kbd className="absolute right-3 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>

          {/* Help */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />
          </Button>

          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

          {/* User area */}
          {!user ? (
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              className="h-9 rounded-lg"
            >
              <UserIcon className="h-4 w-4" />
              Sign in
            </Button>
          ) : (
            <BaseMenu.Root>
              <BaseMenu.Trigger
                render={
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-1 pl-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-muted/60"
                  >
                    <Avatar className="h-9 w-9">
                      {user?.user_metadata?.avatar_url ? (
                        <AvatarImage
                          src={user.user_metadata.avatar_url as string}
                          alt={displayName}
                        />
                      ) : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-left">
                      <span className="block text-sm font-semibold leading-none text-foreground">
                        {user ? displayName : "…"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {user?.email ?? ""}
                      </span>
                    </span>
                    <ChevronDown className="hidden sm:block h-4 w-4 text-muted-foreground" />
                  </button>
                }
              />
              <BaseMenu.Portal>
                <BaseMenu.Positioner align="end" sideOffset={8} className="z-50">
                  <BaseMenu.Popup className="w-60 rounded-xl border border-border bg-white p-1.5 shadow-lg shadow-black/5 transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
                    <div className="mb-1 border-b border-border px-2.5 py-2">
                      <p className="text-sm font-semibold text-foreground">
                        {user ? displayName : "…"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user?.email ?? ""}
                      </p>
                    </div>
                    <BaseMenu.Item
                      render={<Link href="/profile" />}
                      className={menuItemClasses}
                    >
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                      Profile
                    </BaseMenu.Item>
                    <BaseMenu.Item
                      render={<Link href="/settings" />}
                      className={menuItemClasses}
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Settings
                    </BaseMenu.Item>
                    <BaseMenu.Separator className="my-1 h-px bg-border" />
                    <BaseMenu.Item
                      className={cn(menuItemClasses, "text-destructive data-highlighted:text-destructive data-highlighted:bg-destructive/10")}
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </BaseMenu.Item>
                  </BaseMenu.Popup>
                </BaseMenu.Positioner>
              </BaseMenu.Portal>
            </BaseMenu.Root>
          )}
        </div>
      </div>
    </header>
  );
}
