import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { myWeek } from "@/lib/week";
import { WeekScreen } from "@/components/WeekScreen";

export const dynamic = "force-dynamic";

// The shortlist behind the header icon. Its own route rather than a tab,
// because it's reachable from every screen and isn't one of the three places
// you browse from.
export default async function WeekPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const days = await myWeek(userId);
  return (
    <div className="appshell" data-mode={me?.look === "dark" ? "dark" : undefined}>
      <WeekScreen days={days} />
    </div>
  );
}
