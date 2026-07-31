import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ethos · fittlist",
  description: "What fittlist is for, and the lines it won't cross.",
};

// The ethos. Mirrors ETHOS.md in the repo, which is the source of truth for
// development; this page is the readable copy. Open to anyone with the link,
// same as the brand guide: it's a promise, and promises are for showing.
// The settings row that points here is admin-only.

const LAWS = [
  { t: "Obey the law.", s: "" },
  { t: "Take care of the people who train.", s: "Members first, in every decision." },
  { t: "Take care of the coaches.", s: "Their schedule is their livelihood. Treat it that way." },
  {
    t: "Take care of whoever builds this.",
    s: "Paid fairly, given what they need, and they use the app too.",
  },
];

const LINES = [
  {
    t: "Never addicting",
    s: "The app ends. Your week empties itself. No streaks, no infinite feeds, no reason to open it that isn't a real class with real people.",
  },
  {
    t: "Nobody is the product",
    s: "No ads. Personal data is never sold, shared, or brokered. What people tell us runs the thing they asked for, and nothing else.",
  },
  {
    t: "Private by default",
    s: "A follow is private. Visibility is unlocked by consent, never by growth math.",
  },
  {
    t: "No enshittification",
    s: "The product never gets worse on purpose. No feature is degraded, gated, or cluttered to squeeze value out of people who already trusted us.",
  },
  {
    t: "Charge in the open",
    s: "When fittlist costs money, the price comes with the reason: what it pays for, and why it is what it is. Paying for the lights, never for the growth chart.",
  },
  {
    t: "Few features, done well",
    s: "Build what helps someone find their fit. Skip the rest, even when it's easy.",
  },
  {
    t: "Finish, then add",
    s: "One feature at a time, perfected, before the next begins. A half-built thing stacked on another half-built thing is how good products rot; new ideas wait their turn, however exciting they are.",
  },
  {
    t: "Human, not artificial",
    s: "Fittlist is people teaching people, in rooms. AI helps build the product; it never performs in it. No sparkle glyphs, no generated coaches, no machine pretending to be a person. What you see on fittlist was done by someone.",
  },
];

export default async function EthosPage() {
  const userId = await getSessionUserId();
  let look: string | null = null;
  if (userId) {
    const db = await getDb();
    const [me] = await db
      .select({ look: schema.users.look })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    look = me?.look ?? null;
  }

  return (
    <section
      className={`screen admin${userId ? " hasnav" : ""}`}
      data-mode={look === "dark" ? "dark" : undefined}
    >
      <div className="pad">
        {userId && <AppChrome userId={userId} bar />}
        {userId && (
          <div className="folback">
            <BackLink className="evback" href="/app?acct=1" label="Back to your account">
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        )}
        <div className="admintop">
          <div>
            <h1>Ethos</h1>
            <p className="adminsub">What fittlist is for, and the lines it won&rsquo;t cross</p>
          </div>
        </div>

        <p className="ethos-lead">
          fittlist exists to put people in rooms together. Success is a class attended, a coach
          found, a friend made at the gym. It is never a minute spent in the app.
        </p>

        <h2 className="brandh" style={{ marginTop: 26 }}>The laws</h2>
        <p className="adminsub">In order. When two collide, the earlier one wins.</p>
        <ol className="ethos-laws">
          {LAWS.map((l, i) => (
            <li key={i}>
              <span className="ethos-law-t">{l.t}</span>
              {l.s && <span className="ethos-law-s">{l.s}</span>}
            </li>
          ))}
        </ol>

        <h2 className="brandh" style={{ marginTop: 26 }}>The lines</h2>
        <p className="adminsub">Things fittlist does not do, at any size, for any reason.</p>
        <div className="ethos-lines">
          {LINES.map((l, i) => (
            <div key={i} className="ethos-line">
              <span className="ethos-law-t">{l.t}</span>
              <span className="ethos-law-s">{l.s}</span>
            </div>
          ))}
        </div>

        <h2 className="brandh" style={{ marginTop: 26 }}>How to use this</h2>
        <p className="ethos-lead">
          Before an idea ships, it answers one question: which law does it serve? If it serves
          none, it waits. If it breaks one, it dies, no matter whose idea it was or how good the
          numbers look. This page changes slowly and reluctantly: adding a line is easy, and
          living with it is the commitment.
        </p>
      </div>
    </section>
  );
}
