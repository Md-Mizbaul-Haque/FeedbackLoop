import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDefaultLanding } from "@/lib/settings";

function isSafeNextPath(value: string | null): value is string {
  return (
    value !== null &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("://")
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = isSafeNextPath(searchParams.get("next")) ? searchParams.get("next") : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      let destination = next;
      if (next === "/") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          destination = await resolveDefaultLanding(supabase, user, next);
        }
      }
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`);
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
