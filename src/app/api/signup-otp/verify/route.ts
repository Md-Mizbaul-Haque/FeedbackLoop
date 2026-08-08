import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { verifyOtpCode } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

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

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

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
    const message = (createError.message ?? "").toLowerCase();
    if (createError.code === "user_already_exists" || message.includes("already")) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Try signing in instead.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
