import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders } from "@/lib/security-headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Source map upload: set SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN
  // (build-time secrets) to upload; without SENTRY_AUTH_TOKEN the plugin skips
  // the upload and the fallbacks are never used.
  org: process.env.SENTRY_ORG ?? "feedbackloop",
  project: process.env.SENTRY_PROJECT ?? "feedbackloop",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client source files for better stack trace resolution
  widenClientFileUpload: true,

  // Send client events through a same-origin tunnel to bypass ad-blockers
  tunnelRoute: "/monitoring",

  // Suppress non-CI output
  silent: !process.env.CI,
});