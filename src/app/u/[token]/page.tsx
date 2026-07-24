import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { verifyUnsubToken } from "@/lib/notifier";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subscriberId = await verifyUnsubToken(token);

  let trainerName: string | null = null;
  let trainerHandle: string | null = null;
  if (subscriberId) {
    const db = await getDb();
    const [sub] = await db
      .select()
      .from(schema.subscribers)
      .where(eq(schema.subscribers.id, subscriberId));
    if (sub) {
      if (!sub.optedOutAt) {
        await db
          .update(schema.subscribers)
          .set({ optedOutAt: new Date() })
          .where(eq(schema.subscribers.id, sub.id));
      }
      const [trainer] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, sub.trainerUserId));
      trainerName = trainer?.name ?? null;
      trainerHandle = trainer?.handle ?? null;
    }
  }

  const ok = Boolean(subscriberId && trainerName);

  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        {ok ? (
          <>
            <h1>You&rsquo;re off the list.</h1>
            <p>
              No more schedule emails from <b>{trainerName}</b>. Changed your mind? Rejoin any time
              from their page.
            </p>
            {trainerHandle && (
              <Link className="btn" href={`/${trainerHandle}`}>
                Back to {trainerName}&rsquo;s schedule
              </Link>
            )}
          </>
        ) : (
          <>
            <h1>That link didn&rsquo;t work.</h1>
            <p>This unsubscribe link is invalid or was already used with an account that no longer exists.</p>
            <Link className="btn" href="/">
              Go to fittlist
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
