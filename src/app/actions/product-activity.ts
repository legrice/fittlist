"use server";

import { getSessionUserId } from "@/lib/session";
import {
  PRODUCT_ACTIVITY_KINDS,
  recordProductActivity,
  type ProductActivityKind,
} from "@/lib/product-activity";

export async function recordShareImageExport(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const kind: ProductActivityKind = "share_image_exported";
  if (!PRODUCT_ACTIVITY_KINDS.includes(kind)) return;
  await recordProductActivity(userId, kind);
}
