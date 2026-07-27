import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { ChatMessages } from "@/components/ChatMessages";
import { Icon } from "@/components/Icon";
import { InquiryReply } from "@/components/InquiryReply";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InboxThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  if (!UUID_RE.test(id)) notFound();

  const db = await getDb();
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(and(eq(schema.inquiryThreads.id, id), eq(schema.inquiryThreads.coachUserId, userId)));
  if (!thread) notFound();

  // Opening the thread clears the coach's unread count.
  if (thread.coachUnread > 0) {
    await db.update(schema.inquiryThreads).set({ coachUnread: 0 }).where(eq(schema.inquiryThreads.id, id));
  }

  const messages = await db
    .select()
    .from(schema.inquiryMessages)
    .where(eq(schema.inquiryMessages.threadId, id))
    .orderBy(asc(schema.inquiryMessages.createdAt));

  return (
    <section className="screen chatscreen">
      <div className="chattop">
        <Link className="iconbtn chatback" aria-label="Back to inbox" href="/inbox">
          <Icon name="arrow_back" size={18} />
        </Link>
        <div className="chattop-txt">
          <span className="chattop-nm">{thread.requesterName || thread.requesterEmail}</span>
          <a className="chattop-sub" href={`mailto:${thread.requesterEmail}`}>{thread.requesterEmail}</a>
        </div>
      </div>
      <div className="chatbody">
        <ChatMessages messages={messages} mineIsCoach />
      </div>
      <InquiryReply threadId={id} />
    </section>
  );
}
