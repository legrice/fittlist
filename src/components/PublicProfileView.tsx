import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fansEnabled, fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { clockParts, fmtDayHeader, runsOn, timeToMinutes } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { studioPath } from "@/lib/studio";

import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { NotifyCta } from "@/components/NotifyCta";
import { ProfileOwnerBar } from "@/components/ProfileOwnerBar";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";
import { Wordmark } from "@/components/Wordmark";

const WINDOW_DAYS = 31; // a continuous forward window — about a month

type UserRow = typeof schema.users.$inferSelect;

// The public page: an identity header and one section under it. Three URLs,
// one per tab: /{handle}, /{handle}/contact, /{handle}/schedule. A coach can
// send someone straight to the schedule and they land on it.
export async function PublicProfileView({
  user,
  isOwner,
  tab,
  from,
}: {
  user: UserRow;
  isOwner: boolean;
  tab: ProfileTab;
  /** Which tab sent them here, so the back arrow returns to it. */
  from?: string;
}) {
  // A profile behaves like a class page: no app header, no bottom tabs, just
  // the page and a way back to wherever it was tapped from.
  const handle = user.handle!;
  const db = await getDb();

  // Fan side (flag-gated): a signed-in viewer gets a one-tap Follow button on
  // the subscribe bar instead of the email sheet.
  let account: { following: boolean } | null = null;
  let signedIn = false;
  if (!isOwner && (await fansVisible())) {
    const viewerId = await getSessionUserId();
    if (viewerId) {
      const [viewer] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, viewerId));
      if (viewer) {
        signedIn = true;
        const [row] = await db
          .select({ optedOutAt: schema.subscribers.optedOutAt })
          .from(schema.subscribers)
          .where(
            and(
              eq(schema.subscribers.trainerUserId, user.id),
              eq(schema.subscribers.email, viewer.email),
            ),
          );
        account = { following: !!row && !row.optedOutAt };
      }
    }
  }
  // Only a tab we actually sent them from earns an arrow — someone who opened
  // this link from outside has nowhere in the app to go back to.
  // A tab we know by name gets a named destination; anything else walks back
  // through history, which is where they actually tapped from.
  const backTo =
    from === "discover"
      ? { href: "/discover", label: "Back to Discover" }
      : from === "home"
        ? { href: "/feed", label: "Back to Following" }
        : from === "schedule"
          ? { href: "/app", label: "Back to your schedule" }
          : from === "followers"
            ? { href: "/followers", label: "Back to your followers" }
            : null;

  const classRows = (
    await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id))
  ).filter((c) => c.isPublic); // private client sessions never appear publicly
  // "Where I coach" is the union of studios the coach picked in setup and any
  // studio they've published a class at.
  const pickedRows = await db
    .select({ studioId: schema.coachStudios.studioId })
    .from(schema.coachStudios)
    .where(eq(schema.coachStudios.userId, user.id));
  const studioIds = [
    ...new Set([...classRows.map((c) => c.studioId), ...pickedRows.map((p) => p.studioId)]),
  ].filter((id): id is string => !!id);
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));
  // Studios/spaces this coach is associated with, derived from where they coach.
  const coachStudios = [...studioRows].sort((a, b) => a.name.localeCompare(b.name));

  // Continuous forward calendar: each date from today with classes.
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days: { iso: string; label: string; items: typeof classRows }[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
  }

  // The face moved up into the header, above the name, so About starts with
  // what they actually wrote.
  const avatar = user.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="profav" src={user.photo} alt={user.name} />
  ) : (
    <div className="profav profav-empty" style={{ background: avatarColor(user) }} aria-hidden="true">
      {user.name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );

  const about = (
    <>
      {user.about?.trim() && <p className="profabout">{user.about}</p>}
      {user.highlights.length > 0 && (
        <div className="profsec focussec">
          <h2 className="prof-sec-h">Coaching focus</h2>
          <ul className="expectlist">
            {user.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      {user.certifications.length > 0 && (
        <div className="profsec certsec">
          <h2 className="prof-sec-h">Certifications</h2>
          <ul className="expectlist">
            {user.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {coachStudios.length > 0 && (
        <div className="profstudios">
          <h2 className="prof-sec-h">Where I coach</h2>
          {coachStudios.map((s) => (
            // A place is somewhere with a face, same as a person. The card
            // around each one made a list of two look like a form; the photo
            // carries the row instead, and an initial stands in without one.
            <Link key={s.id} className="coachstudio" href={studioPath(s)}>
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="coachstudio-av" src={s.photo} alt="" />
              ) : (
                <span className="coachstudio-av coachstudio-av-empty" aria-hidden="true">
                  {(s.name.trim().charAt(0) || "?").toUpperCase()}
                </span>
              )}
              <span className="coachstudio-txt">
                <span className="nm">{s.name}</span>
                <span className="ad">{s.address}</span>
              </span>
              <span className="coachstudio-chev">
                <Icon name="chevron_right" size={18} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );

  // Contact is its own page: the private-session request plus the ways to
  // reach the coach, stacked as full-width rows. No "Contact" heading on it,
  // because the tab you tapped to get here already says that.
  const hasContactDetails = !!(
    user.contactEmail ||
    user.phone ||
    user.whatsapp ||
    user.instagram ||
    user.website ||
    user.profileLinks.length
  );
  // The header's Message pill is the main door. This one stays for the person
  // who scrolled to Contact looking for exactly this, and only while the coach
  // is taking private clients.
  const canRequest = !isOwner && !!user.availability && user.messagesOpen;
  const hasContact = hasContactDetails || canRequest;
  const contact = hasContact ? (
    <>
      {canRequest && <RequestSessionButton handle={handle} coachName={user.name} />}
      <div className="contactlist">
        {user.contactEmail && (
          <a className="proflink" href={`mailto:${user.contactEmail}`}>
            <Icon name="mail" size={18} /> Email
          </a>
        )}
        {user.phone && (
          <a className="proflink" href={`tel:${user.phone.replace(/[^\d+]/g, "")}`}>
            <Icon name="call" size={18} /> Call
          </a>
        )}
        {user.whatsapp && (
          <a
            className="proflink"
            href={`https://wa.me/${user.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener nofollow"
          >
            <Icon name="chat" size={18} /> WhatsApp
          </a>
        )}
        {user.instagram && (
          <a
            className="proflink"
            href={`https://instagram.com/${user.instagram}`}
            target="_blank"
            rel="noopener nofollow"
          >
            <InstagramGlyph /> Instagram
          </a>
        )}
        {user.website && (
          <a className="proflink" href={user.website} target="_blank" rel="noopener nofollow">
            <Icon name="public" size={18} /> Website
          </a>
        )}
        {user.profileLinks.map((l, i) => (
          <a key={i} className="proflink" href={l.url} target="_blank" rel="noopener nofollow">
            <Icon name="link" size={18} /> {l.label}
          </a>
        ))}
      </div>
    </>
  ) : null;

  const schedule = (
    <>
      {days.length === 0 ? (
        <div className="empty-block">
          <h2>Nothing on the calendar</h2>
          <p>
            {user.name} hasn&rsquo;t posted classes yet. Join the list and you&rsquo;ll get an email
            the moment they do.
          </p>
        </div>
      ) : (
        <div className="ps-week ps-agenda">
          {days.map((d) => (
          <div key={d.iso} className="ps-daygroup">
            <div className="ps-daycol">{d.label}</div>
            <div className="ps-daycards">
              {d.items.map((c) => {
                const s = c.studioId ? studioById.get(c.studioId) : undefined;
                const where = s ? s.name : c.location;
                const start = clockParts(c.startTime);
                return (
                  <Link key={`${d.iso}-${c.id}`} className="ps-event" data-cid={c.id} href={`/${handle}/${c.id}`}>
                    <span
                      className="ps-accent"
                      style={{ background: avatarColor(user) }}
                      aria-hidden="true"
                    />
                    <span className="ps-ebody">
                      <span className="ps-enm">{c.name}</span>
                      {where && (
                        <span className="ps-estudio">
                          <Icon name="place" size={13} className="ps-estudio-ic" />
                          {where}
                        </span>
                      )}
                    </span>
                    <span className="ps-etimecol">
                      <span className="ps-etime">
                        {start.hm}
                        <span className="ps-ap">{start.ap}</span>
                      </span>
                      <span className="ps-edur">{c.durationMin} min</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      className="pub profile"
      data-theme={user.theme}
      data-mode={await viewerLook()}
    >
      {isOwner && (
        <ProfileOwnerBar
          name={user.name}
          title={user.title ?? ""}
          about={user.about ?? ""}
          location={user.location ?? ""}
          certifications={user.certifications}
          highlights={user.highlights}
          instagram={user.instagram ?? ""}
          website={user.website ?? ""}
          contactEmail={user.contactEmail ?? ""}
          phone={user.phone ?? ""}
          whatsapp={user.whatsapp ?? ""}
          profileLinks={user.profileLinks}
          photo={user.photo}
          avatarColor={user.avatarColor}
          userId={user.id}
        />
      )}
      <div className="profwrap">
        {/* A visitor needs to know where they are and how to join. Someone
            signed in has both already, and gets the back arrow instead. */}
        {!signedIn && !isOwner && <PublicTopBar handle={handle} />}
        <ProfileTabs
          handle={handle}
          tab={tab}
          name={user.name}
          title={user.title ?? ""}
          location={user.location ?? ""}
          hasContact={hasContact}
          trackSchedule={!isOwner}
          back={
            signedIn ? (
              <BackLink className="evback" href={backTo?.href} label={backTo?.label ?? "Back"}>
                <Icon name="arrow_back" size={21} />
              </BackLink>
            ) : null
          }
          avatar={avatar}
          actions={
            // The owner previewing their own page has nobody to follow and
            // nobody to write to.
            !isOwner ? (
              <div className="profacts">
                {user.messagesOpen && (
                  <RequestSessionButton handle={handle} coachName={user.name} variant="pill" />
                )}
                <NotifyCta
                  trainerName={user.name}
                  handle={handle}
                  account={account}
                  canSignUp={fansEnabled()}
                />
              </div>
            ) : null
          }
          avail={
            user.availability ? (
              <div className={`availpill availpill-${user.availability}`}>
                <span className="availdot" aria-hidden="true" />
                {user.availability === "accepting"
                  ? "Accepting new clients"
                  : "Waitlist for new clients"}
              </div>
            ) : null
          }
        >
          {/* One section, the one they asked for. Contact can vanish (no
              details and no open door), so it falls back to About rather than
              rendering an empty page under a tab that isn't there. */}
          {tab === "schedule" ? schedule : tab === "contact" && contact ? contact : about}
        </ProfileTabs>
        {/* The growth loop is aimed at visitors — someone already signed in
            has an account, so it's noise on every page they open. */}
        {!isOwner && !signedIn && (
          <div className="madewith">
            Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
            <Link href={`/?via=${handle}`}>Claim your page</Link>
          </div>
        )}
      </div>
    </div>
  );
}
