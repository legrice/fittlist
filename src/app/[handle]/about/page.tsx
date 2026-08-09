import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { MemberProfileView } from "@/components/MemberProfileView";
import { PublicProfileView } from "@/components/PublicProfileView";

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
  const title = `About ${user.name} · fittlist`;
  const description = `Who ${user.name} is and where they coach.`;
  const url = `${siteOrigin()}/${handle}/about`;
  // Every URL a coach's page answers to carries the same card. It's the same
  // person whichever section you were sent to.
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

// The About tab, as its own page. The bare handle is the schedule now, so this
// is where the bio, the focus list, the certifications and the studios live.
export default async function AboutPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const viewerId = await getSessionUserId();
  // Blocked: the page simply isn't there. Same shape as a deleted account, so
  // it says nothing about why.
  if (await isBlocked(user.id, viewerId)) notFound();
  // A member's page wears the same two-tab shape now, so their /about is the
  // Info tab rather than a missing page.
  if (user.kind === "fan") {
    return (
      <MemberProfileView
        user={user}
        isOwner={viewerId === user.id}
        viewerId={viewerId}
        tab="about"
        from={from}
      />
    );
  }
  return <PublicProfileView user={user} isOwner={viewerId === user.id} tab="about" from={from} />;
}
