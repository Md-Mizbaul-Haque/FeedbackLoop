"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  ChevronDown,
  Loader2,
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAvatarUrl } from "@/lib/avatar";

const menuItemClasses =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors data-highlighted:bg-muted data-highlighted:text-foreground";

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-8">
        {/* Left: mobile menu */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="md:hidden flex items-center">
            <SidebarTrigger />
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 md:gap-2">
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
            <BaseMenu.Root>
              <BaseMenu.Trigger
                render={
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-1 pl-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-muted/60"
                  >
                    <Avatar className="h-9 w-9">
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt={displayName} />
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
                  <BaseMenu.Popup className="w-60 rounded-xl border border-border bg-popover p-1.5 shadow-lg transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
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
                      onClick={() => setLogoutOpen(true)}
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
