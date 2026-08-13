import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
        <span>&copy; {new Date().getFullYear()} FeedbackLoop</span>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/refund" className="hover:text-foreground">
            Refund Policy
          </Link>
          <a
            href="mailto:support@feedbackloop.app"
            className="hover:text-foreground"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
