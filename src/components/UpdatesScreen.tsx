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
  /** The person it's about, when there is one. A follow from an email
   *  subscriber with no account has none, and falls back to the icon. */
  actor?: { name: string; photo: string | null; color: string; handle: string | null } | null;
};

type Thread = {
  id: string;
  who: string;
  preview: string;
  unread: number;
  at: Date;
  /** Someone writing in about the app, not a coach's private-session request.
   *  Only the admin ever sees one, and only they need them told apart. */
  feedback?: boolean;
};

// Only reached when a notification has no face to show. `person_add` was not
// in the icon map for months, so every row here rendered Icon's blank-circle
// fallback and nobody noticed.
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
  header,
}: {
  notifications: Notif[];
  threads: Thread[];
  initialTab: "notifications" | "messages";
  /** The app header, built on the server and handed down. */
  header?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"notifications" | "messages">(initialTab);

  const pick = (t: "notifications" | "messages") => {
    setTab(t);
    // Keep the URL shareable/back-button friendly without a navigation.
    window.history.replaceState(null, "", t === "messages" ? "/updates?tab=messages" : "/updates");
  };

  return (
    <div className="pad">
      {header}
      <div className="admintop pagetop">
        <div>
          <h1>Updates</h1>
          <p className="adminsub">Follows, requests, and messages</p>
        </div>
        <Link className="iconbtn acctclose" aria-label="Close" href="/app">
          <Icon name="close" size={18} />
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
                  {n.actor ? (
                    n.actor.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="notifrow-av" src={n.actor.photo} alt="" />
                    ) : (
                      <span
                        className="notifrow-av notifrow-av-empty"
                        style={{ background: n.actor.color }}
                        aria-hidden="true"
                      >
                        {(n.actor.name.trim().charAt(0) || "?").toUpperCase()}
                      </span>
                    )
                  ) : (
                    <span className="notifrow-ic" aria-hidden="true">
                      <Icon name={ICON[n.type] ?? "notifications"} size={20} />
                    </span>
                  )}
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
                  <span className="nm">
                    {t.who}
                    {t.feedback && <span className="inboxrow-tag">feedback</span>}
                  </span>
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
