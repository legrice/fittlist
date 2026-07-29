import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/format";
import { ServiceWorker } from "@/components/InstallApp";
import { NavTrack } from "@/components/NavTrack";
import { ScrollLock } from "@/components/ScrollLock";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "fittlist: one link in your bio, every gym you coach at",
  description:
    "Claim your page, publish the classes you coach across every studio, share one permanent link.",
  openGraph: {
    title: "fittlist",
    description: "Follow coaches. Build your schedule. Stay connected to your local fitness community.",
    siteName: "fittlist",
    type: "website",
    // The site's own card. Profile pages override this with theirs, so it only
    // shows where the link is fittlist.co itself.
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "fittlist" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "fittlist",
    description: "Follow coaches. Build your schedule. Stay connected to your local fitness community.",
    images: ["/api/og"],
  },
  // Installed on a home screen, iOS reads these rather than the manifest.
  appleWebApp: {
    capable: true,
    title: "fittlist",
    // The status bar sits over the page, so the header's own colour shows
    // through instead of a strip of black above it.
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // The app's ground, so an installed launch has no seam between the status
  // bar and the header. It was the ink colour, which read as a dark band.
  themeColor: "#faf8f2",
  // Deliberately not viewport-fit=cover. Without it the system keeps the page
  // clear of the notch and the home indicator, which is the safe default; with
  // it every screen has to carry its own insets and the tab bar would sit
  // under the home indicator on anything that got missed.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Delight is self-hosted (see globals.css); Google Fonts only serves the icon font now. */}
        <link rel="preload" href="/fonts/delight-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/delight-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Next emits the modern `mobile-web-app-capable`. iOS before 17 only
            reads the prefixed one, and without it an install opens in Safari
            with the address bar rather than standalone. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ScrollLock />
        <NavTrack />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
