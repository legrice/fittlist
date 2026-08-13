import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { jsonLd, locationSlug, titleCaseLocation } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

async function cityInventory(city: string) {
  const db = await getDb();
  const [people, classRows, places] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.classes),
    db.select().from(schema.studios),
  ]);
  const coaches = people
    .filter(
      (person) =>
        person.handle &&
        person.discoverable &&
        person.kind !== "fan" &&
        person.kind !== "gym" &&
        locationSlug(person.location) === city,
    )
    .map((person) => ({
      ...person,
      classCount: classRows.filter((item) => item.userId === person.id && item.isPublic).length,
    }))
    .sort((a, b) => b.classCount - a.classCount || a.name.localeCompare(b.name));
  const studios = places
    .filter((place) => locationSlug(place.address).includes(city))
    .sort((a, b) => Number(!!b.photo) - Number(!!a.photo) || a.name.localeCompare(b.name));
  return { coaches, studios };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  const place = titleCaseLocation(city);
  const title = `Personal trainers and fitness coaches in ${place} · FittList`;
  const description = `Find local personal trainers and fitness coaches in ${place}. See their upcoming classes, follow their schedules, and build your week on FittList.`;
  const url = `${siteOrigin()}/trainers/${city}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "FittList", type: "website" },
  };
}

export default async function TrainersByCity({ params }: Props) {
  const { city } = await params;
  if (!/^[a-z0-9-]+$/.test(city)) notFound();
  const { coaches, studios } = await cityInventory(city);
  if (!coaches.length) notFound();
  const place = coaches[0]?.location || titleCaseLocation(city);
  const origin = siteOrigin();
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Fitness coaches in ${place}`,
    itemListElement: coaches.map((coach, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${origin}/${coach.handle}`,
      name: coach.name,
    })),
  };

  return (
    <main className="citypage">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(list) }} />
      <header className="cityhero">
        <Link className="citybrand" href="/">FittList</Link>
        <p>Fitness near you</p>
        <h1>Personal trainers and fitness coaches in {place}</h1>
        <p className="citylede">See who’s teaching nearby, explore their upcoming classes, and follow the schedules that fit your week.</p>
        <Link className="citycta" href="/signup">Build your week</Link>
      </header>

      <section className="citysection" aria-labelledby="local-coaches">
        <div className="citysection-head">
          <h2 id="local-coaches">Coaches in {place}</h2>
          <span>{coaches.length} local {coaches.length === 1 ? "coach" : "coaches"}</span>
        </div>
        <div className="citygrid">
          {coaches.map((coach) => (
            <Link className="cityperson" href={`/${coach.handle}`} key={coach.id}>
              {coach.photo ? <img src={coach.photo} alt="" /> : <span aria-hidden>{coach.name.slice(0, 1).toUpperCase()}</span>}
              <div>
                <h3>{coach.name}</h3>
                <p>{coach.title || coach.disciplines[0] || "Fitness coach"}</p>
                <small>{coach.classCount ? `${coach.classCount} ${coach.classCount === 1 ? "class" : "classes"} listed` : "View profile"}</small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {studios.length ? (
        <section className="citysection" aria-labelledby="local-places">
          <div className="citysection-head"><h2 id="local-places">Fitness places in {place}</h2></div>
          <div className="cityplaces">
            {studios.slice(0, 8).map((studio) => (
              <Link href={`/s/${studio.slug ?? studio.id}`} key={studio.id}>
                <strong>{studio.name}</strong>
                <span>{studio.types.slice(0, 3).join(" · ") || "Fitness space"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
