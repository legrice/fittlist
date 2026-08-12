import type { MetadataRoute } from "next";

// What a home-screen install looks like.
//
// `start_url` is the app rather than the marketing page: someone who installs
// this has already signed up, and landing them back on "Follow coaches. Not
// studios." every launch would be absurd. Signed out, /app sends them to the
// door anyway.
//
// The two icon sets are not the same picture. A maskable icon gets cropped to
// whatever shape the launcher uses, so its mark sits well inside the square
// and the ink runs to the edge; the "any" one keeps its own rounded corners.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "fittlist",
    short_name: "fittlist",
    description:
      "Coaches share one schedule. Members follow once and never miss a class.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the header, so the status bar reads as part of the app rather
    // than a strip of something else above it.
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
