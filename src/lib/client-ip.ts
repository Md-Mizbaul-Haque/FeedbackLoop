import { createHash } from "node:crypto";

const IP_HASH_PREFIX = "v1";

/**
 * Best-effort client IP for abuse limiting.
 *
 * On Vercel (Node runtime) the platform appends the real client IP as the
 * first value of x-forwarded-for and overwrites any client-supplied values,
 * so the first entry is trusted here. Off-Vercel, x-forwarded-for can be
 * spoofed — the returned value is only used to build a rate-limit bucket key,
 * never stored or returned, so spoofing merely lets an attacker shuffle
 * their own bucket, not escalate anything.
 */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first ? first : null;
}

/** One-way hash so raw IPs are never persisted or logged. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_HASH_PREFIX}:${ip}`).digest("hex");
}
