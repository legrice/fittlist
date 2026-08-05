import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy · fittlist",
  description: "What fittlist stores, who can see it, and how to take it back.",
};

// What we hold and who sees it.
//
// Written from the schema rather than from a template, which is the only way
// it stays true: every list below names things the database actually stores,
// and the visibility section is the same rule the code enforces (canSeeWeek,
// approveFollowers, the personal-classes wall). When a column is added, this
// page is part of the change.
//
// Open to anyone with the link and rendered for signed-out visitors, because
// both app stores need a public URL for it and because a privacy policy you
// have to sign in to read is not one.
//
// It is deliberately plain. This is not legal advice and Matt should have a
// lawyer read it before it is relied on; what it is is an honest description
// of what the software does, which is the part only we can write.

const HOLDS: { t: string; s: string }[] = [
  {
    t: "Your account",
    s: "Your email address, a scrambled version of your password (never the password itself), and your name. If you claim a handle, that and everything on your profile: your photo, your title, where you are, what you teach, your bio, and any contact details you choose to publish.",
  },
  {
    t: "Your schedule",
    s: "The classes you publish or add, your own private calendar entries, and which occurrences you marked yourself down for.",
  },
  {
    t: "Who you follow",
    s: "The coaches and members you follow, and who follows you. Follow requests, if the person you asked has approval turned on.",
  },
  {
    t: "Messages",
    s: "Anything you send a coach through fittlist, and their replies. Feedback you write to us.",
  },
  {
    t: "Notifications",
    s: "The alerts waiting for you in the app, and, if you turn them on, a browser push subscription so your device can be reached.",
  },
  {
    t: "Counts",
    s: "How many times a coach's or a studio's page was opened, as a daily number. Not who opened it.",
  },
  {
    t: "Connections you make",
    s: "If you connect Google Calendar, the token that lets us write your classes to it, and which events we created. Nothing else in your calendar is read.",
  },
];

const NEVER: string[] = [
  "There are no ads, and there is no advertising network in the app.",
  "There are no third-party analytics, no tracking pixels, and no scripts from other companies. Nothing follows you to other sites.",
  "Your personal information is never sold, rented, shared or brokered.",
  "We do not build a profile of you to sell to anyone, because nobody here is the product.",
];

const SEEN: { t: string; s: string }[] = [
  {
    t: "A coach's classes are public",
    s: "That is what the page is for. A coach's schedule, their profile and the classes they teach can be seen by anyone with the link, signed in or not.",
  },
  {
    t: "A follow is private",
    s: "Nothing public says who you follow. You see your own list, a coach sees their own followers, and that is the whole audience.",
  },
  {
    t: "Your week is open unless you close it",
    s: "By default anyone can see the classes you are going to. Turn on Account privacy in your settings and only followers you have approved can, and a stranger is told nothing at all about what is behind it.",
  },
  {
    t: "Your private entries stay private",
    s: "Anything you add to your own calendar that is not a public class is yours alone. There is no setting that could publish one, on purpose.",
  },
  {
    t: "A coach sees who is coming to their class",
    s: "You marked yourself down at that coach, so the coach seeing it is what the mark meant. It never shows them where else you train.",
  },
  {
    t: "A gym sees its own rota",
    s: "If a studio has you on its schedule, its managers can see the shifts you are on there. Whether your name appears on the gym's public schedule is the gym's setting, and it is off.",
  },
];

export default async function PrivacyPage() {
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
    <section className={`screen admin${userId ? " hasnav" : ""}`} data-mode={lookMode(look)}>
      <div className="pad">
        {userId && <AppChrome userId={userId} bar />}
        {userId && (
          <div className="folback">
            <BackLink className="evback" href="/you" label="Back to your account">
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        )}
        <div className="admintop">
          <div>
            <h1>Privacy</h1>
            <p className="adminsub">What fittlist stores, who can see it, and how to take it back</p>
          </div>
        </div>

        <p className="ethos-lead">
          fittlist is a scheduling app. It holds what it needs to answer one question, which is who
          is training where and when, and it holds nothing else.
        </p>

        <h2 className="brandh" style={{ marginTop: 26 }}>What we hold</h2>
        <div className="ethos-lines">
          {HOLDS.map((h, i) => (
            <div key={i} className="ethos-line">
              <span className="ethos-line-t">{h.t}</span>
              <span className="ethos-line-s">{h.s}</span>
            </div>
          ))}
        </div>

        <h2 className="brandh" style={{ marginTop: 26 }}>What we never do</h2>
        <ul className="dellist">
          {NEVER.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>

        <h2 className="brandh" style={{ marginTop: 26 }}>Who can see what</h2>
        <div className="ethos-lines">
          {SEEN.map((h, i) => (
            <div key={i} className="ethos-line">
              <span className="ethos-line-t">{h.t}</span>
              <span className="ethos-line-s">{h.s}</span>
            </div>
          ))}
        </div>

        <h2 className="brandh" style={{ marginTop: 26 }}>Email</h2>
        <p className="ethos-lead">
          We send you the things you asked for: sign-in links, a note when somebody follows you or
          writes to you, and a weekly summary of your week. Every one of them carries a way to stop
          it, and stopping it works. There is no marketing list.
        </p>

        <h2 className="brandh" style={{ marginTop: 26 }}>Your data is yours</h2>
        <div className="ethos-lines">
          <div className="ethos-line">
            <span className="ethos-line-t">Change it</span>
            <span className="ethos-line-s">
              Everything on your profile can be edited from your account at any time.
            </span>
          </div>
          <div className="ethos-line">
            <span className="ethos-line-t">Take it with you</span>
            <span className="ethos-line-s">
              Your schedule is available as a calendar feed you can subscribe to from any calendar
              app, and your week can be copied out as text.
            </span>
          </div>
          <div className="ethos-line">
            <span className="ethos-line-t">Delete it</span>
            <span className="ethos-line-s">
              Delete account is in your settings, and it is immediate and complete: your profile,
              your classes, your calendar, your follows and your messages all go at once. Shifts a
              studio had you on open back up for somebody else rather than vanishing from their
              schedule. Nothing is kept in the background for later.
            </span>
          </div>
        </div>

        <h2 className="brandh" style={{ marginTop: 26 }}>Who else touches it</h2>
        <p className="ethos-lead">
          The app runs on hosting and database services, and email is sent through a delivery
          provider. They process data so the app can work and for nothing else. If you connect
          Google Calendar, that connection is between you and Google and you can cut it from your
          settings or from your Google account.
        </p>

        <h2 className="brandh" style={{ marginTop: 26 }}>Children</h2>
        <p className="ethos-lead">
          fittlist is not for children under 13, and accounts are not knowingly created for them.
        </p>

        <h2 className="brandh" style={{ marginTop: 26 }}>Asking us</h2>
        <p className="ethos-lead">
          Write to us through Send feedback in the app, or at the address on the contact page, and a
          person will answer. If this policy changes in a way that matters, the app will say so
          rather than quietly swapping the page.
        </p>
      </div>
    </section>
  );
}
