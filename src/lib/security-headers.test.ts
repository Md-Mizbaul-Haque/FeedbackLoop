import { afterEach, describe, expect, it, vi } from "vitest";
import { securityHeaders, securityHeadersMap } from "./security-headers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("security headers (P2-5)", () => {
  it("TEST H1 — every response gets the core security headers", () => {
    const map = securityHeadersMap();
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(map["Permissions-Policy"]).toContain("camera=()");
  });

  it("TEST H2 — CSP permits self-framing but blocks third-party framing", () => {
    const csp = securityHeadersMap()["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("TEST H3 — CSP allows Supabase traffic when the URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const csp = securityHeadersMap()["Content-Security-Policy"];
    expect(csp).toContain("https://example.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://example.supabase.co");
    expect(csp).toContain("connect-src 'self' https://example.supabase.co");
  });

  it("TEST H4 — CSP stays functional when Supabase URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const csp = securityHeadersMap()["Content-Security-Policy"];
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("undefined");
  });

  it("TEST H5 — script-src is stricter in production (no unsafe-eval)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = securityHeadersMap()["Content-Security-Policy"];
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("TEST H6 — development keeps unsafe-eval for the Next dev compiler", () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = securityHeadersMap()["Content-Security-Policy"];
    expect(csp).toContain("'unsafe-eval'");
  });

  it("TEST H7 — HSTS is production-only", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prod = securityHeadersMap();
    expect(prod["Strict-Transport-Security"]).toContain("max-age=63072000");

    vi.stubEnv("NODE_ENV", "development");
    const dev = securityHeadersMap();
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });

  it("TEST H8 — headers are shaped for next.config headers()", () => {
    const headers = securityHeaders();
    expect(Array.isArray(headers)).toBe(true);
    for (const h of headers) {
      expect(typeof h.key).toBe("string");
      expect(typeof h.value).toBe("string");
      expect(h.key.length).toBeGreaterThan(0);
    }
  });
});
