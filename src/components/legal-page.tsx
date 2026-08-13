import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated: {updated}
        </p>
      </header>
      <main className="flex flex-1 flex-col gap-6 text-sm leading-relaxed text-foreground/90">
        {children}
      </main>
      <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          FeedbackLoop
        </Link>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function LegalParagraph({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
