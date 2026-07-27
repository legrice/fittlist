import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { verifyDigestUnsubToken } from "@/lib/notifier";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

// Confirmation for stopping the merged weekly digest. Deliberately does NOT
// unfollow anyone: the feed stays exactly as it was.
export default async function DigestUnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const userId = await verifyDigestUnsubToken(token);

  let ok = false;
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (user) {
      if (!user.digestOptOutAt) {
        await db
          .update(schema.users)
          .set({ digestOptOutAt: new Date() })
          .where(eq(schema.users.id, user.id));
      }
      ok = true;
    }
  }

  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        {ok ? (
          <>
            <h1>No more weekly emails.</h1>
            <p>
              You&rsquo;re still following your coaches — their classes are always waiting in your
              week. We just won&rsquo;t email you about them.
            </p>
            <Link className="btn" href="/feed">
              Open your week
            </Link>
          </>
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
