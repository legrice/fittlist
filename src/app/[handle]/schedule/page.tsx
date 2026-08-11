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
  const title = `${user.name}'s schedule · fittlist`;
  const description = `${user.name}'s coaching schedule, every studio in one link.`;
  // The schedule is the bare handle now. This URL still resolves, because
  // people have already sent it, and points search engines at the canonical one.
  const url = `${siteOrigin()}/${handle}`;
  // A coach's page answers to two URLs and people share both, so the card has
  // to be on both. Same card: it's the same person either way.
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

// /{handle}/schedule is the Schedule pill's own address now that About
// leads the bare handle, by Matt's call, and it was the shareable schedule
// link long before that, so it serves both kinds.
export default async function SchedulePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const viewerId = await getSessionUserId();
  if (await isBlocked(user.id, viewerId)) notFound();
  // A member's Schedule pill points here too now, so the page renders
  // their view rather than refusing the kind.
  if (user.kind === "fan") {
    return (
      <MemberProfileView
        user={user}
        isOwner={viewerId === user.id}
        viewerId={viewerId}
        tab="schedule"
        from={from}
      />
    );
  }
  return <PublicProfileView user={user} isOwner={viewerId === user.id} tab="schedule" from={from} />;
}
