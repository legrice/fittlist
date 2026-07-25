import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  const title = `${user.name} — fittlist`;
  const description = user.about?.trim() || `${user.name}'s coaching schedule — every studio, one link.`;
  const url = `${siteOrigin()}/${handle}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "fittlist",
      type: "profile",
      images: user.photo ? [{ url: user.photo }] : undefined,
    },
    twitter: { card: user.photo ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  // The profile is the shared landing — count the visit (not the owner, not bots).
  const [viewerId, hdrs] = await Promise.all([getSessionUserId(), headers()]);
  if (viewerId !== user.id && !looksLikeBot(hdrs.get("user-agent"))) {
    try {
      await recordVisit(user.id);
    } catch (err) {
      console.error("visit rollup failed", err);
    }
  }
  const isOwner = viewerId === user.id;

  return (
    <div className="pub profile" data-theme={user.theme}>
      {isOwner && (
        <div className="previewbar">
          <span>
            <Icon name="visibility" size={16} className="pv-eye" /> Previewing your profile
          </span>
          <Link className="previewback" href="/app">
            ← Back to your account
          </Link>
        </div>
      )}
      <div className="profwrap">
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profphoto" src={user.photo} alt={user.name} />
        ) : (
          <div className="profphoto profphoto-empty" aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <h1 className="profname">{user.name}</h1>
        {user.about?.trim() && <p className="profabout">{user.about}</p>}
        <div className="madewith">
          Made with <Wordmark variant="ink" className="mw-logo" /> — coach classes?{" "}
          <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
      <div className="profcta">
        <Link className="btn si" href={`/${handle}/schedule`}>
          View schedule
        </Link>
      </div>
    </div>
  );
}
