import type { Metadata } from "next";
import {
  LegalPage,
  LegalSection,
  LegalParagraph,
} from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "How refunds and cancellations work for FeedbackLoop.",
};

const updated = "August 13, 2026";
const contact = "support@feedbackloop.app";

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy" updated={updated}>
      <LegalSection title="1. Cancelling your subscription">
        <LegalParagraph>
          You can cancel your subscription at any time from the billing section
          in your profile (Lemon Squeezy&apos;s customer portal). After
          cancellation you keep paid access until the end of the billing period
          you already paid for; the subscription will not renew. Your account
          falls back to the free plan afterwards. You can also delete your
          account entirely, which cancels the subscription immediately.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. Refunds">
        <LegalParagraph>
          If you request a refund within 14 days of your first purchase and
          have not relied on the paid features (fewer than 5 analyses
          performed), we will refund the full amount of your first payment.
          Refunds are issued to the original payment method within 10 business
          days.
        </LegalParagraph>
        <LegalParagraph>
          Because AI analyses consume paid external processing on your behalf,
          analyses already performed are not refundable. If we terminate your
          account for a breach of the Terms of Service, fees already paid are
          not refunded.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Billing errors and chargebacks">
        <LegalParagraph>
          If you believe you were charged incorrectly, contact us at {contact}
          before disputing the charge; we will investigate and, where a billing
          error occurred, issue a refund of the erroneous amount. Chargebacks
          may result in account suspension pending resolution.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. How to request a refund">
        <LegalParagraph>
          Email {contact} with the email address on your account and the reason
          for the request. We aim to respond within 5 business days.
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
