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
  return {
    title: `${user.name}'s schedule · fittlist`,
    alternates: { canonical: `${siteOrigin()}/${handle}/schedule` },
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
