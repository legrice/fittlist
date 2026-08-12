"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { addNotification } from "@/lib/notify";
import { studioAccess } from "@/lib/studioaccess";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitShoutout(target: { handle?: string; studioSlug?: string }, body: string) {
  const authorUserId = await getSessionUserId();
  if (!authorUserId) return { ok: false, signedOut: true } as const;
  const clean = body.trim().replace(/\s+/g, " ").slice(0, 280);
  if (clean.length < 8) return { ok: false, error: "Write at least a few words." } as const;
  const db = await getDb();

  if (target.handle) {
    const [person] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, target.handle));
    if (!person || person.id === authorUserId) return { ok: false, error: "You can’t shout out your own profile." } as const;
    const where = and(eq(schema.shoutouts.authorUserId, authorUserId), eq(schema.shoutouts.targetUserId, person.id));
    const [existing] = await db.select({ id: schema.shoutouts.id }).from(schema.shoutouts).where(where);
    if (existing) await db.update(schema.shoutouts).set({ body: clean, featuredAt: null }).where(eq(schema.shoutouts.id, existing.id));
    else await db.insert(schema.shoutouts).values({ authorUserId, targetUserId: person.id, body: clean });
    await addNotification(person.id, { type: "shoutout_received", title: "You received a shoutout", body: clean, href: `/${target.handle}#profile-shoutouts`, actorUserId: authorUserId });
    revalidatePath(`/${target.handle}`);
    return { ok: true } as const;
  }

  if (target.studioSlug) {
    const [place] = await db.select({ id: schema.studios.id, slug: schema.studios.slug }).from(schema.studios).where(UUID_RE.test(target.studioSlug) ? eq(schema.studios.id, target.studioSlug) : eq(schema.studios.slug, target.studioSlug));
    if (!place) return { ok: false, error: "Place not found." } as const;
    const where = and(eq(schema.shoutouts.authorUserId, authorUserId), eq(schema.shoutouts.targetStudioId, place.id));
    const [existing] = await db.select({ id: schema.shoutouts.id }).from(schema.shoutouts).where(where);
    if (existing) await db.update(schema.shoutouts).set({ body: clean, featuredAt: null }).where(eq(schema.shoutouts.id, existing.id));
    else await db.insert(schema.shoutouts).values({ authorUserId, targetStudioId: place.id, body: clean });
    const managers = await db.select({ userId: schema.studioManagers.userId }).from(schema.studioManagers).where(eq(schema.studioManagers.studioId, place.id));
    await Promise.all(managers.filter((m) => m.userId !== authorUserId).map((m) => addNotification(m.userId, { type: "shoutout_received", title: "Your place received a shoutout", body: clean, href: `/s/${place.slug ?? target.studioSlug}#profile-shoutouts`, actorUserId: authorUserId })));
    revalidatePath(`/s/${place.slug ?? target.studioSlug}`);
    return { ok: true } as const;
  }
  return { ok: false, error: "Profile not found." } as const;
}

export async function moderateShoutout(id: string, action: "feature" | "hide" | "delete") {
  const viewerId = await getSessionUserId();
  if (!viewerId) return { ok: false } as const;
  const db = await getDb();
  const [row] = await db.select().from(schema.shoutouts).where(eq(schema.shoutouts.id, id));
  if (!row) return { ok: false } as const;
  let path = "";
  if (row.targetUserId) {
    if (row.targetUserId !== viewerId) return { ok: false } as const;
    const [target] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, row.targetUserId));
    path = `/${target?.handle ?? ""}`;
  } else if (row.targetStudioId) {
    const [viewer] = await db.select({ kind: schema.users.kind }).from(schema.users).where(eq(schema.users.id, viewerId));
    if (!viewer || !(await studioAccess(row.targetStudioId, { id: viewerId, kind: viewer.kind })).canEdit) return { ok: false } as const;
    const [place] = await db.select({ slug: schema.studios.slug }).from(schema.studios).where(eq(schema.studios.id, row.targetStudioId));
    path = `/s/${place?.slug ?? row.targetStudioId}`;
  }
  if (action === "delete") await db.delete(schema.shoutouts).where(eq(schema.shoutouts.id, id));
  else await db.update(schema.shoutouts).set({ featuredAt: action === "feature" ? new Date() : null }).where(eq(schema.shoutouts.id, id));
  if (path) revalidatePath(path);
  return { ok: true } as const;
}
