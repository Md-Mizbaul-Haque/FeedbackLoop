import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { verifyOtpCode } from "@/lib/otp";
import { clientIp, hashIp } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const IP_VERIFIES_PER_HOUR = 30;
const GENERIC_ACCOUNT_ERROR = "Could not create your account. Please try again.";

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
    code?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !code) {
    return NextResponse.json({ error: "Enter the code sent to your email." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const ip = clientIp(req.headers);
  if (ip && !(await takeRateLimit(supabase, `ip:${hashIp(ip)}`, IP_VERIFIES_PER_HOUR))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a bit and try again." },
      { status: 429 },
    );
  }

  const { data: row } = await supabase
    .from("signup_verifications")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { error: "No verification found for this email. Request a new code." },
      { status: 400 },
    );
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "That code has expired. Request a new one." },
      { status: 400 },
    );
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Request a new code." },
      { status: 429 },
    );
  }

  if (!verifyOtpCode(code, row.code_hash)) {
    const attempts = row.attempts + 1;
    await supabase
      .from("signup_verifications")
      .update({ attempts })
      .eq("email", email);

    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: `Incorrect code. ${MAX_ATTEMPTS - attempts} ${
          MAX_ATTEMPTS - attempts === 1 ? "attempt" : "attempts"
        } left.`,
      },
      { status: 400 },
    );
  }

  await supabase.from("signup_verifications").delete().eq("email", email);

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    console.error("Failed to create user:", createError);
    if (createError.code === "user_already_exists" || /already/i.test(createError.message ?? "")) {
      // The email was OTP-verified, so this is a signup race, not an
      // enumeration signal. Keep the wording generic (P1-4).
      return NextResponse.json({ error: GENERIC_ACCOUNT_ERROR }, { status: 409 });
    }
    return NextResponse.json({ error: GENERIC_ACCOUNT_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** P1-3: per-IP attempt cap on the verify endpoint, fail-open on RPC errors. */
async function takeRateLimit(supabase: AdminClient, key: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("rate_limit_take", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 3600,
  });
  if (error) {
    console.error("verify rate limit rpc failed:", error);
    return true;
  }
  return data ?? true;
}