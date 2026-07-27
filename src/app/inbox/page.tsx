import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

function fmt(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function InboxPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const threads = await db
    .select()
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.coachUserId, userId))
    .orderBy(desc(schema.inquiryThreads.lastMessageAt));

  // Latest message per thread for the preview line.
  const ids = threads.map((t) => t.id);
  const msgs = ids.length
    ? await db
        .select()
        .from(schema.inquiryMessages)
        .where(inArray(schema.inquiryMessages.threadId, ids))
        .orderBy(desc(schema.inquiryMessages.createdAt))
    : [];
  const latest = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) if (!latest.has(m.threadId)) latest.set(m.threadId, m);

  return (
    <section className="screen admin" data-mode={me?.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <div className="admintop">
          <div>
            <h1>Inbox</h1>
            <p className="adminsub">Private session requests</p>
          </div>
          <Link className="adminback" href="/app">
            <Icon name="arrow_back" size={18} /> App
          </Link>
        </div>

        {threads.length === 0 ? (
          <p className="adminempty" style={{ marginTop: 24 }}>
            No messages yet. When someone requests a private session, it lands here.
          </p>
        ) : (
          <div className="inbox-list">
            {threads.map((t) => {
              const last = latest.get(t.id);
              const preview = last ? `${last.fromCoach ? "You: " : ""}${last.body}` : "";
              const who = t.requesterName || t.requesterEmail;
              return (
                <Link key={t.id} href={`/inbox/${t.id}`} className={`inboxrow${t.coachUnread > 0 ? " unread" : ""}`}>
                  <span className="inboxrow-av" aria-hidden="true">
                    {(who.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                  <span className="inboxrow-main">
                    <span className="inboxrow-top">
                      <span className="nm">{who}</span>
                      <span className="tm">{fmt(t.lastMessageAt)}</span>
                    </span>
                    <span className="inboxrow-preview">{preview}</span>
                  </span>
                  {t.coachUnread > 0 && <span className="inboxrow-badge">{t.coachUnread}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
