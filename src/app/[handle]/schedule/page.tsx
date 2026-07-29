import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
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

// /{handle}/schedule, kept alive: it was the shareable schedule link before the
// schedule became the bare handle, and links in the wild don't get to break.
export default async function SchedulePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();
  // A member claims a handle too, and has no schedule behind it. /{handle}
  // already routes them to their own page; this one has nothing to show.
  if (user.kind === "fan") notFound();

  const viewerId = await getSessionUserId();
  if (await isBlocked(user.id, viewerId)) notFound();
  return <PublicProfileView user={user} isOwner={viewerId === user.id} tab="schedule" from={from} />;
}
