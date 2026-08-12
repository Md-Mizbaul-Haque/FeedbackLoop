"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  LogOut,
  Settings,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import AnimatedSelect, {
  type DropdownOption,
} from "@/components/ui/great-ui-animated-select";
import { createClient } from "@/lib/supabase/client";
import { useAvatarUrl } from "@/lib/avatar";
import { useCredits, useUser } from "@/lib/queries";

const dropdownOptions: DropdownOption[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "summaries", label: "My Summaries", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "logout", label: "Log out", icon: LogOut, danger: true },
];

const optionHref: Record<string, string> = {
  profile: "/profile",
  summaries: "/summaries",
  settings: "/settings",
};

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/summaries": "My Summaries",
  "/profile": "Profile",
  "/pricing": "Pricing",
  "/settings": "Settings",
  "/results": "Results",
};

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { credits } = useCredits(user?.id ?? null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const plan = credits?.plan ?? "free";
  const used = credits?.used ?? null;
  const pageTitle = pageTitles[pathname] ?? "";

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (user?.email ? user.email.split("@")[0] : "");
  const avatarUrl = useAvatarUrl(user);
  const initials =
    displayName
      .split(" ")
      .map((part: string) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    queryClient.clear();
    router.push("/login");
    router.refresh();
  };

  const handleSelect = (option: DropdownOption) => {
    if (option.id === "logout") {
      setLogoutOpen(true);
      return;
    }
    const href = optionHref[option.id];
    if (href) {
      router.push(href);
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-8">
        {/* Left: mobile menu + page title */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="md:hidden flex items-center">
            <SidebarTrigger />
          </div>
          {pageTitle ? (
            <div className="hidden md:flex min-w-0 items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
                {pageTitle}
              </h2>
            </div>
          ) : null}
        </div>

        {/* Right: actions */}
        <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
          {plan === "pro" ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Pro
            </span>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/pricing" />}
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex h-8 gap-1.5 rounded-full border-primary/30 text-primary hover:bg-primary/5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {used !== null && used >= 10 ? "Upgrade" : "Pricing"}
            </Button>
          )}
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

          {/* User area */}
          {!user ? (
            <Button
              nativeButton={false}
              render={<Link href="/login" target="_blank" rel="noopener noreferrer" />}
              className="h-9 rounded-lg"
            >
              <UserIcon className="h-4 w-4" />
              Sign in
            </Button>
          ) : (
            <AnimatedSelect
              menuMinWidth={240}
              triggerHeight={44}
              align="end"
              options={dropdownOptions}
              onSelect={handleSelect}
              className="max-w-full"
              trigger={
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="h-9 w-9 shrink-0">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={displayName} />
                    ) : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block min-w-0 max-w-[12rem] text-left">
                    <span className="block truncate text-sm font-semibold leading-none text-foreground">
                      {user ? displayName : "…"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </span>
                </span>
              }
            />
          )}
        </div>
      </div>

      <Dialog
        open={logoutOpen}
        onOpenChange={(open) => {
          if (!open && !loggingOut) setLogoutOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border"
              disabled={loggingOut}
              onClick={() => setLogoutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={loggingOut}
              onClick={handleLogout}
            >
              {loggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Logging out…
                </>
              ) : (
                "Log out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
