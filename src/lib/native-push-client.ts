"use client";

export type DevicePushPreferences = { follows: boolean; messages: boolean; updates: boolean; adminActivity: boolean };
export type DevicePushStatus = { configured: boolean; admin: boolean; enabled: boolean; preferences: DevicePushPreferences };
export function pushDeviceId() {
  let id = localStorage.getItem("fl-push-device");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem("fl-push-device", id); }
  return id;
}
export async function nativePushAvailable() {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("PushNotifications");
}
export async function readDevicePush(): Promise<DevicePushStatus> {
  const response = await fetch(`/api/native/push?device=${pushDeviceId()}`, { cache: "no-store" });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? "Sign in to enable notifications." : "Couldn’t load notification settings."), { status: response.status });
  return response.json();
}
async function saveDevicePush(input: object) {
  const response = await fetch("/api/native/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pushDeviceId(), ...input }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn’t save notification settings.");
}
let registration: Promise<string> | null = null;
async function registerToken() {
  if (registration) return registration;
  registration = (async () => {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const handles: Array<{ remove(): Promise<void> }> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<string>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Couldn’t connect to Apple notifications. Please try again.")), 15000);
        void (async () => {
          handles.push(await PushNotifications.addListener("registration", token => resolve(token.value)));
          handles.push(await PushNotifications.addListener("registrationError", () => reject(new Error("Couldn’t register this device for notifications."))));
          await PushNotifications.register();
        })().catch(reject);
      });
    } finally { if (timer) clearTimeout(timer); await Promise.all(handles.map(h => h.remove())); }
  })();
  try { return await registration; } finally { registration = null; }
}
export async function enableDevicePush(preferences: DevicePushPreferences, prompt = true) {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" && prompt) permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") throw new Error("Allow notifications for FittList in iPhone Settings.");
  const token = await registerToken();
  await saveDevicePush({ enabled: true, token, preferences });
}
export async function disableDevicePush() {
  await saveDevicePush({ enabled: false });
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await Promise.allSettled([PushNotifications.unregister(), PushNotifications.removeAllDeliveredNotifications()]);
}
export async function refreshDevicePush() {
  if (!await nativePushAvailable()) return;
  let settings: DevicePushStatus;
  try { settings = await readDevicePush(); } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 401) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await Promise.allSettled([PushNotifications.unregister(), PushNotifications.removeAllDeliveredNotifications()]);
      return;
    }
    throw error;
  }
  if (!settings.configured || !settings.enabled) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  if ((await PushNotifications.checkPermissions()).receive !== "granted") { await disableDevicePush(); return; }
  const token = await registerToken();
  await saveDevicePush({ enabled: true, token, refresh: true });
}
