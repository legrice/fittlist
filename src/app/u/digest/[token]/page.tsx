import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { confirmDigestUnsubscribe } from "@/app/actions/unsubscribe";
import { getDb, schema } from "@/db";
import { verifyDigestUnsubToken } from "@/lib/notifier";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preferences · FittList",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Confirmation for stopping the merged weekly digest. Deliberately does NOT
// unfollow anyone: the feed stays exactly as it was.
export default async function DigestUnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const userId = await verifyDigestUnsubToken(token);

  let ok = false;
  let alreadyOptedOut = false;
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (user) {
      alreadyOptedOut = !!user.digestOptOutAt;
      ok = true;
    }
  }
  const done = query.done === "1" || alreadyOptedOut;

  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        {ok ? (
          done ? (
            <>
              <h1>No more weekly emails.</h1>
              <p>
                You&rsquo;re still following your coaches. Their classes are always waiting in your
                week. We just won&rsquo;t email you about them.
              </p>
              <Link className="btn" href="/week">
                Open your week
              </Link>
            </>
          ) : (
            <>
              <h1>Stop weekly emails?</h1>
              <p>You&rsquo;ll still follow your coaches and can see their classes in your week.</p>
              <form action={confirmDigestUnsubscribe}>
                <input type="hidden" name="token" value={token} />
                <button className="btn" type="submit">Stop weekly emails</button>
              </form>
            </>
          )
        ) : (
          <>
            <h1>That link didn&rsquo;t work.</h1>
            <p>This unsubscribe link is invalid or belongs to an account that no longer exists.</p>
            <Link className="btn" href="/">
              Go to fittlist
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
