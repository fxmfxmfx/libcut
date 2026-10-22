import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { AppearanceApplier } from "@/components/tiktok/appearance-applier";

export const metadata: Metadata = {
  title: "libcut",
  description: "Self-hosted TikTok viewer.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className="antialiased bg-background text-foreground"
      >
        <Providers>
          <AppearanceApplier />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
