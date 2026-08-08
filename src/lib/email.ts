import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT ?? 465);
const smtpUser = process.env.SMTP_USER ?? "";
const smtpPassword =
  process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? "";

export const emailFromName = process.env.EMAIL_FROM_NAME || "FeedbackLoop";
export const emailFromAddress =
  process.env.EMAIL_FROM || "no-reply@feedbackloop.app";
export const emailReplyTo = process.env.EMAIL_REPLY_TO || undefined;

export const transport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  pool: true,
  maxConnections: 2,
  maxMessages: 100,
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
});

export function isEmailConfigured(): boolean {
  return Boolean(smtpUser && smtpPassword);
}

export function sendMail(to: string, subject: string, html: string) {
  return transport.sendMail({
    from: { name: emailFromName, address: emailFromAddress },
    ...(emailReplyTo ? { replyTo: emailReplyTo } : {}),
    to,
    subject,
    html,
  });
}
