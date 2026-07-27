import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUserId } from "@/lib/session";
import { listNotifications, markNotificationsRead } from "@/lib/notify";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = { follow: "person_add" };

function fmt(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function NotificationsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const rows = await listNotifications(userId);
  // Landing here is the "I've seen these" signal — clear the unread badge.
  await markNotificationsRead(userId);

  return (
    <section className="screen admin">
      <div className="pad">
        <div className="admintop">
          <div>
            <h1>Notifications</h1>
            <p className="adminsub">New followers and activity</p>
          </div>
          <Link className="adminback" href="/app">
            <Icon name="arrow_back" size={18} /> App
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="adminempty" style={{ marginTop: 24 }}>
            Nothing yet. When someone follows your schedule, you&rsquo;ll see it here.
          </p>
        ) : (
          <div className="notiflist">
            {rows.map((n) => {
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
        )}
      </div>
    </section>
  );
}
