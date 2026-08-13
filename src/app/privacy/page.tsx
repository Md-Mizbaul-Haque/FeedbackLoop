import type { Metadata } from "next";
import {
  LegalPage,
  LegalSection,
  LegalParagraph,
} from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How FeedbackLoop collects, uses, and protects your data.",
};

const updated = "August 13, 2026";
const contact = "support@feedbackloop.app";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={updated}>
      <LegalSection title="1. Who we are">
        <LegalParagraph>
          FeedbackLoop (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an
          AI-powered customer feedback summarization service (the
          &ldquo;Service&rdquo;). This policy explains what personal data we
          collect, why we collect it, and the rights you have over it. For any
          privacy question, contact us at {contact}.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <LegalParagraph>
          <strong>Account data.</strong> When you sign up we collect your email
          address and a unique account identifier issued by your chosen sign-in
          provider (email/password or Google). We do not collect your password
          — passwords are stored only by your sign-in provider.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Service data.</strong> The feedback you upload or collect
          through the widget, and the AI-generated summaries of that feedback.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Payment data.</strong> If you subscribe to the paid plan,
          billing is handled by Lemon Squeezy. We receive from Lemon Squeezy
          your subscription status, variant, and identifiers needed to grant
          access, but we do not store or process credit card numbers.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Usage and security data.</strong> Counters describing how
          many analyses you performed, lease rows used to enforce fair
          concurrency limits, and one-way hashes (not raw values) of IP
          addresses used for rate limiting. Hashed IPs cannot be used to
          identify you.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. How we use your data">
        <LegalParagraph>
          We use your data solely to operate the Service: to authenticate you,
          to generate and store your summaries, to enforce usage limits, to
          process subscriptions through Lemon Squeezy, and to send you
          transactional email (sign-in codes and account notices). We do not
          sell your personal data, and we do not use your feedback to train AI
          models.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. Sharing with service providers">
        <LegalParagraph>
          We share the minimum necessary data with sub-processors that make the
          Service work: Supabase (database, authentication, email triggering),
          Vercel (hosting), Lemon Squeezy (billing), an AI model provider
          (processing of the feedback text you submit into summaries), and an
          SMTP provider (transactional email). Each is bound by its own
          data-processing terms. The AI provider receives only the feedback
          text of the analysis you request, never your password or billing
          details.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="5. Retention and deletion">
        <LegalParagraph>
          Your account data is retained while your account is active. You can
          delete your account at any time from the profile settings, which
          removes your account, summaries, and usage records, and cancels any
          active subscription. Some billing records may be retained by Lemon
          Squeezy as required by tax law. Backups may contain residual copies
          for a limited period after deletion.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Your rights">
        <LegalParagraph>
          Depending on where you live (including the EU/EEA and California) you
          may have rights to access, correct, export, or delete your personal
          data, and to object to or restrict processing. To exercise any of
          these rights, contact us at {contact}; we respond within 30 days.
          You also have the right to lodge a complaint with your local data
          protection authority.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Children">
        <LegalParagraph>
          The Service is not directed at children under 13 (or the higher age
          of digital consent where you live), and we do not knowingly collect
          their data. If you believe a child has provided us personal data,
          contact us at {contact} so we can delete it.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Security">
        <LegalParagraph>
          We use transport encryption, signed webhooks, row-level security in
          the database, server-side rate limiting, and least-privilege access
          to protect your data. No method of transmission or storage is
          completely secure; we strive to protect your data but cannot
          guarantee absolute security.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <LegalParagraph>
          We may update this policy from time to time. Material changes will be
          announced on the Service; the &ldquo;Last updated&rdquo; date above
          reflects the current version.
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
