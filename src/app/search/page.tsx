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
// the tab bar, no tab lit. Unlike Discover, this is direct lookup: results are
// organized by what they are and match their own names rather than nearby or
// related metadata.
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
        <SearchScreen todayIso={todayIso()} userId={userId} />
      </div>
    </section>
  );
}
