"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { objectionableContentError } from "@/lib/content-safety";
import {
  MAX_SAVED_STORY_LOOKS,
  sanitizeSavedStoryLooks,
  sanitizeShareDesign,
  sanitizeStoryLookId,
  sanitizeStoryLookName,
  type SavedStoryLook,
  type ShareDesign,
} from "@/lib/share-design";
import { getSessionUserId } from "@/lib/session";

type ShareDesignResult =
  | { ok: true; design: ShareDesign }
  | { ok: false; error: string };

type SavedLookResult =
  | { ok: true; look: SavedStoryLook; savedLooks: SavedStoryLook[] }
  | { ok: false; error: string };

type DeleteLookResult =
  | { ok: true; savedLooks: SavedStoryLook[] }
  | { ok: false; error: string };

function refreshShareSurfaces() {
  revalidatePath("/calendar");
  revalidatePath("/membershare");
  revalidatePath("/coachshare");
}

/** Save the current art direction as the look used on future Share visits. */
export async function saveDefaultStoryDesign(input: unknown): Promise<ShareDesignResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in again to save this look." };
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "That look could not be saved." };
  }

  const design = sanitizeShareDesign(input);
  const db = await getDb();
  const saved = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ storyPrefs: schema.users.storyPrefs })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!user) return false;
    await tx
      .update(schema.users)
      .set({ storyPrefs: { ...user.storyPrefs, design } })
      .where(eq(schema.users.id, userId));
    return true;
  });
  if (!saved) return { ok: false, error: "That account could not be found." };
  refreshShareSurfaces();
  return { ok: true, design };
}

/**
 * Add a reusable named look, or replace the look with the supplied id while
 * keeping its position in the list.
 */
export async function saveNamedStoryLook(input: {
  id?: string | null;
  name: string;
  design: unknown;
}): Promise<SavedLookResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in again to save this look." };

  const name = sanitizeStoryLookName(input?.name);
  if (!name) return { ok: false, error: "Give this look a name." };
  const safetyError = objectionableContentError(name);
  if (safetyError) return { ok: false, error: safetyError };
  if (input?.design === null || typeof input?.design !== "object" || Array.isArray(input.design)) {
    return { ok: false, error: "That look could not be saved." };
  }

  const requestedId = input.id == null || input.id === "" ? "" : sanitizeStoryLookId(input.id);
  if (input.id && !requestedId) return { ok: false, error: "That saved look is no longer available." };

  const db = await getDb();
  const saved = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ storyPrefs: schema.users.storyPrefs })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!user) return { error: "That account could not be found." } as const;
    const savedLooks = sanitizeSavedStoryLooks(user.storyPrefs?.savedLooks);
    const existingIndex = requestedId
      ? savedLooks.findIndex((candidate) => candidate.id === requestedId)
      : -1;
    if (requestedId && existingIndex < 0) {
      return { error: "That saved look is no longer available." } as const;
    }
    if (existingIndex < 0 && savedLooks.length >= MAX_SAVED_STORY_LOOKS) {
      return {
        error: `You can save up to ${MAX_SAVED_STORY_LOOKS} looks. Remove one before adding another.`,
      } as const;
    }

    const look: SavedStoryLook = {
      id: requestedId || randomUUID(),
      name,
      design: sanitizeShareDesign(input.design),
    };
    const next = [...savedLooks];
    if (existingIndex >= 0) next[existingIndex] = look;
    else next.unshift(look);

    await tx
      .update(schema.users)
      .set({ storyPrefs: { ...user.storyPrefs, savedLooks: next } })
      .where(eq(schema.users.id, userId));
    return { look, savedLooks: next } as const;
  });
  if ("error" in saved && saved.error) return { ok: false, error: saved.error };
  refreshShareSurfaces();
  return { ok: true, look: saved.look, savedLooks: saved.savedLooks };
}

export async function deleteSavedStoryLook(idRaw: string): Promise<DeleteLookResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in again to remove this look." };
  const id = sanitizeStoryLookId(idRaw);
  if (!id) return { ok: false, error: "That saved look is no longer available." };

  const db = await getDb();
  const deleted = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ storyPrefs: schema.users.storyPrefs })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");
    if (!user) return { error: "That account could not be found." } as const;
    const savedLooks = sanitizeSavedStoryLooks(user.storyPrefs?.savedLooks);
    const next = savedLooks.filter((look) => look.id !== id);
    if (next.length === savedLooks.length) {
      return { error: "That saved look is no longer available." } as const;
    }
    await tx
      .update(schema.users)
      .set({ storyPrefs: { ...user.storyPrefs, savedLooks: next } })
      .where(eq(schema.users.id, userId));
    return { savedLooks: next } as const;
  });
  if ("error" in deleted && deleted.error) return { ok: false, error: deleted.error };
  refreshShareSurfaces();
  return { ok: true, savedLooks: deleted.savedLooks };
}
