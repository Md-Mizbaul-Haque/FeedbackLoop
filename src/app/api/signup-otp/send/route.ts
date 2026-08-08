import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateOtpCode, hashOtpCode, sendOtpEmail } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: users, error: lookupError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (lookupError) {
    console.error("Failed to check existing user:", lookupError);
  }

  const alreadyExists =
    users?.users.some(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    ) ?? false;

  if (alreadyExists) {
    return NextResponse.json(
      {
        error:
          "An account with this email already exists. Try signing in instead.",
      },
      { status: 409 },
    );
  }

  const { data: row } = await supabase
    .from("signup_verifications")
    .select("send_count, created_at")
    .eq("email", email)
    .maybeSingle();

  const recentlySent =
    row && Date.now() - new Date(row.created_at).getTime() < 60 * 60 * 1000;

  if (recentlySent && row.send_count >= MAX_SENDS_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a bit and try again." },
      { status: 429 },
    );
  }

  const code = generateOtpCode();

  const { error: upsertError } = await supabase.from("signup_verifications").upsert(
    {
      email,
      code_hash: hashOtpCode(code),
      attempts: 0,
      send_count: recentlySent && row ? row.send_count + 1 : 1,
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
