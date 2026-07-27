import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { verifyInquiryToken } from "@/lib/inquiry";
import { ChatMessages } from "@/components/ChatMessages";
import { InquiryReply } from "@/components/InquiryReply";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

// The visitor's view of their private-session conversation, reached from the
// link in the coach's reply email. No account needed — the token is the key.
export default async function InquiryThreadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const threadId = await verifyInquiryToken(token);
  if (!threadId) notFound();

  const db = await getDb();
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.id, threadId));
  if (!thread) notFound();

  const [coach] = await db
    .select({ name: schema.users.name, handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, thread.coachUserId));

  const messages = await db
    .select()
    .from(schema.inquiryMessages)
    .where(eq(schema.inquiryMessages.threadId, threadId))
    .orderBy(asc(schema.inquiryMessages.createdAt));

  return (
    <section className="screen chatscreen chatscreen-pub">
      <div className="chattop">
        <div className="chattop-txt">
          <span className="chattop-nm">{coach?.name ?? "Your coach"}</span>
          <span className="chattop-sub">Private session request</span>
        </div>
      </div>
      <div className="chatbody">
        <ChatMessages messages={messages} mineIsCoach={false} />
      </div>
      <InquiryReply token={token} />
      <div className="chatfoot">
        <Wordmark variant="ink" className="mw-logo" />
      </div>
    </section>
  );
}
