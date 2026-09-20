import "server-only";
import { cookies } from "next/headers";

/** A short-lived, same-browser return destination for prototype sign-in. */
export async function consumePreviewReturn(): Promise<string | null> {
  const jar = await cookies();
  const requested = jar.get("fl_preview_auth_return")?.value === "1";
  if (requested) jar.delete("fl_preview_auth_return");
  return requested ? "/ui-preview" : null;
}
