import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { clockParts, fmtDayHeader, timeToMinutes } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { NotifyCta } from "@/components/NotifyCta";
import { ProfileOwnerBar } from "@/components/ProfileOwnerBar";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { ProfileTabs } from "@/components/ProfileTabs";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Wordmark } from "@/components/Wordmark";

const WINDOW_DAYS = 31; // a continuous forward window — about a month

type UserRow = typeof schema.users.$inferSelect;

// The whole public page: an identity header, an About / Schedule tab switcher,
// and a persistent "get email updates" bar. Shared by /{handle} (About first)
// and /{handle}/schedule (Schedule first) so both are one page, no navigation.
export async function PublicProfileView({
  user,
  isOwner,
  initialTab,
}: {
  user: UserRow;
  isOwner: boolean;
  initialTab: "about" | "schedule";
}) {
  const handle = user.handle!;
  const db = await getDb();
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
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
  }

  const about = (
    <>
      {user.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="profphoto" src={user.photo} alt={user.name} />
      ) : (
        <div className="profphoto profphoto-empty" aria-hidden="true">
          {user.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
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
            <a
              key={s.id}
              className="profstudio"
              href={`https://maps.google.com/?q=${encodeURIComponent(`${s.name}, ${s.address}`)}`}
              target="_blank"
              rel="noopener nofollow"
            >
              <span className="profstudio-ic"><Icon name="place" size={20} /></span>
              <span className="profstudio-txt">
                <span className="nm">{s.name}</span>
                <span className="ad">{s.address}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  );

  // Contact gets its own tab/section: the private-session request plus the
  // ways to reach the coach, stacked as full-width rows. The request button
  // only exists while the coach is taking clients (accepting/waitlist) —
  // availability hidden means no inquiries.
  const hasContact = !!(
    user.contactEmail ||
    user.phone ||
    user.whatsapp ||
    user.instagram ||
    user.website ||
    user.profileLinks.length
  );
  const canRequest = !isOwner && !!user.availability;
  const contact = hasContact || canRequest ? (
    <>
      <h2 className="prof-sec-h sched-h">Contact</h2>
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
      <h2 className="prof-sec-h sched-h">Schedule</h2>
      {days.length === 0 ? (
        <div className="empty-block" style={{ background: "#fff" }}>
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
                    <span className="ps-accent" aria-hidden="true" />
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
    <div className="pub profile" data-theme={user.theme} data-mode={user.look === "dark" ? "dark" : undefined}>
      {isOwner && (
        <ProfileOwnerBar
          name={user.name}
          title={user.title ?? ""}
          about={user.about ?? ""}
          location={user.location ?? ""}
          certifications={user.certifications}
          highlights={user.highlights}
          availability={user.availability}
          instagram={user.instagram ?? ""}
          website={user.website ?? ""}
          contactEmail={user.contactEmail ?? ""}
          phone={user.phone ?? ""}
          whatsapp={user.whatsapp ?? ""}
          profileLinks={user.profileLinks}
          photo={user.photo}
        />
      )}
      <div className="profwrap">
        <ProfileTabs
          handle={handle}
          initialTab={initialTab}
          name={user.name}
          title={user.title ?? ""}
          location={user.location ?? ""}
          trackSchedule={!isOwner}
          share={<ShareProfileButton name={user.name} />}
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
          about={about}
          contact={contact}
          schedule={schedule}
        />
        <div className="madewith">
          Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
          <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
      {/* The subscribe bar is for visitors; the owner previewing their own page
          never sees it. */}
      {!isOwner && <NotifyCta trainerName={user.name} handle={handle} />}
    </div>
  );
}
