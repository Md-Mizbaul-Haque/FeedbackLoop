import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { isEmailConfigured, sendMail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hookSecret = (process.env.SEND_EMAIL_HOOK_SECRET ?? "").replace(
  "v1,whsec_",
  "",
);
const authBaseUrl =
  process.env.SUPABASE_AUTH_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
  old_email?: string;
  old_phone?: string;
}

interface HookPayload {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: EmailData;
}

const ACTIONS_WITH_LINK = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your email address",
  invite: "You've been invited",
  magiclink: "Your sign-in link",
  recovery: "Reset your password",
  email_change: "Confirm your new email address",
  reauthentication: "Your verification code",
  password_changed_notification: "Your password was changed",
  email_changed_notification: "Your email address was changed",
  phone_changed_notification: "Your phone number was changed",
  identity_linked_notification: "A new sign-in method was linked to your account",
  identity_unlinked_notification: "A sign-in method was removed from your account",
  mfa_factor_enrolled_notification: "A new verification method was added to your account",
  mfa_factor_unenrolled_notification: "A verification method was removed from your account",
};

const BODIES: Record<string, { heading: string; text: string }> = {
  signup: {
    heading: "Confirm your email address",
    text: "Follow the link below to confirm this email address and finish signing up.",
  },
  invite: {
    heading: "You've been invited",
    text: "You've been invited to create an account. Follow the link below to accept.",
  },
  magiclink: {
    heading: "Your sign-in link",
    text: "Follow the link below to sign in. This link expires shortly and can only be used once.",
  },
  recovery: {
    heading: "Reset your password",
    text: "We received a request to reset your password. Follow the link below to choose a new one.",
  },
  email_change: {
    heading: "Confirm your new email address",
    text: "Follow the link below to confirm {{new_email}} as your new email address.",
  },
  reauthentication: {
    heading: "Your verification code",
    text: "Use the code below to verify your identity. It expires shortly.",
  },
  password_changed_notification: {
    heading: "Your password was changed",
    text: "The password for your account was recently changed. If you didn't make this change, reset your password and contact support immediately.",
  },
  email_changed_notification: {
    heading: "Your email address was changed",
    text: "The email address for your account was changed from {{old_email}} to {{email}}.",
  },
  phone_changed_notification: {
    heading: "Your phone number was changed",
    text: "The phone number for your account was changed.",
  },
  identity_linked_notification: {
    heading: "A new sign-in method was added",
    text: "A new sign-in method was added to your account. If you didn't make this change, contact support immediately.",
  },
  identity_unlinked_notification: {
    heading: "A sign-in method was removed",
    text: "A sign-in method was removed from your account. If you didn't make this change, contact support immediately.",
  },
  mfa_factor_enrolled_notification: {
    heading: "A new verification method was added",
    text: "A new verification method was added to your account. If you didn't make this change, contact support immediately.",
  },
  mfa_factor_unenrolled_notification: {
    heading: "A verification method was removed",
    text: "A verification method was removed from your account. If you didn't make this change, contact support immediately.",
  },
};

function buildConfirmationUrl(
  emailData: Pick<EmailData, "token_hash" | "email_action_type" | "redirect_to">,
): string {
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });
  return `${authBaseUrl}/auth/v1/verify?${params.toString()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(
  heading: string,
  text: string,
  action?: { url: string; label: string },
  code?: string,
): string {
  const button = action
    ? `<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 20px;margin-top:16px;border-radius:8px;background:#7c5cf0;color:#ffffff;font-weight:600;text-decoration:none;">${escapeHtml(action.label)}</a>`
    : "";
  const codeBlock = code
    ? `<div style="display:inline-block;margin-top:16px;padding:12px 20px;border-radius:8px;background:#f6f5fb;border:1px solid #e9e6f5;font-size:20px;font-weight:700;letter-spacing:4px;color:#1a1721;">${escapeHtml(code)}</div>`
    : "";
  return `<div style="background:#f6f5fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e9e6f5;border-radius:12px;padding:32px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
      <div style="width:28px;height:28px;border-radius:9999px;background:#7c5cf0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">&#10024;</div>
      <span style="font-weight:700;color:#1a1721;font-size:16px;">FeedbackLoop</span>
    </div>
    <h1 style="font-size:20px;color:#1a1721;margin:0 0 8px;">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;color:#4b4757;line-height:1.6;margin:0;">${escapeHtml(text)}</p>
    ${button}${codeBlock}
  </div>
  <p style="text-align:center;font-size:12px;color:#7a7585;margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>
</div>`;
}

interface MailJob {
  email: string;
  url?: string;
  code?: string;
}

function buildMailJobs(
  user: HookPayload["user"],
  emailData: EmailData,
): MailJob[] {
  const type = emailData.email_action_type;
  if (type === "email_change") {
    const hasTwoOtp = Boolean(emailData.token_hash && emailData.token_hash_new);
    if (hasTwoOtp) {
      return [
        {
          email: user.email,
          url: buildConfirmationUrl({
            token_hash: emailData.token_hash_new,
            email_action_type: type,
            redirect_to: emailData.redirect_to,
          }),
        },
        {
          email: user.new_email ?? "",
          url: buildConfirmationUrl({
            token_hash: emailData.token_hash,
            email_action_type: type,
            redirect_to: emailData.redirect_to,
          }),
        },
      ].filter((job) => job.email);
    }
    const hash = emailData.token_hash || emailData.token_hash_new;
    return [
      {
        email: user.new_email ?? user.email,
        url: buildConfirmationUrl({
          token_hash: hash,
          email_action_type: type,
          redirect_to: emailData.redirect_to,
        }),
      },
    ];
  }

  if (ACTIONS_WITH_LINK.has(type)) {
    return [
      {
        email: user.email,
        url: buildConfirmationUrl({
          token_hash: emailData.token_hash,
          email_action_type: type,
          redirect_to: emailData.redirect_to,
        }),
      },
    ];
  }

  if (type === "reauthentication") {
    return [{ email: user.email, code: emailData.token }];
  }

  return [{ email: user.email }];
}

async function handleEmailAction(
  user: HookPayload["user"],
  emailData: EmailData,
): Promise<boolean> {
  const type = emailData.email_action_type;
  const template = BODIES[type];
  if (!template) {
    console.error(`Unhandled email action type: ${type}`);
    return false;
  }

  const subject = SUBJECTS[type] ?? "FeedbackLoop notification";
  const label =
    type === "email_change"
      ? "Confirm new email address"
      : type === "signup"
        ? "Confirm email address"
        : type === "magiclink"
          ? "Sign in"
          : type === "recovery"
            ? "Reset password"
            : type === "invite"
              ? "Accept invitation"
              : "Continue";

  const text = template.text
    .replace("{{new_email}}", user.new_email ?? "")
    .replace("{{old_email}}", emailData.old_email ?? "")
    .replace("{{email}}", user.email);

  const jobs = buildMailJobs(user, emailData);
  for (const job of jobs) {
    const html = renderHtml(
      template.heading,
      text,
      job.url ? { url: job.url, label } : undefined,
      job.code,
    );
    await sendMail(job.email, subject, html);  }

  return true;
}

export async function POST(req: NextRequest) {
  if (!hookSecret || !isEmailConfigured()) {
    return NextResponse.json(
      {
        error: {
          http_code: 500,
          message:
            "Send email hook is not configured. Set SEND_EMAIL_HOOK_SECRET, SMTP_USER and SMTP_PASSWORD.",
        },
      },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    payload = wh.verify(rawBody, headers) as HookPayload;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json(
      {
        error: {
          http_code: 401,
          message: "Invalid webhook signature.",
        },
      },
      { status: 401 },
    );
  }

  try {
    await handleEmailAction(payload.user, payload.email_data);
    return NextResponse.json({}, { status: 200 });
  } catch (err) {
    console.error("Failed to send email:", err);
    return NextResponse.json(
      {
        error: {
          http_code: 500,
          message: err instanceof Error ? err.message : "Email send failed",
        },
      },
      { status: 500 },
    );
  }
}
