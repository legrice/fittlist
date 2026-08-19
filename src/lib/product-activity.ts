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
] as const;

export type ProductActivityKind = (typeof PRODUCT_ACTIVITY_KINDS)[number];

/** Product telemetry must never interrupt the action a person came to do. */
export async function recordProductActivity(actorUserId: string, kind: ProductActivityKind) {
  try {
    const db = await getDb();
    await db.insert(schema.productActivity).values({ actorUserId, kind });
  } catch (error) {
    console.error("product activity record failed", { kind, error });
  }
}
