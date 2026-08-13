import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { SiteFooter } from "@/components/site-footer";
import { Providers } from "@/app/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FeedbackLoop",
    template: "%s | FeedbackLoop",
  },
  description:
    "Turn customer feedback into actionable insights with AI-powered summaries.",
};

export const viewport: Viewport = {
  themeColor: "#f5f5f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full antialiased">
        <Providers>
          <div className="flex min-h-svh flex-col">
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
