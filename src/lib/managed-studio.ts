import "server-only";
import { cache } from "react";
import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { studioAccess } from "@/lib/studioaccess";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Share the authorized place lookup between the persistent frame and its page. */
export const managedStudio = cache(async (slug: string) => {
  const me = await currentUser();
  if (!me) notFound();
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(UUID_RE.test(slug)
    ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
    : eq(schema.studios.slug, slug));
  if (!studio || !(await studioAccess(studio.id, me)).isManager) notFound();
  return { studio, me };
});
