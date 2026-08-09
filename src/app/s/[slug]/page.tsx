import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
import { findStudio, StudioView } from "@/components/StudioView";

export const dynamic = "force-dynamic";


type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await findStudio(slug);
  if (!s) return { title: "fittlist" };
  const title = `${s.name} · fittlist`;
  const description = s.about?.trim() || `${s.name}, ${s.address}`;
  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}/s/${s.slug ?? s.id}` },
    openGraph: {
      title,
      description,
      url: `${siteOrigin()}/s/${s.slug ?? s.id}`,
      siteName: "fittlist",
      images: s.photo ? [{ url: s.photo }] : undefined,
    },
  };
}


export default async function StudioPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { from } = await searchParams;
  // A studio running its page has somewhere to keep the count: its gym
  // account, riding the same rollup a coach's page uses. Not the managers'
  // own opens, not bots, and only the main landing, so the number means what
  // a coach's does.
  const s = await findStudio(slug);
  if (s?.accountUserId) {
    const [viewerId, hdrs] = await Promise.all([getSessionUserId(), headers()]);
    let isManager = false;
    if (viewerId) {
      const db = await getDb();
      const [row] = await db
        .select({ id: schema.studioManagers.id })
        .from(schema.studioManagers)
        .where(
          and(
            eq(schema.studioManagers.studioId, s.id),
            eq(schema.studioManagers.userId, viewerId),
          ),
        );
      isManager = !!row;
    }
    if (!isManager && !looksLikeBot(hdrs.get("user-agent"))) {
      try {
        await recordVisit(s.accountUserId);
      } catch (err) {
        console.error("studio visit rollup failed", err);
      }
    }
  }
  return <StudioView slug={slug} tab="auto" from={from} />;
}
