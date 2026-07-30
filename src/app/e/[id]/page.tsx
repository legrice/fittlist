import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { fmtTime, siteOrigin } from "@/lib/format";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { BackLink } from "@/components/BackLink";
import { EventRemoveButton } from "@/components/EventRemoveButton";
import { Icon } from "@/components/Icon";
import { PublicTopBar } from "@/components/PublicTopBar";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (isoDay: string) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return `${WD[(d.getUTCDay() + 6) % 7]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return { title: "fittlist" };
  const title = `${ev.name} · fittlist`;
  const description = `${dayLabel(ev.startDate)} at ${ev.place}`;
  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}/e/${ev.id}` },
    openGraph: { title, description, siteName: "fittlist" },
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
        {ev.link && (
          <a className="btn si evlink" href={ev.link} target="_blank" rel="noopener">
            Tickets and details
          </a>
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
