import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { markThreadRead, markThreadReadAsRequester } from "@/app/actions/inquiries";
import { ChatMessages } from "@/components/ChatMessages";
import { MarkSeen } from "@/components/MarkSeen";
import { Icon } from "@/components/Icon";
import { InquiryReply } from "@/components/InquiryReply";
import { lookMode } from "@/lib/darkmode";
import { hiddenFrom } from "@/lib/blocks";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InboxThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  if (!UUID_RE.test(id)) notFound();

  const db = await getDb();
  // Either chair opens the same room: the coach it was sent to, or the person
  // who wrote in, matched by the email on the thread. Everyone else, 404.
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.id, id));
  if (!thread) notFound();
  const [me] = await db
    .select({ look: schema.users.look, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const isCoach = thread.coachUserId === userId;
  const isRequester = !isCoach && !!me && me.email === thread.requesterEmail;
  if (!isCoach && !isRequester) notFound();
  const [requesterAccount] = isCoach
    ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, thread.requesterEmail))
    : [undefined];
  const otherUserId = isCoach ? requesterAccount?.id : thread.coachUserId;
  const conversationBlocked = !!otherUserId && (await hiddenFrom(userId)).has(otherUserId);
  const [coach] = isRequester
    ? await db
        .select({ name: schema.users.name, handle: schema.users.handle })
        .from(schema.users)
        .where(eq(schema.users.id, thread.coachUserId))
    : [undefined];

  // Opening the thread clears the coach's unread count, from the client once
  // the page is up (see MarkSeen for why not during this render).

  const messages = await db
    .select()
    .from(schema.inquiryMessages)
    .where(eq(schema.inquiryMessages.threadId, id))
    .orderBy(asc(schema.inquiryMessages.createdAt));

  return (
    <section className="screen chatscreen" data-mode={lookMode(me?.look)}>
      {isCoach && thread.coachUnread > 0 && <MarkSeen action={markThreadRead.bind(null, id)} />}
      {isRequester && thread.requesterUnread > 0 && (
        <MarkSeen action={markThreadReadAsRequester.bind(null, id)} />
      )}
      <div className="chattop">
        {/* Back where you came from. Opened from Requests, the messages tab is
            not the page underneath, and sending someone there is the shuffle
            that made a request feel like a chat in the first place. */}
        <Link
          className="iconbtn chatback"
          aria-label={from === "requests" ? "Back to requests" : "Back to messages"}
          href={from === "requests" ? "/requests" : "/inbox"}
        >
          <Icon name="arrow_back" size={20} />
        </Link>
        {isCoach ? (
          <div className="chattop-txt">
            <span className="chattop-nm">{thread.requesterName || thread.requesterEmail}</span>
            <span className="chattop-ways">
              <a href={`mailto:${thread.requesterEmail}`}>{thread.requesterEmail}</a>
              {thread.requesterPhone && (
                <a href={`tel:${thread.requesterPhone.replace(/[^\d+]/g, "")}`}>
                  {thread.requesterPhone}
                </a>
              )}
            </span>
          </div>
        ) : (
          <div className="chattop-txt">
            <span className="chattop-nm">{coach?.name || "Coach"}</span>
            {coach?.handle && (
              <span className="chattop-ways">
                <Link href={`/${coach.handle}`}>See their page</Link>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="chatbody">
        <ChatMessages messages={messages} mineIsCoach={isCoach} allowReports allowBlocking={!conversationBlocked && (isCoach || isRequester)} />
      </div>
      {thread.requesterClosedAt || thread.coachClosedAt || conversationBlocked ? <div className="chatreply"><p className="adminsub" role="status">{thread.requesterClosedAt ? "This conversation was stopped by the requester." : "This conversation is blocked."}</p></div> : <InquiryReply threadId={id} requester={isRequester} />}
    </section>
  );
}
