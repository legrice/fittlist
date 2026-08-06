import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The old settings screen's address, now a door onto your profile.
 *
 * The Profile tab opens your page: the thing everybody else sees, which is
 * what the word means everywhere outside this app. Settings are the gear on
 * it, at `/settings`. This URL was the settings screen for months, it is the
 * header avatar's href in every shell that has not been handed a handle, and
 * it is in `/app?acct=1`'s redirect, so it has to keep landing somewhere real.
 */
export default async function YouPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ handle: schema.users.handle, onboardedAt: schema.users.onboardedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // Claimed a link but never finished setup: the wizard is the better landing,
  // and half a profile is not a page to be shown your own.
  if (!me.handle || !me.onboardedAt) redirect("/welcome");
  redirect(`/${me.handle}`);
}
