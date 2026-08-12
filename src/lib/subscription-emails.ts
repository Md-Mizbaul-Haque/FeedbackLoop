import { isEmailConfigured, sendMail } from "@/lib/email";

export type SubscriptionEmailEvent =
  | "pro_activated"
  | "payment_success"
  | "payment_failed"
  | "cancelled"
  | "expired"
  | "refunded";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://feedbackloop.app";

function pricingLink(): string {
  return `${SITE_URL}/pricing`;
}

function branding(): string {
  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;">
      <p>FeedbackLoop — turn customer reviews into actionable insights.</p>
      <p><a href="${pricingLink()}" style="color:#6366f1;">View plans</a></p>
    </div>`;
}

function layout(title: string, body: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;">
      <div style="font-size:18px;font-weight:700;margin-bottom:16px;">FeedbackLoop</div>
      <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
      <div style="font-size:14px;line-height:1.6;">${body}</div>
      ${branding()}
    </div>`;
}

function subjectFor(event: SubscriptionEmailEvent): string {
  switch (event) {
    case "pro_activated":
      return "Welcome to FeedbackLoop Pro";
    case "payment_success":
      return "Your FeedbackLoop Pro payment was received";
    case "payment_failed":
      return "Action needed: your FeedbackLoop Pro payment failed";
    case "cancelled":
      return "Your FeedbackLoop Pro subscription is cancelled";
    case "expired":
      return "Your FeedbackLoop Pro subscription has ended";
    case "refunded":
      return "Your FeedbackLoop Pro refund has been processed";
  }
}

function htmlFor(event: SubscriptionEmailEvent, siteUrl: string): string {
  switch (event) {
    case "pro_activated":
      return layout(
        "Welcome to Pro",
        `
        <p>Your FeedbackLoop Pro subscription is now active. Welcome aboard.</p>
        <p>You now have:</p>
        <ul>
          <li>Unlimited AI summaries, no daily credit limits</li>
          <li>Unlimited reviews per batch</li>
          <li>Deeper insights and the impact matrix</li>
          <li>Priority processing</li>
        </ul>
        <p>If you haven't already, head to the dashboard to run your first summary.</p>
        <p><a href="${siteUrl}" style="color:#6366f1;">Open the dashboard</a></p>`,
      );
    case "payment_success":
      return layout(
        "Payment received",
        `
        <p>Thanks! Your FeedbackLoop Pro payment was received and your subscription is up to date.</p>
        <p>If you have any questions, just reply to this email.</p>`,
      );
    case "payment_failed":
      return layout(
        "Your payment failed",
        `
        <p>We couldn't charge your card for your FeedbackLoop Pro subscription. Your Pro access is still active for now, but you'll lose it if the payment isn't resolved.</p>
        <p>Lemon Squeezy retries the payment automatically. To avoid any interruption, please update your payment method:</p>
        <p><a href="${pricingLink()}" style="color:#6366f1;">Update billing in your account</a></p>`,
      );
    case "cancelled":
      return layout(
        "Your subscription is cancelled",
        `
        <p>Your FeedbackLoop Pro subscription has been cancelled and won't renew.</p>
        <p>You'll keep all Pro benefits until the end of your current billing period. After that, you'll continue on the Free plan — your saved summaries stay yours.</p>
        <p>Changed your mind? You can <a href="${pricingLink()}" style="color:#6366f1;">re-subscribe anytime</a>.</p>`,
      );
    case "expired":
      return layout(
        "Your Pro subscription has ended",
        `
        <p>Your FeedbackLoop Pro subscription has ended and your account has moved to the Free plan.</p>
        <p>The Free plan keeps working — you get 10 AI summaries every 24 hours. Your saved summaries are still there.</p>
        <p>Want unlimited summaries again? <a href="${pricingLink()}" style="color:#6366f1;">Renew Pro here</a> — it takes less than a minute.</p>`,
      );
    case "refunded":
      return layout(
        "Refund processed",
        `
        <p>Your FeedbackLoop Pro refund has been processed by Lemon Squeezy. The money is on its way back to your original payment method.</p>
        <p>Your account has been moved to the Free plan. You can upgrade again anytime on the <a href="${pricingLink()}" style="color:#6366f1;">pricing page</a>.</p>`,
      );
  }
}

export async function sendSubscriptionEmail(event: SubscriptionEmailEvent, to: string): Promise<void> {
  if (!isEmailConfigured() || !to) return;
  await sendMail(to, subjectFor(event), htmlFor(event, SITE_URL));
}