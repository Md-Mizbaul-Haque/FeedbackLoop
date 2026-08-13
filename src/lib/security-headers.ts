// P2-5: security headers shared between next.config.ts and the unit tests.
//
// The FeedbackLoop widget is NOT an iframe: public/widget.js injects styled DOM
// directly into the host page, and only fetches /api/widget from the Feedback
// Loop origin. So the whole app can use a strict frame policy (frame-ancestors
// 'self') without breaking embedding. The widget API keeps its permissive CORS
// (public data served cross-origin to embedded widgets, no credentials).
//
// script-src 'unsafe-inline' is required because Next.js serves inline
// bootstrap scripts; 'unsafe-eval' is dev-only (Next dev compiler). All fonts
// are self-hosted via next/font. Supabase auth/PostgREST traffic goes to the
// configured project origin.
export function securityHeaders(): { key: string; value: string }[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabaseOrigin = "";
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabaseOrigin = "";
  }

  // Sentry client events are tunneled to the same origin (/monitoring), but the
  // ingest host is allowed directly as a fallback (e.g. when the tunnel is off).
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
  let sentryOrigin = "";
  try {
    sentryOrigin = sentryDsn ? new URL(sentryDsn).origin : "";
  } catch {
    sentryOrigin = "";
  }

  const isProduction = process.env.NODE_ENV === "production";

  const scriptSrc = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const imgSrc = supabaseOrigin
    ? `'self' data: blob: ${supabaseOrigin}`
    : "'self' data: blob:";
  const connectSrc = ["'self'", supabaseOrigin, sentryOrigin]
    .filter(Boolean)
    .join(" ");

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "X-Frame-Options": "SAMEORIGIN",
  };

  if (isProduction) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }

  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

export function securityHeadersMap(): Record<string, string> {
  return Object.fromEntries(
    securityHeaders().map(({ key, value }) => [key, value]),
  );
}
