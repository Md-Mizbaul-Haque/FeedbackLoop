import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

const smtpFrom =
  process.env.SMTP_FROM ??
  `FeedbackLoop <${process.env.SMTP_USER ?? "no-reply@example.com"}>`;

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: Number(process.env.SMTP_PORT ?? 465) === 465,
  pool: true,
  maxConnections: 2,
  maxMessages: 100,
  auth: {
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
  },
});

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyOtpCode(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(createHash("sha256").update(code).digest("hex"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(code: string): string {
  return `<div style="background:#f6f5fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e9e6f5;border-radius:12px;padding:32px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
      <div style="width:28px;height:28px;border-radius:9999px;background:#7c5cf0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;">&#10024;</div>
      <span style="font-weight:700;color:#1a1721;font-size:16px;">FeedbackLoop</span>
    </div>
    <h1 style="font-size:20px;color:#1a1721;margin:0 0 8px;">Your verification code</h1>
    <p style="font-size:14px;color:#4b4757;line-height:1.6;margin:0;">Use the code below to finish creating your account. It expires in 10 minutes.</p>
    <div style="display:inline-block;margin-top:16px;padding:12px 20px;border-radius:8px;background:#f6f5fb;border:1px solid #e9e6f5;font-size:20px;font-weight:700;letter-spacing:4px;color:#1a1721;">${escapeHtml(code)}</div>
  </div>
  <p style="text-align:center;font-size:12px;color:#7a7585;margin-top:16px;">If you didn't request this, you can safely ignore this email.</p>
</div>`;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await transport.sendMail({
    from: smtpFrom,
    to,
    subject: "Your FeedbackLoop verification code",
    html: renderHtml(code),
  });
}