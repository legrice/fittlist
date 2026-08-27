import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";

export type FollowingDirectoryKind = "people" | "studios" | "groups";
export type FollowingDirectoryTab = "following" | "discover";

export type FollowingDirectoryPerson = {
  type: "person";
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  detail: string;
  location: string;
  disciplines: string[];
  lat: number | null;
  lng: number | null;
  following: boolean;
  requested: boolean;
};

export type FollowingDirectoryStudio = {
  type: "studio";
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  color: string;
  detail: string;
  placeKind: string;
  types: string[];
  lat: number | null;
  lng: number | null;
  following: boolean;
};

export type FollowingDirectoryGroup = {
  type: "group";
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  color: string;
  detail: string;
  purpose: string;
  lat: number | null;
  lng: number | null;
  following: boolean;
};

export type FollowingDirectoryEntity =
  | FollowingDirectoryPerson
  | FollowingDirectoryStudio
  | FollowingDirectoryGroup;

export type FollowingDirectoryBatch = {
  entities: FollowingDirectoryEntity[];
  hasMore: boolean;
  limit: number;
};

export type FollowingDirectoryData = FollowingDirectoryBatch & {
  kind: FollowingDirectoryKind;
  title: string;
  pageSize: number;
  viewerLat: number | null;
  viewerLng: number | null;
};

export const FOLLOWING_DIRECTORY_PAGE_SIZE = 24;
const MAX_DIRECTORY_LIMIT = 192;

type PersonRow = {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  title: string | null;
  location: string | null;
  disciplines: string[];
  photo: string | null;
  avatarColor: string | null;
  lat: number | null;
  lng: number | null;
};

type StudioRow = {
  id: string;
  name: string;
  slug: string | null;
  photo: string | null;
  placeKind: string;
  address: string;
  types: string[];
  lat: number | null;
  lng: number | null;
};

type GroupRow = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  description: string | null;
  purpose: string;
  lat: number | null;
  lng: number | null;
};

const titleFor = (kind: FollowingDirectoryKind) => (
  kind === "people" ? "People" : kind === "studios" ? "Studios" : "Groups"
);

const personColumns = {
  id: schema.users.id,
  email: schema.users.email,
  name: schema.users.name,
  handle: schema.users.handle,
  title: schema.users.title,
  location: schema.users.location,
  disciplines: schema.users.disciplines,
  photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
  avatarColor: schema.users.avatarColor,
  lat: schema.users.locationLat,
  lng: schema.users.locationLng,
};

const studioColumns = {
  id: schema.studios.id,
  name: schema.studios.name,
  slug: schema.studios.slug,
  photo: schema.studios.photo,
  placeKind: schema.studios.placeKind,
  address: schema.studios.address,
  types: schema.studios.types,
  lat: schema.studios.lat,
  lng: schema.studios.lng,
};

const groupColumns = {
  id: schema.groups.id,
  name: schema.groups.name,
  slug: schema.groups.slug,
  photo: schema.groups.photo,
  description: schema.groups.description,
  purpose: schema.groups.purpose,
  lat: schema.users.locationLat,
  lng: schema.users.locationLng,
};

function peopleFromRows(
  rows: PersonRow[],
  following: Set<string>,
  requested: Set<string>,
): FollowingDirectoryPerson[] {
  return rows.map((account) => ({
    type: "person",
    id: account.id,
    name: account.name.trim() || account.email.split("@")[0],
    handle: account.handle!,
    photo: account.photo,
    color: avatarColor(account),
    detail: account.title?.trim() || account.location?.trim() || `@${account.handle}`,
    location: account.location?.trim() ?? "",
    disciplines: account.disciplines,
    lat: account.lat,
    lng: account.lng,
    following: following.has(account.id),
    requested: requested.has(account.id),
  }));
}

function studiosFromRows(
  rows: StudioRow[],
  following: Set<string>,
): FollowingDirectoryStudio[] {
  return rows.map((studio) => ({
    type: "studio",
    id: studio.id,
    name: studio.name,
    slug: studio.slug ?? studio.id,
    photo: studio.photo,
    color: avatarColor({ id: studio.id }),
    detail: studio.types.slice(0, 2).join(" · ") || studio.address || studio.placeKind,
    placeKind: studio.placeKind,
    types: studio.types,
    lat: studio.lat,
    lng: studio.lng,
    following: following.has(studio.id),
  }));
}

function groupsFromRows(
  rows: GroupRow[],
  following: Set<string>,
): FollowingDirectoryGroup[] {
  return rows.map((group) => ({
    type: "group",
    id: group.id,
    name: group.name,
    slug: group.slug,
    photo: group.photo,
    color: avatarColor({ id: group.id }),
    detail: group.description?.trim() || group.purpose || "Fitness group",
    purpose: group.purpose,
    lat: group.lat,
    lng: group.lng,
    following: following.has(group.id),
  }));
}

/**
 * One bounded identity slice. Following is the only data needed for the first
 * document; Discover calls this after its tab is opened. Images are therefore
 * selected only for rows the person can currently see, rather than for the
 * whole FittList directory.
 */
export async function followingDirectoryBatch(
  kind: FollowingDirectoryKind,
  tab: FollowingDirectoryTab,
  requestedLimit = FOLLOWING_DIRECTORY_PAGE_SIZE,
): Promise<FollowingDirectoryBatch | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const limit = Math.max(1, Math.min(MAX_DIRECTORY_LIMIT, Math.floor(requestedLimit)));
  const take = limit + 1;
  const canGrow = limit < MAX_DIRECTORY_LIMIT;

  if (kind === "people") {
    const [me] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!me) return null;
    const [followedRows, requestRows, hidden] = await Promise.all([
      db
        .select({
          id: schema.users.id,
          handle: schema.users.handle,
          kind: schema.users.kind,
        })
        .from(schema.subscribers)
        .innerJoin(schema.users, eq(schema.users.id, schema.subscribers.trainerUserId))
        .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)))
        .orderBy(desc(schema.subscribers.createdAt)),
      db
        .select({
          id: schema.users.id,
          handle: schema.users.handle,
          kind: schema.users.kind,
        })
        .from(schema.followRequests)
        .innerJoin(schema.users, eq(schema.users.id, schema.followRequests.trainerUserId))
        .where(eq(schema.followRequests.requesterUserId, userId))
        .orderBy(desc(schema.followRequests.createdAt)),
      hiddenFrom(userId),
    ]);
    const activeRows = followedRows.filter((row) => (
      row.id !== userId && !!row.handle && row.kind !== "gym" && !hidden.has(row.id)
    ));
    const activeIds = new Set(activeRows.map((row) => row.id));
    const pendingRows = requestRows.filter((row) => (
      row.id !== userId && !!row.handle && row.kind !== "gym" && !hidden.has(row.id) && !activeIds.has(row.id)
    ));
    const pendingIds = new Set(pendingRows.map((row) => row.id));

    if (tab === "following") {
      const orderedIds = activeRows.map((row) => row.id).slice(0, take);
      if (!orderedIds.length) return { entities: [], hasMore: false, limit };
      const rows = await db.select(personColumns).from(schema.users).where(inArray(schema.users.id, orderedIds));
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = orderedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
      return {
        entities: peopleFromRows(ordered.slice(0, limit), activeIds, pendingIds),
        hasMore: canGrow && activeRows.length > limit,
        limit,
      };
    }

    const pendingPageIds = pendingRows.map((row) => row.id).slice(0, take);
    const excluded = [...new Set([userId, ...activeIds, ...pendingIds, ...hidden])];
    const suggestionTake = Math.max(0, take - pendingPageIds.length);
    const [pendingPeople, suggestions] = await Promise.all([
      pendingPageIds.length
        ? db.select(personColumns).from(schema.users).where(inArray(schema.users.id, pendingPageIds))
        : Promise.resolve([]),
      suggestionTake
        ? db
          .select(personColumns)
          .from(schema.users)
          .where(and(
            eq(schema.users.discoverable, true),
            isNotNull(schema.users.handle),
            ne(schema.users.kind, "gym"),
            notInArray(schema.users.id, excluded),
          ))
          .orderBy(asc(schema.users.name))
          .limit(suggestionTake)
        : Promise.resolve([]),
    ]);
    const pendingById = new Map(pendingPeople.map((row) => [row.id, row]));
    const orderedPending = pendingPageIds.flatMap((id) => pendingById.get(id) ? [pendingById.get(id)!] : []);
    const combined = [...orderedPending, ...suggestions];
    return {
      entities: peopleFromRows(combined.slice(0, limit), activeIds, pendingIds),
      hasMore: canGrow && combined.length > limit,
      limit,
    };
  }

  if (kind === "studios") {
    const followRows = await db
      .select({ studioId: schema.studioEndorsements.targetStudioId })
      .from(schema.studioEndorsements)
      .where(and(
        eq(schema.studioEndorsements.endorserUserId, userId),
        eq(schema.studioEndorsements.trait, "been_here"),
      ));
    const following = new Set(followRows.map((row) => row.studioId));
    const conditions = tab === "following"
      ? following.size ? inArray(schema.studios.id, [...following]) : null
      : following.size ? notInArray(schema.studios.id, [...following]) : undefined;
    if (tab === "following" && !conditions) return { entities: [], hasMore: false, limit };
    const rows = await db
      .select(studioColumns)
      .from(schema.studios)
      .where(conditions ?? undefined)
      .orderBy(asc(schema.studios.name))
      .limit(take);
    return {
      entities: studiosFromRows(rows.slice(0, limit), following),
      hasMore: canGrow && rows.length > limit,
      limit,
    };
  }

  const followRows = await db
    .select({ groupId: schema.groupFavorites.groupId })
    .from(schema.groupFavorites)
    .where(eq(schema.groupFavorites.userId, userId));
  const following = new Set(followRows.map((row) => row.groupId));
  const conditions = tab === "following"
    ? following.size ? inArray(schema.groups.id, [...following]) : null
    : and(
        eq(schema.groups.visibility, "public"),
        following.size ? notInArray(schema.groups.id, [...following]) : undefined,
      );
  if (tab === "following" && !conditions) return { entities: [], hasMore: false, limit };
  const rows = await db
    .select(groupColumns)
    .from(schema.groups)
    .innerJoin(schema.users, eq(schema.groups.ownerUserId, schema.users.id))
    .where(conditions ?? undefined)
    .orderBy(desc(schema.groups.createdAt))
    .limit(take);
  return {
    entities: groupsFromRows(rows.slice(0, limit), following),
    hasMore: canGrow && rows.length > limit,
    limit,
  };
}

/** The first response contains Following only. Discover is intentionally lazy. */
export async function followingDirectoryData(
  kind: FollowingDirectoryKind,
): Promise<FollowingDirectoryData | null> {
  const batch = await followingDirectoryBatch(kind, "following", FOLLOWING_DIRECTORY_PAGE_SIZE);
  if (!batch) return null;
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [viewer] = await db.select({
    lat: schema.users.locationLat,
    lng: schema.users.locationLng,
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return {
    kind,
    title: titleFor(kind),
    pageSize: FOLLOWING_DIRECTORY_PAGE_SIZE,
    viewerLat: viewer?.lat ?? null,
    viewerLng: viewer?.lng ?? null,
    ...batch,
  };
}
