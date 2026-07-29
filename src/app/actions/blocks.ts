"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { dropFollow } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";

// Blocking is quiet: nothing is sent, nothing is shown to the person blocked.
// The only place a block is visible is the blocker's own settings, so they can
// undo it.

export async function blockPerson(blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  if (blockedId === userId) return { ok: false, error: "You can't block yourself." };
  const db = await getDb();
  const [them] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, blockedId));
  if (!them) return { ok: false, error: "Account not found." };

  await db
    .insert(schema.blocks)
    .values({ blockerUserId: userId, blockedUserId: blockedId })
    .onConflictDoNothing({
      target: [schema.blocks.blockerUserId, schema.blocks.blockedUserId],
    });
  // Blocking someone who follows you has to remove the follow, or they keep
  // getting your week by email every Sunday.
  await dropFollow(userId, blockedId);
  revalidatePath("/followers");
  revalidatePath("/app");
  return { ok: true };
}

export async function unblockPerson(blockedId: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db
    .delete(schema.blocks)
    .where(
      and(
        eq(schema.blocks.blockerUserId, userId),
        eq(schema.blocks.blockedUserId, blockedId),
      ),
    );
  // Unblocking doesn't refollow them. That was their choice to make, and making
  // it for them would be its own kind of surprise.
  revalidatePath("/blocked");
  return { ok: true };
}

export type BlockedPerson = { id: string; name: string; photo: string | null; color: string };

/** The blocker's own list, the one place a block is ever visible. */
export async function myBlocks(): Promise<BlockedPerson[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      photo: schema.users.photo,
      avatarColor: schema.users.avatarColor,
    })
    .from(schema.blocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.blocks.blockedUserId))
    .where(eq(schema.blocks.blockerUserId, userId))
    .orderBy(desc(schema.blocks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name.trim() || r.email,
    photo: r.photo,
    color: avatarColor(r),
  }));
}
