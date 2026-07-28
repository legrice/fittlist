import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
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
  const title = `${user.name} · fittlist`;
  const description = user.about?.trim() || `${user.name}'s coaching schedule, every studio in one link.`;
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

  return <PublicProfileView user={user} isOwner={isOwner} initialTab="about" from={from} />;
}
