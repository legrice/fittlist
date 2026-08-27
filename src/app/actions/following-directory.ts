"use server";

import {
  followingDirectoryBatch,
  type FollowingDirectoryKind,
  type FollowingDirectoryTab,
} from "@/lib/following-directory";

const KINDS = new Set<FollowingDirectoryKind>(["people", "studios", "groups"]);
const TABS = new Set<FollowingDirectoryTab>(["following", "discover"]);

/** Lazy identity batches for the profile's Dice-style relationship lists. */
export async function loadFollowingDirectory(
  kind: FollowingDirectoryKind,
  tab: FollowingDirectoryTab,
  limit: number,
) {
  if (!KINDS.has(kind) || !TABS.has(tab)) return null;
  return followingDirectoryBatch(kind, tab, limit);
}
