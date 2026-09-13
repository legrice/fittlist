import { pushToAdmins } from "@/lib/push";
import { getDb, schema } from "@/db";

export const PRODUCT_ACTIVITY_KINDS = [
  "favorite_person_added",
  "favorite_person_removed",
  "favorite_studio_added",
  "favorite_studio_removed",
  "favorite_group_added",
  "favorite_group_removed",
  "class_saved",
  "class_removed",
  "group_joined",
  "group_created",
  "group_people_invited",
  "share_image_exported",
  "message_sent", "profile_updated", "class_updated", "class_deleted",
  "studio_created", "studio_updated", "event_updated", "event_registration",
  "group_updated", "group_posted", "comment_posted", "content_reported",
] as const;

export type ProductActivityKind = (typeof PRODUCT_ACTIVITY_KINDS)[number];

/** Product telemetry must never interrupt the action a person came to do. */
export async function recordProductActivity(actorUserId: string | null, kind: ProductActivityKind) {
  try {
    const db = await getDb();
    await db.insert(schema.productActivity).values({ actorUserId, kind });
    await pushToAdmins({ title: "FittList activity", body: ACTIVITY_LABELS[kind], url: "/admin?tab=activity" });
  } catch (error) {
    console.error("product activity record failed", { kind, error });
  }
}

export const ACTIVITY_LABELS: Record<ProductActivityKind, string> = {
  favorite_person_added: "Someone followed a person.", favorite_person_removed: "Someone unfollowed a person.",
  favorite_studio_added: "Someone followed a studio.", favorite_studio_removed: "Someone unfollowed a studio.",
  favorite_group_added: "Someone followed a group.", favorite_group_removed: "Someone unfollowed a group.",
  class_saved: "Someone saved a class.", class_removed: "Someone removed a saved class.",
  group_joined: "Someone joined a group.", group_created: "Someone created a group.",
  group_people_invited: "Someone invited people to a group.", share_image_exported: "Someone exported a share image.",
  message_sent: "A message was sent.", profile_updated: "A profile was updated.",
  class_updated: "A class was added or updated.", class_deleted: "A class was removed.",
  studio_created: "A studio was added.", studio_updated: "A studio was updated.",
  event_updated: "An event was added or updated.", event_registration: "An event registration changed.",
  group_updated: "A group was updated.", group_posted: "An update was posted in a group.",
  comment_posted: "A comment was posted.", content_reported: "New content was reported for review.",
};
