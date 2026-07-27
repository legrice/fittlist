"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";

// The Updates screen behind the header bell: one place for everything that
// happened — a Notifications feed and the Messages (private-session) inbox,
// switched by a segmented toggle.

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

type Thread = {
  id: string;
  who: string;
  preview: string;
  unread: number;
  at: Date;
};

const ICON: Record<string, string> = { follow: "person_add" };

function fmt(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function UpdatesScreen({
  notifications,
  threads,
  initialTab,
}: {
  notifications: Notif[];
  threads: Thread[];
  initialTab: "notifications" | "messages";
}) {
  const [tab, setTab] = useState<"notifications" | "messages">(initialTab);

  const pick = (t: "notifications" | "messages") => {
    setTab(t);
    // Keep the URL shareable/back-button friendly without a navigation.
    window.history.replaceState(null, "", t === "messages" ? "/updates?tab=messages" : "/updates");
  };

  return (
    <div className="pad">
      <div className="admintop">
        <div>
          <h1>Updates</h1>
          <p className="adminsub">Follows, requests, and messages</p>
        </div>
        <Link className="adminback" href="/app">
          <Icon name="arrow_back" size={18} /> App
        </Link>
      </div>

      <div className="seg updateseg">
        <button className={tab === "notifications" ? "sel" : ""} onClick={() => pick("notifications")}>
          Notifications
        </button>
        <button className={tab === "messages" ? "sel" : ""} onClick={() => pick("messages")}>
          Messages
        </button>
      </div>

      {tab === "notifications" ? (
        notifications.length === 0 ? (
          <p className="adminempty" style={{ marginTop: 24 }}>
            Nothing yet. When someone follows your schedule, you&rsquo;ll see it here.
          </p>
        ) : (
          <div className="notiflist">
            {notifications.map((n) => {
              const inner = (
                <>
                  <span className="notifrow-ic" aria-hidden="true">
                    <Icon name={ICON[n.type] ?? "notifications"} size={20} />
                  </span>
                  <span className="notifrow-main">
                    <span className="notifrow-top">
                      <span className="nm">{n.title}</span>
                      <span className="tm">{fmt(n.createdAt)}</span>
                    </span>
                    {n.body && <span className="notifrow-body">{n.body}</span>}
                  </span>
                  {!n.readAt && <span className="notifrow-dot" aria-hidden="true" />}
                </>
              );
              const cls = `notifrow${n.readAt ? "" : " unread"}`;
              return n.href ? (
                <Link key={n.id} href={n.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )
      ) : threads.length === 0 ? (
        <p className="adminempty" style={{ marginTop: 24 }}>
          No messages yet. When someone requests a private session, it lands here.
        </p>
      ) : (
        <div className="inbox-list">
          {threads.map((t) => (
            <Link key={t.id} href={`/inbox/${t.id}`} className={`inboxrow${t.unread > 0 ? " unread" : ""}`}>
              <span className="inboxrow-av" aria-hidden="true">
                {(t.who.trim().charAt(0) || "?").toUpperCase()}
              </span>
              <span className="inboxrow-main">
                <span className="inboxrow-top">
                  <span className="nm">{t.who}</span>
                  <span className="tm">{fmt(t.at)}</span>
                </span>
                <span className="inboxrow-preview">{t.preview}</span>
              </span>
              {t.unread > 0 && <span className="inboxrow-badge">{t.unread}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
