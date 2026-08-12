import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  // @supabase/ssr writes the session token as `sb-<ref>-auth-token` and PKCE
  // code verifiers as `sb-<ref>-auth-token-code-verifier`,
  // `sb-<ref>-auth-token-flows-code-verifier` and
  // `sb-<ref>-auth-token-flow-<flowId>-code-verifier`. Detect any of them so
  // an in-flight OAuth/magic-link flow keeps the auth round-trip enabled.
  const hasSessionCookie = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.endsWith("-auth-token") ||
        cookie.name.endsWith("-code-verifier"),
    );

  // Auth pages render fine without a session. Skip the Supabase round-trip for
  // logged-out visitors so /login and /signup paint immediately.
  if (isAuthRoute && !hasSessionCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}