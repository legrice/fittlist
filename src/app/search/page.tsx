import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { SearchScreen } from "@/components/SearchScreen";
import { lookMode } from "@/lib/darkmode";
import { todayIso } from "@/lib/format";

export const dynamic = "force-dynamic";

// The screen behind the header's magnifier: its own route, the app header and
// the tab bar, no tab lit. It searches coaches only: the people whose
// schedules make the Following experience useful. Old ?seg links still land
// here, but the query no longer changes what Search means.
export default async function SearchPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  return (
    <section className="screen hasnav" data-mode={lookMode(me?.look)}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <SearchScreen todayIso={todayIso()} />
      </div>
    </section>
  );
}
