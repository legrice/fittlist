import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";

export type PushPayload = { title: string; body: string; url: string };
export function apnsConfigured() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}
export function safePushPath(raw: string) {
  if (raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return "/notifications";
  return raw;
}
export function apnsBody(payload: PushPayload, id: string) {
  return JSON.stringify({
    aps: { alert: { title: payload.title.slice(0, 100), body: payload.body.slice(0, 300) }, sound: "default" },
    url: safePushPath(payload.url), notificationId: id,
  });
}
let cached: { key: string; jwt: string; until: number } | undefined;
async function providerToken() {
  const privateKey = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const cacheKey = `${process.env.APNS_KEY_ID}:${process.env.APNS_TEAM_ID}:${privateKey}`;
  if (cached?.key === cacheKey && cached.until > Date.now()) return cached.jwt;
  const key = await importPKCS8(privateKey, "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!).setIssuedAt().sign(key);
  cached = { key: cacheKey, jwt, until: Date.now() + 40 * 60 * 1000 };
  return jwt;
}
export type ApnsResult = { status: number; reason?: string };
export async function sendApns(token: string, payload: PushPayload, id: string): Promise<ApnsResult> {
  const jwt = await providerToken();
  const environment = process.env.APNS_ENVIRONMENT || "production";
  if (!["production", "sandbox"].includes(environment)) throw new Error("Invalid APNs environment");
  const host = environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  return new Promise((resolve, reject) => {
    const client = connect(host);
    const timer = setTimeout(() => { client.destroy(); reject(new Error("APNs timeout")); }, 10000);
    const finish = () => { clearTimeout(timer); client.close(); };
    client.on("error", () => { finish(); reject(new Error("APNs connection failed")); });
    const req = client.request({ ":method": "POST", ":path": `/3/device/${token}`, authorization: `bearer ${jwt}`,
      "apns-topic": "co.fittlist.app", "apns-push-type": "alert", "apns-priority": "10", "apns-id": id,
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400) });
    let status = 0, body = "";
    req.on("response", headers => { status = Number(headers[":status"]); });
    req.on("data", chunk => { if (body.length < 1024) body += chunk.toString(); });
    req.on("error", () => { finish(); reject(new Error("APNs request failed")); });
    req.on("end", () => {
      finish();
      let reason: string | undefined;
      try { const data = JSON.parse(body); if (typeof data.reason === "string") reason = data.reason; } catch { /* Success has no body. */ }
      resolve({ status, reason });
    });
    req.end(apnsBody(payload, id));
  });
}
