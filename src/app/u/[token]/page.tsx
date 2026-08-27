import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { confirmSubscriberUnsubscribe } from "@/app/actions/unsubscribe";
import { getDb, schema } from "@/db";
import { verifyUnsubToken } from "@/lib/notifier";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe · FittList",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const subscriberId = await verifyUnsubToken(token);

  let trainerName: string | null = null;
  let trainerHandle: string | null = null;
  let alreadyOptedOut = false;
  if (subscriberId) {
    const db = await getDb();
    const [sub] = await db
      .select()
      .from(schema.subscribers)
      .where(eq(schema.subscribers.id, subscriberId));
    if (sub) {
      alreadyOptedOut = !!sub.optedOutAt;
      const [trainer] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, sub.trainerUserId));
      trainerName = trainer?.name ?? null;
      trainerHandle = trainer?.handle ?? null;
    }
  }

  const ok = Boolean(subscriberId && trainerName);
  const done = query.done === "1" || alreadyOptedOut;

  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        {ok ? (
          done ? (
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
              <h1>Stop schedule emails?</h1>
              <p>Confirm that you no longer want schedule emails from <b>{trainerName}</b>.</p>
              <form action={confirmSubscriberUnsubscribe}>
                <input type="hidden" name="token" value={token} />
                <button className="btn" type="submit">Unsubscribe</button>
              </form>
            </>
          )
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
