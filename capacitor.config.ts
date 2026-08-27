import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://www.fittlist.co";
const serverHost = new URL(serverUrl).hostname;

const config: CapacitorConfig = {
  appId: "co.fittlist.app",
  appName: "FittList",
  webDir: "native-shell",
  server: {
    // The catalog and profiles are server-rendered from the live database. The
    // shell therefore loads the canonical app instead of shipping a second,
    // stale static copy of FittList.
    // Vercel redirects the apex domain to www. Starting at the canonical host
    // prevents iOS from interpreting that redirect as a request for Safari.
    url: serverUrl,
    // Preview builds may opt into one exact CAPACITOR_SERVER_URL host. A
    // wildcard preview domain in a release shell lets unrelated pages reach
    // native message handlers.
    allowNavigation: [...new Set(["fittlist.co", "www.fittlist.co", serverHost])],
    cleartext: false,
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
  plugins: {
    StatusBar: {
      // Reserve the system status area instead of laying the web view beneath
      // the clock, Dynamic Island and signal indicators.
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#191502",
    },
  },
};

export default config;
