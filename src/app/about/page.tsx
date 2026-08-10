import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { Contribute } from "@/components/Contribute";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// What FittList is, in as many words: the page behind Home's About block.
// It ends on the ask, because a public record is built by the people in it.
export default async function AboutPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look, kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  // The Contribute sheet's class rows open the ordinary adder on the
  // viewer's own calendar, whichever kind that is.
  const addHref = me?.kind === "fan" ? "/week?add=1" : "/calendar?add=1";

  return (
    <section className="screen hasnav" data-mode={lookMode(me?.look)}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <article className="aboutpage">
          <h1>What FittList is</h1>
          <p>
            FittList is a public record of what&rsquo;s happening in local fitness.
            Classes, the places they happen, and the people leading them.
          </p>
          <p>
            That record doesn&rsquo;t exist right now. A yoga class lives in
            Mindbody. A HYROX session lives in ClassPass. A run club lives in an
            Instagram story that&rsquo;s gone in a day. A coach teaching at six
            gyms has six calendars and nowhere to point anyone.
          </p>
          <p>
            It&rsquo;s not hidden on purpose. Every tool that holds a class was
            built to sell that class, so classes only appear where money changes
            hands. Most of what people actually do never appears anywhere.
          </p>
          <p>
            FittList works the other way. Anyone can add a class. Anyone can fix
            a wrong one. A studio doesn&rsquo;t have to sign up to show up,
            because a coach who works there put it in. When the studio wants its
            page, it takes it.
          </p>
          <p>
            We don&rsquo;t do booking. We link out to whatever a place already
            uses. That&rsquo;s why the free Saturday run and the church basement
            class sit here next to the studio schedule.
          </p>
          <p className="about-one">One place where all of it lives.</p>
          <Contribute addHref={addHref} />
        </article>
      </div>
    </section>
  );
}
