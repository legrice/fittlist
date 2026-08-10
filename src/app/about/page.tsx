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
        {/* The copy and its hierarchy are Matt's, word for word: the two
            hero statements top and bottom, plain section headers between,
            the supporting lines a step down. Typography and spacing do the
            work; no cards, no pills, no decoration. */}
        <article className="aboutpage">
          <h1>FittList is a public record of what&rsquo;s happening in local fitness.</h1>
          <p>The classes, the places they happen, and the people leading them.</p>
          <p>That record doesn&rsquo;t exist right now.</p>
          <p>
            A yoga class lives in Mindbody. A HYROX session lives in ClassPass. A
            run club lives in an Instagram story that disappears in a day. And a
            coach teaching at six gyms has six calendars and nowhere to point
            anyone.
          </p>

          <h2>FittList brings all of it together.</h2>
          <p>
            For coaches, it&rsquo;s one place to build, organize, and share their
            entire teaching schedule, no matter how many places they teach.
          </p>
          <p>
            Update it once and there&rsquo;s one link to send when someone asks,
            &ldquo;Where are you teaching this week?&rdquo;
          </p>
          <p>And every schedule makes the larger record better.</p>

          <h2>Your fitness calendar. However you want to use it.</h2>
          <p>FittList isn&rsquo;t just for coaches.</p>
          <p>
            Members and coaches can build their own fitness calendars from
            whatever they&rsquo;re doing. Classes they&rsquo;re teaching. Classes
            they&rsquo;re taking. Run clubs. Events. Workouts. Whatever gets them
            moving.
          </p>
          <p>
            Keep it for yourself. Share the whole thing. Share part of it. Send
            someone a link.
          </p>
          <p>It&rsquo;s your calendar.</p>

          <h2>We&rsquo;re not building another social media app.</h2>
          <p>We don&rsquo;t need another place to post about working out.</p>
          <p>
            FittList is here to help people share where they&rsquo;re fitnessing
            so they can connect in person.
          </p>
          <p>
            See where your favorite coach is teaching. Find out what your friends
            are doing Saturday morning. Discover a class happening around the
            corner. Then go do it with them.
          </p>
          <h3>The connection happens out there, not in here.</h3>

          <h2>Anyone can add to FittList.</h2>
          <p>Anyone can add a class. Anyone can fix one that&rsquo;s wrong.</p>
          <p>
            A studio doesn&rsquo;t have to sign up to show up, because a coach who
            works there can add it. When the studio wants its page, it takes it.
          </p>

          <h2>We don&rsquo;t do booking.</h2>
          <p>We link out to whatever a place already uses.</p>
          <p>
            That&rsquo;s why the free Saturday run and the church basement class
            can sit next to the boutique studio schedule.
          </p>

          <h3>Coaches get one place for their schedule.</h3>
          <h3>
            Everyone gets a fitness calendar they can build and share however
            they want.
          </h3>
          <h3>The community gets one place for everything happening around them.</h3>

          <p className="about-one">One place where all of it lives.</p>
          <Contribute addHref={addHref} />
        </article>
      </div>
    </section>
  );
}
