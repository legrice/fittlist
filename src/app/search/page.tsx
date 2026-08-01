import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { SearchScreen } from "@/components/SearchScreen";

export const dynamic = "force-dynamic";

// The screen behind the header's magnifier, laid out like the one behind the
// bell: its own route, the app header and the tab bar, no tab lit. Search is
// something you do from wherever you are rather than one of the four places
// you browse from, and arriving here must not take the way back with it.
export default async function SearchPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  return (
    <section className="screen hasnav" data-mode={me?.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <SearchScreen />
      </div>
    </section>
  );
}
