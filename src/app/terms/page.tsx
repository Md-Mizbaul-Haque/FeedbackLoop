import type { Metadata } from "next";
import {
  LegalPage,
  LegalSection,
  LegalParagraph,
} from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of FeedbackLoop.",
};

const updated = "August 13, 2026";
const contact = "support@feedbackloop.app";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={updated}>
      <LegalSection title="1. Agreement">
        <LegalParagraph>
          By creating an account or using FeedbackLoop (the
          &ldquo;Service&rdquo;) you agree to these Terms. If you use the
          Service on behalf of an organization, you represent that you have
          authority to bind it. If you do not agree, do not use the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. The Service">
        <LegalParagraph>
          The Service collects customer feedback (via a embeddable widget, CSV
          import, or pasted text) and generates AI summaries of it. We may
          change, suspend, or discontinue features at any time; the free plan
          includes a limited number of analyses, and the paid plan adds higher
          limits and priority processing as described on the pricing page.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="3. Accounts">
        <LegalParagraph>
          You are responsible for keeping your account credentials safe and for
          everything that happens under your account. You must provide accurate
          information and must not create accounts to circumvent usage limits
          or rate limits. We may suspend or terminate accounts that violate
          these Terms or abuse the Service.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <LegalParagraph>
          You may not use the Service to: store or process unlawful content,
          content that infringes third-party rights, or content that would
          violate the privacy rights of individuals; attempt to gain
          unauthorized access to the Service, our systems, or other users&apos;
          data; interfere with or overload the Service; or scrape or
          systematically extract data from it. You are responsible for having
          the rights and consents needed to upload the feedback you process
          (for example, a privacy notice for your own customers).
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="5. Payments and billing">
        <LegalParagraph>
          Paid plans are billed in advance through Lemon Squeezy. Subscriptions
          renew automatically until cancelled. Prices may change; we will give
          reasonable notice before any price change affects your renewal. You
          can manage or cancel your subscription from your profile&apos;s
          billing section, which links to Lemon Squeezy&apos;s customer portal.
          Refunds are governed by our Refund Policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="6. Content and ownership">
        <LegalParagraph>
          You retain all rights to the feedback you submit. We do not claim
          ownership of your content, and we do not use it to train AI models.
          The Service, including its software, design, and AI summarization
          features, is owned by us or our licensors.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="7. Warranty disclaimer">
        <LegalParagraph>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement. AI-generated summaries may contain errors or
          omissions; you remain responsible for decisions you make based on
          them.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <LegalParagraph>
          To the maximum extent permitted by law, we are not liable for
          indirect, incidental, special, consequential, or punitive damages, or
          for lost profits, revenue, data, or goodwill, arising out of or
          related to your use of the Service. Our total liability for any claim
          will not exceed the amount you paid us in the twelve months preceding
          the claim (or €100 if you paid nothing).
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. Termination">
        <LegalParagraph>
          You may stop using the Service at any time and delete your account
          from profile settings. We may suspend or terminate your access if you
          breach these Terms. On termination, your right to use the Service
          ends immediately; your data will be deleted as described in the
          Privacy Policy.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="10. Governing law and changes">
        <LegalParagraph>
          These Terms are governed by the laws applicable in your jurisdiction
          of residence, without regard to conflict-of-law rules. Where possible,
          we will first seek to resolve any dispute amicably through support
          ({contact}) before formal proceedings. We may update these Terms;
          material changes will be announced on the Service, and continued use
          after the effective date constitutes acceptance. Questions:
          {contact}.
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
