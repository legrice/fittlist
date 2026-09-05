"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  notificationPrefs,
  setNotificationPref,
  type NotifPrefs,
} from "@/app/actions/notifprefs";
import { Icon } from "@/components/Icon";

// Settings > Notifications. Three switches, all about email. The in-app
// notification history remains system-owned; these control which updates
// also leave the app and reach the account's inbox.
const ROWS: { key: keyof NotifPrefs; title: string; sub: string }[] = [
  {
    key: "messages",
    title: "Messages",
    sub: "An email when someone writes to you or replies",
  },
  {
    key: "cancellations",
    title: "Cancelled classes",
    sub: "An email when a class you marked Going is cancelled",
  },
  {
    key: "digest",
    title: "Weekly digest",
    sub: "The week from coaches you follow, every Sunday",
  },
];

export function NotificationPrefs() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fresh on every open: a stale switch that flips back on tap reads as broken.
  useEffect(() => {
    if (open) notificationPrefs().then(setPrefs);
  }, [open]);

  const flip = (key: keyof NotifPrefs) => {
    if (!prefs) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setNotificationPref(key, next).then((r) => {
      if (!r.ok) setPrefs((p) => (p ? { ...p, [key]: !next } : p));
    });
  };

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="notifications" size={24} />
        </span>
        <span className="setrow-txt">
          <span className="t">Notifications</span>
          <span className="s">Which emails you get from fittlist</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={22} />
        </span>
      </button>
      {open && mounted &&
        createPortal(
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="sheet">
              <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setOpen(false)}>
                <Icon name="close" size={20} />
              </button>
              <h2>Notifications</h2>
              <p className="lead">
                These settings control which updates also reach your email inbox.
              </p>
              <div className="settingslist">
                {ROWS.map((r) => (
                  <button
                    key={r.key}
                    className="setrow"
                    onClick={() => flip(r.key)}
                    disabled={!prefs}
                    aria-pressed={prefs ? prefs[r.key] : undefined}
                  >
                    <span className="setrow-txt">
                      <span className="t">{r.title}</span>
                      <span className="s">{r.sub}</span>
                    </span>
                    <span className={`switch${prefs && prefs[r.key] ? " on" : ""}`} aria-hidden="true">
                      <span className="switch-knob" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
