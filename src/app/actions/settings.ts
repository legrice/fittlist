"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { avatarColor } from "@/lib/avatar";
import { feedbackHost } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import { getSessionUserId } from "@/lib/session";
import { myStaffStudios } from "@/app/actions/gym";

/**
 * Everything the settings surface needs, for whoever is asking.
 *
 * The /settings page and the gear's slide-up sheet are one screen in two
 * skins, so they load through one function or they drift: a row added to the
 * page and forgotten here would exist on the page and vanish in the sheet.
 * The queries are the page's own, moved rather than copied.
 */
export async function settingsSheetData() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return null;
  if (me.handle && !me.onboardedAt) return null;

  const host = await feedbackHost();
  const canSendFeedback = !!host && host.email.toLowerCase() !== me.email.toLowerCase();

  if (me.kind === "fan") {
    if (!(await fansVisible())) return null;
    const [fanFollowing, fanFollowers, fanRuns] = await Promise.all([
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .innerJoin(schema.users, eq(schema.users.id, schema.subscribers.trainerUserId))
        .where(
          and(
            eq(schema.subscribers.email, me.email),
            isNull(schema.subscribers.optedOutAt),
            eq(schema.users.kind, "coach"),
          ),
        ),
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .where(
          and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt)),
        ),
      myStaffStudios(),
    ]);
    return {
      kind: "fan" as const,
      fan: {
        runs: fanRuns,
        name: me.name,
        email: me.email,
        handle: me.handle,
        title: me.title ?? "",
        about: me.about ?? "",
        location: me.location ?? "",
        photo: me.photo,
        color: avatarColor(me),
        look: me.look,
        followingCount: fanFollowing.length,
        followerCount: fanFollowers.length,
        canSendFeedback,
        discoverable: me.discoverable,
        approveFollowers: me.approveFollowers,
        messagesOpen: me.messagesOpen,
      },
    };
  }

  if (!me.handle) return null;

  const [gconn, passkeyRows, inboxRows, subRows, shiftRows, followingRows, runRows] =
    await Promise.all([
      isGoogleConnected(userId),
      db
        .select({ id: schema.credentials.id })
        .from(schema.credentials)
        .where(eq(schema.credentials.userId, userId)),
      db
        .select({ n: schema.inquiryThreads.coachUnread, kind: schema.inquiryThreads.kind })
        .from(schema.inquiryThreads)
        .where(eq(schema.inquiryThreads.coachUserId, userId)),
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .where(
          and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt)),
        ),
      db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(eq(schema.classes.coachUserId, userId)),
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .innerJoin(schema.users, eq(schema.users.id, schema.subscribers.trainerUserId))
        .where(
          and(
            eq(schema.subscribers.email, me.email),
            isNull(schema.subscribers.optedOutAt),
            eq(schema.users.kind, "coach"),
          ),
        ),
      myStaffStudios(),
    ]);
  const requestCount = inboxRows.filter((r) => r.kind === "inquiry").length;

  return {
    kind: "coach" as const,
    coach: {
      handle: me.handle,
      name: me.name,
      title: me.title ?? "",
      photo: me.photo,
      subsCount: subRows.length,
      followingCount: followingRows.filter((r) => r.id).length,
      requestCount,
      email: me.email,
      instagram: me.instagram ?? "",
      website: me.website ?? "",
      contactEmail: me.contactEmail ?? "",
      phone: me.phone ?? "",
      whatsapp: me.whatsapp ?? "",
      about: me.about ?? "",
      availability: me.availability ?? null,
      googleConfigured: googleConfigured(),
      googleConnected: gconn.connected,
      googleEmail: gconn.email,
      hasPassword: !!me.passwordHash,
      passkeyCount: passkeyRows.length,
      isAdmin: adminEmails().includes(me.email.toLowerCase()),
      canSendFeedback,
      runs: runRows,
      shiftCount: shiftRows.length,
      shiftsPublic: me.shiftsPublic,
      avatarColor: avatarColor(me),
      showFanView: await fansVisible(),
      discoverable: me.discoverable,
      approveFollowers: me.approveFollowers,
      messagesOpen: me.messagesOpen,
      look: me.look,
    },
  };
}

export type SettingsSheetData = NonNullable<Awaited<ReturnType<typeof settingsSheetData>>>;
