import type { MetadataRoute } from "next";

// What a home-screen install looks like.
//
// `start_url` is the app rather than the marketing page: someone who installs
// this has already signed up, and landing them back on onboarding every launch
// would be absurd. Calendar already owns the signed-out redirect, so there is
// no reason to pay for the legacy /app authentication pass first.
//
// The two icon sets use the same dark field. A maskable icon gets cropped to
// whatever shape the launcher uses, so its mark sits farther inside the safe
// zone; the ordinary browser icon carries the larger lime mark.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "fittlist",
    short_name: "fittlist",
    description:
      "Coaches share one schedule. Members follow once and never miss a class.",
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the header, so the status bar reads as part of the app rather
    // than a strip of something else above it.
    background_color: "#9FE870",
    theme_color: "#9FE870",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
