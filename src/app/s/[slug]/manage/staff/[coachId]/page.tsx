import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { studioCoachDetail } from "@/app/actions/gym";
import { StudioCoachSettings } from "@/components/StudioCoachSettings";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudioCoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; coachId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug, coachId } = await params;
  const { m } = await searchParams;
  const db = await getDb();
  const [studio] = await db
    .select({ id: schema.studios.id, name: schema.studios.name, slug: schema.studios.slug })
    .from(schema.studios)
    .where(
      UUID_RE.test(slug)
        ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
        : eq(schema.studios.slug, slug),
    );
  if (!studio) notFound();
  const coach = await studioCoachDetail(studio.id, coachId, m);
  if (!coach) notFound();
  return (
    <StudioCoachSettings
      studioId={studio.id}
      studioName={studio.name}
      studioSlug={studio.slug ?? studio.id}
      coach={coach}
    />
  );
}
