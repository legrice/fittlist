import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { todayIso } from "@/lib/format";
import { SearchScreen } from "@/components/SearchScreen";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// The screen behind the header's magnifier, laid out like the one behind the
// bell: its own route, the app header and the tab bar, no tab lit. Search is
// something you do from wherever you are rather than one of the four places
// you browse from, and arriving here must not take the way back with it.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  // Home's rail arrows land here with the segment named (?seg=classes and
  // friends); anything else falls back to People.
  const { seg } = await searchParams;
  const initialSeg =
    seg === "classes" || seg === "studios" || seg === "people" ? seg : undefined;

  return (
    <section className="screen hasnav" data-mode={lookMode(me?.look)}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <SearchScreen todayIso={todayIso()} initialSeg={initialSeg} />
      </div>
    </section>
  );
}
