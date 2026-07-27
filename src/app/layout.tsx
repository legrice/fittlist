import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/format";
import { ScrollLock } from "@/components/ScrollLock";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "fittlist: one link in your bio, every gym you coach at",
  description:
    "Claim your page, publish the classes you coach across every studio, share one permanent link.",
  openGraph: {
    title: "fittlist",
    description: "One link in your bio. Always your current week, every studio you coach at.",
    siteName: "fittlist",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#191502",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Delight is self-hosted (see globals.css); Google Fonts only serves the icon font now. */}
        <link rel="preload" href="/fonts/delight-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/delight-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons&display=block" rel="stylesheet" />
      </head>
      <body>
        <ScrollLock />
        {children}
      </body>
    </html>
  );
}
