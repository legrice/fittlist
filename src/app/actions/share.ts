"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { shareWeek } from "@/lib/shareweek";

export type ShareRow = {
  key: string;
  iso: string;
  when: string;
  name: string;
  sub: string;
};

export async function shareRows(input: { from: string; days: number }): Promise<ShareRow[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return [];
  const days = Math.min(7, Math.max(1, Math.round(input.days) || 7));
  const week = await shareWeek(userId, input.from, days);
  return week.flatMap((day) => day.items.map((item) => ({
    key: item.key,
    iso: item.iso,
    when: `${day.day.slice(0, 3)} ${item.time}`,
    name: item.name,
    sub: [item.who, item.where].filter(Boolean).join(" · "),
  })));
}

export type SharePerson = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
};

export async function peopleForSharing(): Promise<SharePerson[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const [me] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return [];
  const follows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const followedIds = new Set(follows.map((follow) => follow.trainerUserId));
  const rows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    handle: schema.users.handle,
    photo: schema.users.photo,
    photoThumb: schema.users.photoThumb,
    avatarColor: schema.users.avatarColor,
    kind: schema.users.kind,
    messagesOpen: schema.users.messagesOpen,
  }).from(schema.users);

  return rows
    .filter((person) =>
      person.id !== userId &&
      person.kind !== "gym" &&
      Boolean(person.handle) &&
      person.messagesOpen
    )
    .map((person) => {
      const photo = person.photoThumb ?? person.photo;
      return {
        id: person.id,
        name: person.name.trim() || person.handle!,
        handle: person.handle!,
        photo,
        color: avatarColor(person),
        priority: (followedIds.has(person.id) ? 2 : 0) + (photo ? 1 : 0),
      };
    })
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .map(({ priority: _priority, ...person }) => person);
}
