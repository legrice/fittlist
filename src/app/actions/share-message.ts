"use server";

import { and, eq, ilike, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";

export type ShareRecipient = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string | null;
};

export async function findShareRecipients(queryRaw: string): Promise<ShareRecipient[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const query = queryRaw.trim().slice(0, 60);
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      handle: schema.users.handle,
      photo: schema.users.photoThumb,
      color: schema.users.avatarColor,
    })
    .from(schema.users)
    .where(
      and(
        ne(schema.users.id, userId),
        isNotNull(schema.users.handle),
        ne(schema.users.kind, "gym"),
        query
          ? sql`(${schema.users.name} ilike ${`%${query}%`} or ${schema.users.handle} ilike ${`%${query}%`})`
          : ilike(schema.users.name, "%"),
      ),
    )
    .orderBy(schema.users.name)
    .limit(12);
  return rows.flatMap((row) => row.handle ? [{ ...row, handle: row.handle }] : []);
}

export async function sendClassShare(
  targetUserId: string,
  classNameRaw: string,
  linkUrlRaw: string,
): Promise<{ ok: boolean; error?: string; threadId?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to send this class." };
  if (targetUserId === userId) return { ok: false, error: "That’s already your account." };

  const className = classNameRaw.trim().slice(0, 160);
  const linkUrl = linkUrlRaw.trim().slice(0, 1000);
  if (!className || !/^https?:\/\//.test(linkUrl)) return { ok: false, error: "This class link isn’t ready." };

  const db = await getDb();
  const [me, target] = await Promise.all([
    db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)),
    db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, targetUserId)),
  ]).then(([mine, theirs]) => [mine[0], theirs[0]] as const);
  if (!me || !target) return { ok: false, error: "That person isn’t available." };

  const body = `Thought you might like ${className}: ${linkUrl}`;
  const [thread] = await db
    .insert(schema.inquiryThreads)
    .values({
      coachUserId: targetUserId,
      kind: "inquiry",
      requesterName: me.name,
      requesterEmail: me.email.trim().toLowerCase(),
      coachUnread: 1,
    })
    .onConflictDoUpdate({
      target: [schema.inquiryThreads.coachUserId, schema.inquiryThreads.requesterEmail, schema.inquiryThreads.kind],
      set: {
        requesterName: me.name,
        coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1`,
        lastMessageAt: new Date(),
      },
    })
    .returning({ id: schema.inquiryThreads.id });

  await db.insert(schema.inquiryMessages).values({ threadId: thread.id, fromCoach: false, body });
  await addNotification(targetUserId, {
    type: "message",
    title: `${me.name} shared a class with you`,
    body: className,
    href: `/inbox/${thread.id}`,
    actorUserId: userId,
  });
  revalidatePath("/updates");
  revalidatePath("/", "layout");
  return { ok: true, threadId: thread.id };
}
