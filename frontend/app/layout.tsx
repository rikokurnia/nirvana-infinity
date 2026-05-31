import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { PrivyProvider } from "./providers/privy-provider";
import { ThemeProvider } from "./providers/theme-provider";
import AIChat from "./components/ai-chat";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Nirvana Digital Protocol",
  description:
    "Precision Vesting & Automated Token Streams for high-growth projects.",
  icons: {
    icon: "/favicon.png",
  },
};

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_CUSTOM_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_PLAUSIBLE_CUSTOM_DOMAIN}/js/script.js`
  : "https://plausible.io/js/script.js";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} min-h-screen antialiased`}
      >
        {PLAUSIBLE_DOMAIN && (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src={PLAUSIBLE_SRC}
            strategy="afterInteractive"
          />
        )}
        <ThemeProvider>
          <PrivyProvider>
            {children}
            <AIChat />
          </PrivyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
