"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MarkSeen } from "@/components/MarkSeen";
import { NewMessage, type MessagePerson } from "@/components/NewMessage";

// Notifications and Messages share the same quiet list grammar, but each owns
// its route and header action. There is no mode switch hidden inside either.

export type Notif = {
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
// Names reached through this table hide from any audit that greps literal
// <Icon name="...">, so every type here must exist in ICONS or it ships as
// the blank circle.
// Every notification type needs a row here, or its icon falls back to a blank
// circle (the Icon component's typo guard).
const ICON: Record<string, string> = {
  follow: "person_add",
  announce: "campaign",
  class_cancelled: "event",
  coach_request: "person_add",
  coach_approved: "check",
  message: "mail",
  feedback_reply: "mail",
  studio_suggest: "place",
  follow_request: "person_add",
  class_overlap: "flag",
  studio_manager: "verified",
  badge_received: "verified",
  shift_assigned: "calendar_month",
  shift_dropped: "event",
  // A change waiting on the studio, and the answer when it is no. A type with
  // no entry here renders a blank circle and nothing complains, which is how
  // every notification row was empty for months.
  shift_request: "schedule",
  shift_declined: "close",
};

function fmt(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationList({ notifications }: { notifications: Notif[] }) {
  if (notifications.length === 0) {
    return (
      <p className="adminempty" style={{ marginTop: 24 }}>
        Nothing yet. When someone follows your schedule, you&rsquo;ll see it here.
      </p>
    );
  }
  const sorted = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    <div className="notiflist">
      {sorted.map((n, index) => {
        const date = new Date(n.createdAt);
        const startsDay = index === 0 || date.toDateString() !== new Date(sorted[index - 1].createdAt).toDateString();
        const dayLabel = date.toDateString() === today.toDateString() ? "Today"
          : date.toDateString() === yesterday.toDateString() ? "Yesterday"
          : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}) });
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
                <Icon name={ICON[n.type] ?? "notifications"} size={22} />
              </span>
            )}
            <span className="notifrow-main">
              <span className="notifrow-top">
                <span className="tm">{fmt(n.createdAt)}</span>
                <span className="nm">{n.title}</span>
              </span>
              {n.body && <span className="notifrow-body">{n.body}</span>}
              {n.type === "shift_request" && n.href && <span className="notifrow-action">Review request <Icon name="chevron_right" size={17} /></span>}
            </span>
            {!n.readAt && <span className="notifrow-dot" aria-hidden="true" />}
          </>
        );
        const cls = `notifrow${n.readAt ? "" : " unread"}`;
        return <Fragment key={n.id}>
          {startsDay && <h3 className="notification-date-heading">{dayLabel}</h3>}
          {n.href ? (
          <Link key={n.id} href={n.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={n.id} className={cls}>
            {inner}
          </div>
        )}</Fragment>;
      })}
    </div>
  );
}

function ThreadList({ threads, people }: { threads: Thread[]; people: MessagePerson[] }) {
  if (threads.length === 0) {
    return (
      <div className="adminempty inbox-empty" style={{ marginTop: 24 }}>
        <p>No messages yet.</p>
        <NewMessage people={people} empty />
      </div>
    );
  }
  return (
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
  );
}

export function UpdatesScreen({
  notifications,
  threads,
  mode,
  markSeen,
  header,
  messagePeople = [],
}: {
  notifications?: Notif[];
  threads?: Thread[];
  mode: "notifications" | "messages";
  markSeen?: () => Promise<void>;
  /** The app header, built on the server and handed down. */
  header?: React.ReactNode;
  messagePeople?: MessagePerson[];
}) {
  const router = useRouter();
  return (
    <div className="pad">
      {header}
      {mode === "notifications" && markSeen && <MarkSeen action={markSeen} />}
      <div className="admintop pagetop">
        <div>
          <h1>{mode === "notifications" ? "Notifications" : "Messages"}</h1>
          <p className="adminsub">
            {mode === "notifications" ? "Calendar, badge, and account activity" : "Your conversations"}
          </p>
        </div>
        <div className="updates-actions">
          {mode === "messages" && <NewMessage people={messagePeople} />}
          <button type="button" className="iconbtn acctclose" aria-label="Close" onClick={() => router.back()}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      {mode === "notifications" ? (
        <NotificationList notifications={notifications ?? []} />
      ) : (
        <ThreadList threads={threads ?? []} people={messagePeople} />
      )}
    </div>
  );
}
