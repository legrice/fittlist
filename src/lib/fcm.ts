import { JWT } from "google-auth-library";
import { safePushPath, type PushPayload, type ApnsResult } from "@/lib/apns";
export function fcmConfigured() {
  return !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}
export function validPushToken(platform: string, token: unknown): token is string {
  return typeof token === "string" && (platform === "ios" ? /^[0-9a-f]{64,256}$/i.test(token) : platform === "android" && /^[A-Za-z0-9_:\-]{20,4096}$/.test(token));
}
export function fcmBody(token: string, payload: PushPayload, id: string) {
  return { message: { token, notification: { title: payload.title.slice(0,100), body: payload.body.slice(0,300) }, data: { url: safePushPath(payload.url), notificationId: id }, android: { priority: "HIGH", ttl: "86400s", restricted_package_name: "co.fittlist.app", notification: { channel_id: "fittlist_activity", icon: "ic_stat_fittlist", sound: "default" } } } };
}
let cached: { fingerprint: string; client: JWT } | undefined;
export async function sendFcm(token: string, payload: PushPayload, id: string): Promise<ApnsResult> {
  const project = process.env.FCM_PROJECT_ID!;
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error("Invalid FCM project");
  const key = process.env.FCM_PRIVATE_KEY!.replace(/\\n/g,"\n");
  const fingerprint = `${project}:${process.env.FCM_CLIENT_EMAIL}:${key}`;
  if (cached?.fingerprint !== fingerprint) cached = { fingerprint, client: new JWT({ email: process.env.FCM_CLIENT_EMAIL, key, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] }) };
  const { token: accessToken } = await cached.client.getAccessToken();
  if (!accessToken) throw new Error("FCM authentication unavailable");
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(fcmBody(token,payload,id)), signal: AbortSignal.timeout(10000) });
  if (response.ok) return {status:200};
  const data = await response.json().catch(() => ({}));
  // Only Firebase's specific token error invalidates a registration; generic
  // INVALID_ARGUMENT can instead indicate a malformed message/configuration.
  const unregistered = data?.error?.details?.some((detail: { "@type"?: string; errorCode?: string }) => detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" && detail.errorCode === "UNREGISTERED");
  return { status: unregistered ? 410 : response.status, ...(unregistered ? {reason:"Unregistered"} : {}) };
}
