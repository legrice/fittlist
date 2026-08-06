import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { ShareHubScreen } from "@/components/ShareHubScreen";

export const dynamic = "force-dynamic";

// The Share tab's screen: one surface with Week, Profile and QR code as
// segments, colours that redraw the picture live, and the big save button.
// It lives in the tabs group so the bar stays under it; Share is a place
// you go, not a sheet that visits.
export default async function ShareHubPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind, handle: schema.users.handle, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // No handle means mid-signup, and nothing here works without a page to
  // point at; /you sorts out where they should be.
  if (!me?.handle) redirect("/you");
  return (
    <ShareHubScreen coach={me.kind !== "fan"} handle={me.handle} name={me.name.trim() || me.handle} />
  );
}
