import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
import { PublicProfileView } from "@/components/PublicProfileView";
import { MemberProfileView } from "@/components/MemberProfileView";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  const title = `${user.name} · fittlist`;
  const description =
    user.about?.trim() ||
    (user.kind === "fan"
      ? `${user.name} on fittlist.`
      : `${user.name}'s coaching schedule, every studio in one link.`);
  const url = `${siteOrigin()}/${handle}`;
  // The card is a real URL that composes the photo in. users.photo is a data
  // URL, and an unfurler fetches og:image over HTTP rather than decoding it, so
  // pointing the tag at the column shared a profile with no image at all.
  const image = `${siteOrigin()}/api/og/${handle}`;
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
      images: [{ url: image, width: 1200, height: 630, alt: user.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  // The profile is the shared landing - count the visit (not the owner, not bots).
  const [viewerId, hdrs] = await Promise.all([getSessionUserId(), headers()]);
  if (viewerId !== user.id && !looksLikeBot(hdrs.get("user-agent"))) {
    try {
      await recordVisit(user.id);
    } catch (err) {
      console.error("visit rollup failed", err);
    }
  }
  const isOwner = viewerId === user.id;

  // A member has the same kind of link and no schedule behind it, so their
  // profile is its own, much smaller page.
  if (user.kind === "fan") {
    return <MemberProfileView user={user} isOwner={isOwner} from={from} />;
  }
  return <PublicProfileView user={user} isOwner={isOwner} initialTab="about" from={from} />;
}
