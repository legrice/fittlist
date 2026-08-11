import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "co.fittlist.app",
  appName: "FittList",
  webDir: "native-shell",
  server: {
    // The catalog and profiles are server-rendered from the live database. The
    // shell therefore loads the canonical app instead of shipping a second,
    // stale static copy of FittList.
    url: process.env.CAPACITOR_SERVER_URL ?? "https://fittlist.co",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
};

export default config;
