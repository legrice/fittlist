import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, mondayOfCurrentWeek, siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { BYDAY, floatingEnd, floatingStart } from "@/lib/ics";
import { BackLink } from "@/components/BackLink";
import { EventActions } from "@/components/EventActions";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ handle: string; classId: string }> };

export default async function EventPage({ params }: Props) {
  const { handle, classId } = await params;
  if (!UUID_RE.test(classId)) notFound();

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c) notFound();

  const isOwner = (await getSessionUserId()) === user.id;
  // Private client sessions aren't public; only the owner can open their page.
  if (!c.isPublic && !isOwner) notFound();

  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // A weekly class shows this week's date for its weekday; a one-off shows its own.
  const whenIso =
    c.specificDate ??
    (() => {
      const d = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
      return d.toISOString().slice(0, 10);
    })();
  const mapsUrl = studio
    ? `https://maps.google.com/?q=${encodeURIComponent(`${studio.name}, ${studio.address}`)}`
    : null;

  // "Add to calendar" targets. Google gets a prefilled template link; Apple and
  // Outlook get the downloadable .ics. Weekly classes carry a weekly recurrence.
  const classUrl = `${siteOrigin()}/${handle}/${c.id}`;
  const locationText = studio ? `${studio.name}, ${studio.address}` : c.location ?? "";
  const gcalDetails = c.links.length
    ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + `\n\n${classUrl}`
    : classUrl;
  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: c.name,
    dates: `${floatingStart(whenIso, c.startTime)}/${floatingEnd(whenIso, c.startTime, c.durationMin)}`,
    details: gcalDetails,
  });
  if (locationText) gcalParams.set("location", locationText);
  if (!c.specificDate) gcalParams.set("recur", `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[c.dayOfWeek]}`);
  const googleUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;
  const icsHref = `/api/cal/${handle}/${c.id}`;

  return (
    <div className="pub evpage" data-theme={user.theme} data-mode={user.look === "dark" ? "dark" : undefined}>
      {isOwner && (
        <div className="previewbar">
          <span>
            <Icon name="visibility" size={16} className="pv-eye" /> Previewing your page
          </span>
          <BackLink className="previewback" href="/app">
            ← Back to your account
          </BackLink>
        </div>
      )}
      <div className="evwrap">
        <BackLink className="evback" href={`/${handle}/schedule`}>
          ← {user.name}&rsquo;s schedule
        </BackLink>
        <div className="evcard">
          {c.classType && <span className="evtype">{c.classType}</span>}
          <h1 className="evname">{c.name}</h1>
          <div className="evwhen">
            {fmtDateLong(whenIso)} · {fmtTime(c.startTime)}
          </div>
          <div className="evlen">{c.durationMin} min</div>
          {c.description?.trim() && <p className="evdesc">{c.description}</p>}
          {studio ? (
            <>
              <div className="evstudio">{studio.name}</div>
              <a className="evaddr" href={mapsUrl!} target="_blank" rel="noopener nofollow">
                {studio.address}
              </a>
            </>
          ) : (
            c.location && <div className="evstudio">{c.location}</div>
          )}
          <div className="evbook">
            {c.links.length ? (
              c.links.map((l, i) => (
                <a
                  key={i}
                  className="btn si evbtn"
                  href={l.url}
                  target="_blank"
                  rel="noopener nofollow"
                >
                  Book via {l.label}
                  <Icon name="north_east" size={18} className="evbtn-ico" />
                </a>
              ))
            ) : (
              <div className="evnobook">Just show up, no booking needed.</div>
            )}
          </div>
          <EventActions
            googleUrl={googleUrl}
            icsHref={icsHref}
            shareUrl={classUrl}
            shareTitle={c.name}
          />
        </div>
        <div className="madewith">
          Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
          <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
    </div>
  );
}
