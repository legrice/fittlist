import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
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
  const url = `${siteOrigin()}/${handle}/schedule`;
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

// The schedule lives on the same page as the profile; this route just opens it
// with the Schedule tab active (and keeps a shareable, canonical URL).
export default async function SchedulePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const isOwner = (await getSessionUserId()) === user.id;
  return <PublicProfileView user={user} isOwner={isOwner} initialTab="schedule" from={from} />;
}
