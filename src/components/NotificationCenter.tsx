"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NotificationFeed, type NotificationPage } from "@/components/NotificationFeed";
import { NotificationList } from "@/components/UpdatesScreen";
import { loadInboxSheet } from "@/app/actions/inbox";
import { withTimeout } from "@/lib/async";
import { LoadingDots } from "@/components/LoadingDots";
function MessageInbox() {
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof loadInboxSheet>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    void withTimeout(loadInboxSheet()).then(rows => { if (live) setThreads(rows); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);
  return <><Link className="adminback" href="/inbox">New message / all conversations</Link>{failed ? <p role="status">Couldn’t load messages. <button className="adminback" onClick={() => setAttempt(value => value + 1)}>Try again</button></p> : !threads ? <LoadingDots label="Loading messages" /> : threads.length === 0 ? <p>No conversations yet.</p> : <div className="inbox-list">{threads.map(thread => <Link className={`inboxrow${thread.unread ? " unread" : ""}`} href={`/inbox/${thread.id}`} key={thread.id}><span className="inboxrow-av" aria-hidden="true">{thread.who.charAt(0).toUpperCase()}</span><span className="inboxrow-main"><span className="inboxrow-top"><span className="nm">{thread.who}</span><span className="tm">{new Date(thread.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span><span className="inboxrow-preview">{thread.preview}</span></span>{thread.unread > 0 && <span className="inboxrow-badge" aria-label={`${thread.unread} unread messages`}>{thread.unread}</span>}</Link>)}</div>}</>;
}
export function NotificationCenter({ initialPage }: { initialPage?: NotificationPage }) {
  const [tab, setTab] = useState("notifications");
  return <><div className="notification-center-tabs" role="group" aria-label="Inbox sections"><button aria-pressed={tab === "notifications"} onClick={() => setTab("notifications")}>Notifications</button><button aria-pressed={tab === "messages"} onClick={() => setTab("messages")}>Messages</button></div>{tab === "notifications" ? <NotificationFeed initialPage={initialPage} renderList={rows => <NotificationList notifications={rows} />} /> : <MessageInbox />}</>;
}
