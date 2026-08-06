import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { myBlocks } from "@/app/actions/blocks";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { BackLink } from "@/components/BackLink";
import { BlockedList } from "@/components/BlockedList";
import { Icon } from "@/components/Icon";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// Who you've removed, and the way to undo it. The only screen in the app where
// a block is visible at all; the people on this list are never told.
export default async function BlockedPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const people = await myBlocks();

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <div className="folback">
          <BackLink className="evback" href="/settings" label="Back to settings">
            <Icon name="arrow_back" size={21} />
          </BackLink>
        </div>
        <div className="admintop">
          <div>
            <h1>Removed people</h1>
            <p className="adminsub">
              {people.length === 0
                ? "Nobody"
                : `${people.length} ${people.length === 1 ? "person" : "people"} can't see your page`}
            </p>
          </div>
        </div>
        <BlockedList people={people} />
      </div>
    </section>
  );
}
