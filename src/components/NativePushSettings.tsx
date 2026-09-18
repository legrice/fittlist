"use client";
import { useEffect, useState } from "react";
import { nativePushAvailable, readDevicePush, enableDevicePush, disableDevicePush, type DevicePushStatus, type DevicePushPreferences } from "@/lib/native-push-client";

export function NativePushSettings() {
  const [available, setAvailable] = useState(false);
  const [settings, setSettings] = useState<DevicePushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void nativePushAvailable().then(async available => {
      if (!live || !available) return;
      setAvailable(true);
      const result = await readDevicePush();
      if (live) setSettings(result);
    }).catch(() => { if (live) setError("Couldn’t load notification settings."); });
    return () => { live = false; };
  }, []);
  if (!available) return null;
  const change = async (enabled: boolean, preferences = settings?.preferences) => {
    if (!settings || !preferences || busy) return;
    setBusy(true); setError("");
    try {
      if (enabled) await enableDevicePush(preferences);
      else await disableDevicePush();
      setSettings({ ...settings, enabled, preferences });
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t save notification settings."); }
    finally { setBusy(false); }
  };
  const rows: Array<{ key: keyof DevicePushPreferences; title: string; sub: string }> = [
    { key: "follows", title: "Follows", sub: "New followers and follow requests" },
    { key: "updates", title: "Important updates", sub: "Class cancellations, schedule changes, and account updates" },
    { key: "messages", title: "Messages", sub: "New messages and replies" },
    ...(settings?.admin ? [{ key: "adminActivity" as const, title: "All app activity", sub: "Admin alerts for activity across FittList, including town-flyer link opens" }] : []),
  ];
  return <section aria-label="Push notifications">
    <h3>On this device</h3>
    <p>Get notifications even when FittList is closed.</p>
    {settings && !settings.configured && <p role="status">Push notifications are being set up. Please check back soon.</p>}
    <button className="setrow" role="switch" aria-checked={settings?.enabled ?? false} disabled={busy || !settings?.configured}
      onClick={() => void change(!settings?.enabled, settings && !settings.enabled ? { ...settings.preferences, adminActivity: settings.admin } : settings?.preferences)}>
      <span className="setrow-txt"><span className="t">Push notifications</span></span>
      <span className={`switch${settings?.enabled ? " on" : ""}`} aria-hidden="true"><span className="switch-knob" /></span>
    </button>
    {settings?.enabled && rows.map(row => <button key={row.key} className="setrow" role="switch" aria-checked={settings.preferences[row.key]} disabled={busy}
      onClick={() => void change(true, { ...settings.preferences, [row.key]: !settings.preferences[row.key] })}>
      <span className="setrow-txt"><span className="t">{row.title}</span><span className="s">{row.sub}</span></span>
      <span className={`switch${settings.preferences[row.key] ? " on" : ""}`} aria-hidden="true"><span className="switch-knob" /></span>
    </button>)}
    {error && <p role="alert">{error}</p>}
    {error && !settings && <button className="btn" onClick={() => void readDevicePush().then(value => { setSettings(value); setError(""); }).catch(() => setError("Couldn’t load notification settings."))}>Try again</button>}
  </section>;
}
