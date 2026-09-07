import type { CapacitorConfig } from "@capacitor/cli";

const development = process.env.CAPACITOR_ENV === "development";
if (process.env.CAPACITOR_ENV && !["production", "development"].includes(process.env.CAPACITOR_ENV)) {
  throw new Error("CAPACITOR_ENV must be production or development");
}
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? "https://www.fittlist.co";
const server = new URL(serverUrl);
if (server.username || server.password || server.search || server.hash) {
  throw new Error("Native server URLs must not contain credentials, query parameters, or fragments");
}
if (!development && server.href !== "https://www.fittlist.co/") {
  throw new Error("Release shells must use https://www.fittlist.co; preview testing requires CAPACITOR_ENV=development");
}
if (server.protocol !== "https:" && !(development && server.protocol === "http:" && ["localhost", "127.0.0.1"].includes(server.hostname))) {
  throw new Error("Native servers require HTTPS; only explicit local development may use loopback HTTP");
}

const config: CapacitorConfig = {
  appId: "co.fittlist.app",
  appName: "FittList",
  webDir: "native-shell",
  loggingBehavior: development ? "debug" : "none",
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
    allowNavigation: [...new Set(["fittlist.co", "www.fittlist.co", server.hostname])],
    cleartext: development && server.protocol === "http:",
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scrollEnabled: true,
    webContentsDebuggingEnabled: development,
  },
  plugins: {
    StatusBar: {
      // Reserve the system status area instead of laying the web view beneath
      // the clock, Dynamic Island and signal indicators.
      overlaysWebView: false,
      // Light is the default appearance; NativeAppBridge updates both the
      // glyph style and this background when a signed-in viewer chooses dark.
      style: "LIGHT",
      backgroundColor: "#fdfcf7",
    },
  },
};

export default config;
