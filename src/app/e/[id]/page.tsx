import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { fmtTime, siteOrigin } from "@/lib/format";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { BackLink } from "@/components/BackLink";
import { EventPageActions } from "@/components/EventPageActions";
import { EventRemoveButton } from "@/components/EventRemoveButton";
import { Icon } from "@/components/Icon";
import { PublicTopBar } from "@/components/PublicTopBar";
import { Roster } from "@/components/Roster";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ g?: string }>;
};

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (isoDay: string) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return `${WD[(d.getUTCDay() + 6) % 7]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { g } = await searchParams;
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return { title: "fittlist" };
  const title = `${ev.name} · fittlist`;
  const description = `${dayLabel(ev.startDate)} at ${ev.place}`;
  const gOk = g && /^[a-z0-9-]{1,40}$/i.test(g) ? g : null;
  const image = `${siteOrigin()}/api/og/event/${ev.id}${gOk ? `?g=${gOk}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}/e/${ev.id}` },
    openGraph: {
      title,
      description,
      siteName: "fittlist",
      images: [{ url: image, width: 1200, height: 630, alt: ev.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// A community event's page: the flyer, the facts, one link out. It's public
// like a class page, because the whole point of posting is being sendable.
export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) notFound();

  const viewerId = await getSessionUserId();
  const admin = viewerId ? await currentAdmin() : null;
  const canRemove = !!viewerId && (viewerId === ev.createdByUserId || !!admin);

  // Going, and who else is. The faces show to a viewer who is going (minus
  // themselves and anyone either side has blocked) and to the poster, whose
  // event it is. Everyone else sees no list at all: the price of seeing the
  // room is being in it.
  const markRows = await db
    .select({
      userId: schema.eventAttendances.userId,
      companions: schema.eventAttendances.companions,
    })
    .from(schema.eventAttendances)
    .where(eq(schema.eventAttendances.eventId, ev.id));
  const companionsByUser = new Map(markRows.map((m) => [m.userId, m.companions]));
  const going = !!viewerId && markRows.some((m) => m.userId === viewerId);
  const viewerHandle = viewerId
    ? ((
        await db
          .select({ handle: schema.users.handle })
          .from(schema.users)
          .where(eq(schema.users.id, viewerId))
      )[0]?.handle ?? null)
    : null;
  const isPoster = !!viewerId && viewerId === ev.createdByUserId;
  let faces: {
    name: string;
    photo: string | null;
    color: string;
    handle: string | null;
    companions: string[];
  }[] = [];
  if (viewerId && (going || isPoster)) {
    let ids = [...new Set(markRows.map((m) => m.userId))];
    if (!isPoster) {
      const hidden = await hiddenFrom(viewerId);
      ids = ids.filter((x) => x !== viewerId && !hidden.has(x));
    }
    const people = ids.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
      : [];
    faces = people
      .map((p) => ({
        name: p.name.trim() || p.email.split("@")[0],
        photo: p.photo,
        color: avatarColor(p),
        handle: p.handle,
        companions: companionsByUser.get(p.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const poster = ev.createdByUserId
    ? (
        await db
          .select({ name: schema.users.name, handle: schema.users.handle })
          .from(schema.users)
          .where(eq(schema.users.id, ev.createdByUserId))
      )[0]
    : undefined;
  const host = ev.hostName?.trim() || poster?.name || "";

  const multi = ev.endDate !== ev.startDate;
  const when = multi
    ? `${dayLabel(ev.startDate)} to ${dayLabel(ev.endDate)}`
    : `${dayLabel(ev.startDate)}${ev.startTime ? ` · ${fmtTime(ev.startTime)}` : ""}`;

  return (
    <div className="pub profile" data-mode={await viewerLook()}>
      <div className="profwrap">
        {viewerId ? (
          <div className="pubhead">
            <BackLink className="evback" href="/discover" label="Back to Discover">
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        ) : (
          <PublicTopBar handle="" />
        )}

        {ev.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="evhero" src={ev.photo} alt={ev.name} />
        )}
        <h1 className="profname evtitle">{ev.name}</h1>
        <div className="evfacts">
          <p className="evfact">
            <Icon name="event" size={18} /> {when}
          </p>
          <p className="evfact">
            <Icon name="place" size={18} /> {ev.place}
          </p>
          {host && (
            <p className="evfact">
              <Icon name="groups" size={18} /> Hosted by {host}
            </p>
          )}
        </div>
        {ev.description && <p className="profabout">{ev.description}</p>}
        {/* Two circles and one door, the way the profile photo overlay does
            it: Going and Share above, the event's own tickets link as the
            wide pill beneath, where the Message bar sits on a profile. */}
        <EventPageActions
          id={ev.id}
          canGo={!!viewerId && !isPoster}
          initialGoing={going}
          eventName={ev.name}
          whenLabel={dayLabel(ev.startDate)}
          shareUrl={`${siteOrigin()}/e/${ev.id}`}
          initialCompanions={viewerId ? (companionsByUser.get(viewerId) ?? []) : []}
          myHandle={viewerHandle}
        />
        {ev.link && (
          <a className="btn si evlink" href={ev.link} target="_blank" rel="noopener">
            Tickets and details
          </a>
        )}
        {viewerId && (going || isPoster) && faces.length > 0 && (
          <div className="evwho">
            <h2 className="evwho-h">{isPoster ? "Going" : "Also going"} · {faces.length}</h2>
            <Roster people={faces} />
          </div>
        )}
        {poster && (
          <p className="evposter">
            Posted by{" "}
            {poster.handle ? <a href={`/${poster.handle}`}>{poster.name}</a> : poster.name}
          </p>
        )}
        {canRemove && <EventRemoveButton id={ev.id} />}
      </div>
    </div>
  );
}
