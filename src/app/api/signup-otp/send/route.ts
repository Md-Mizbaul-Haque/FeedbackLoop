import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateOtpCode, hashOtpCode, sendOtpEmail } from "@/lib/otp";
import { clientIp, hashIp } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_SENDS_PER_HOUR = 5;
const IP_SENDS_PER_HOUR = 20;
const GLOBAL_SENDS_PER_HOUR = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const buckets: [string, number][] = [
    ["global:signup-send", GLOBAL_SENDS_PER_HOUR],
    [`email:${email}`, EMAIL_SENDS_PER_HOUR],
  ];
  const ip = clientIp(req.headers);
  if (ip) {
    buckets.push([`ip:${hashIp(ip)}`, IP_SENDS_PER_HOUR]);
  }
  if (!(await takeAll(supabase, buckets))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a bit and try again." },
      { status: 429 },
    );
  }

  if (await emailExists(supabase, email)) {
    // Deliberately indistinguishable from the success path: no OTP, no email,
    // no "account already exists" hint (P1-4).
    return NextResponse.json({ ok: true });
  }

  const code = generateOtpCode();

  const { error: upsertError } = await supabase.from("signup_verifications").upsert(
    {
      email,
      code_hash: hashOtpCode(code),
      attempts: 0,
      send_count: 1,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    console.error("Failed to store OTP:", upsertError);
    return NextResponse.json(
      { error: "Could not send the code. Please try again." },
      { status: 500 },
    );
  }

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    await supabase.from("signup_verifications").delete().eq("email", email);
    return NextResponse.json(
      { error: "Could not send the code. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * P1-3: consume one token from every rate-limit bucket, fail-open on RPC
 * errors (an infra hiccup must not lock users out of signing up).
 */
async function takeAll(supabase: AdminClient, buckets: [string, number][]): Promise<boolean> {
  const results = await Promise.all(
    buckets.map(async ([key, limit]) => {
      const { data, error } = await supabase.rpc("rate_limit_take", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: 3600,
      });
      if (error) {
        console.error("signup rate limit rpc failed:", error);
        return true;
      }
      return data ?? true;
    }),
  );
  return results.every((allowed) => allowed);
}

/**
 * P1-5: single-email existence check. The installed GoTrue admin SDK exposes
 * no email lookup, so paginate listUsers (perPage 1000) and stop as soon as
 * the email is found or the pages run out — never a full 1000-user scan of
 * every account just to answer "does this email exist?".
 */
async function emailExists(supabase: AdminClient, email: string): Promise<boolean> {
  const perPage = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Failed to check existing user:", error);
      return false;
    }
    if (data.users.some((user) => user.email?.toLowerCase() === email)) {
      return true;
    }
    if (data.users.length < perPage) {
      return false;
    }
    page += 1;
  }
}
