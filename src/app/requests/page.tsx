import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { BackLink } from "@/components/BackLink";
import { AppChrome } from "@/components/AppChrome";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

// Everyone who has asked this coach about private sessions, most recent first.
//
// These threads used to be reachable only through the Messages tab, which made
// a request look like a chat: you saw the word "request" and landed in a
// conversation with no sense of who else had asked or how to reach them. This
// is the list instead. Name, email, phone if they left one, what they wrote,
// and a way to answer. No states, no pipeline: it is a record of people, not a
// booking system.

const fmtWhen = (d: Date) => {
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default async function RequestsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look, kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // A member has no public page to be asked through, so no room to show them.
  if (me?.kind === "fan") redirect("/you");

  // kind, not just the coach id: the admin is a coach too, and their feedback
  // threads live in this same table. Those are not requests.
  const threads = await db
    .select()
    .from(schema.inquiryThreads)
    .where(
      and(
        eq(schema.inquiryThreads.coachUserId, userId),
        eq(schema.inquiryThreads.kind, "inquiry"),
      ),
    )
    .orderBy(desc(schema.inquiryThreads.lastMessageAt));

  const ids = threads.map((t) => t.id);
  const msgs = ids.length
    ? await db
        .select()
        .from(schema.inquiryMessages)
        .where(inArray(schema.inquiryMessages.threadId, ids))
        .orderBy(desc(schema.inquiryMessages.createdAt))
    : [];
  // What they asked for, not the last thing said. A coach's own reply is a
  // useless preview: they already know what they wrote.
  const theirs = new Map<string, string>();
  for (const m of msgs) if (!m.fromCoach && !theirs.has(m.threadId)) theirs.set(m.threadId, m.body);

  return (
    <section className="screen admin hasnav" data-mode={me?.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <div className="folback">
          <BackLink className="evback" href="/app?acct=1" label="Back to your account">
            <Icon name="arrow_back" size={21} />
          </BackLink>
        </div>
        <div className="admintop">
          <div>
            <h1>Requests</h1>
            <p className="adminsub">
              {threads.length === 0
                ? "Nobody has asked yet"
                : `${threads.length} ${threads.length === 1 ? "person has" : "people have"} asked about private sessions`}
            </p>
          </div>
        </div>

        {threads.length === 0 ? (
          <div className="empty-block">
            <h2>No requests yet</h2>
            <p>
              When someone asks about private sessions from your page, they land here with the
              way to reach them.
            </p>
          </div>
        ) : (
          <div className="reqlist">
            {threads.map((t) => (
              <div key={t.id} className={`reqcard${t.coachUnread > 0 ? " unread" : ""}`}>
                <div className="reqcard-top">
                  <span className="reqcard-nm">{t.requesterName || t.requesterEmail}</span>
                  <span className="reqcard-when">{fmtWhen(new Date(t.lastMessageAt))}</span>
                </div>
                <p className="reqcard-msg">{theirs.get(t.id) ?? ""}</p>
                <div className="reqcard-ways">
                  <a className="reqway" href={`mailto:${t.requesterEmail}`}>
                    <Icon name="mail" size={15} />
                    {t.requesterEmail}
                  </a>
                  {t.requesterPhone && (
                    <a className="reqway" href={`tel:${t.requesterPhone.replace(/[^\d+]/g, "")}`}>
                      <Icon name="call" size={15} />
                      {t.requesterPhone}
                    </a>
                  )}
                </div>
                <Link className="btn ghost reqcard-btn" href={`/inbox/${t.id}?from=requests`}>
                  {t.coachUnread > 0 ? "Read and reply" : "Open the thread"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
