import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "fittlist — one link in your bio, every gym you coach at",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons&display=block" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
