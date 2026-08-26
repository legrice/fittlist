"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import { initialOf } from "@/lib/avatar";
import type { PublicPreviewData, PublicPreviewEntity } from "@/lib/public-preview";
import styles from "./PublicPreview.module.css";

type Intent = {
  title: string;
  body: string;
  next: string;
  entity?: PublicPreviewEntity;
};

const intentFor = (kind: "save" | "follow" | "join" | "add" | "notifications", name?: string, entity?: PublicPreviewEntity): Intent => {
  if (kind === "save") return { title: `Save ${name ?? "this class"}`, body: "Create your FittList to keep classes together and get back to them quickly.", next: "/calendar" };
  if (kind === "follow") return { title: `Follow ${name ?? "this calendar"}`, body: "Create your FittList to keep this schedule close and see its updates.", next: "/calendar", entity };
  if (kind === "join") return { title: `Join ${name ?? "this group"}`, body: "Create your FittList to join the community and receive its updates.", next: "/groups", entity };
  if (kind === "add") return { title: "Build your calendar", body: "Create your FittList to publish classes, manage a studio, or keep your own fitness schedule.", next: "/calendar" };
  return { title: "Stay in the loop", body: "Create your FittList to receive schedule, class, and community updates.", next: "/notifications" };
};

function Avatar({ entity, size = 48 }: { entity: Pick<PublicPreviewEntity, "name" | "photo" | "color" | "kind">; size?: number }) {
  return (
    <span className={`${styles.avatar} ${entity.kind === "studio" ? styles.studioAvatar : ""}`} style={{ width: size, height: size, background: entity.color }}>
      {entity.photo ? <img src={entity.photo} alt="" width={size} height={size} loading="lazy" decoding="async" /> : initialOf(entity.name)}
    </span>
  );
}

function EntityCard({ entity, onIntent }: { entity: PublicPreviewEntity; onIntent: (intent: Intent) => void }) {
  const isGroup = entity.kind === "group";
  return (
    <article className={`${styles.placeCard} ${isGroup ? styles.groupCard : styles.studioCard}`}>
      <Link href={entity.href} aria-label={`View ${entity.name}`}><Avatar entity={entity} size={62} /></Link>
      <div className={styles.placeCopy}>
        <Link href={entity.href}>{entity.name}</Link>
        <span>{isGroup ? "Fitness group" : "Studio"}</span>
      </div>
      <button type="button" onClick={() => onIntent(intentFor(isGroup ? "join" : "follow", entity.name, entity))}>
        {isGroup ? "Join" : "Follow"}
      </button>
    </article>
  );
}

export function PublicPreview({ data }: { data: PublicPreviewData }) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [city, setCity] = useState(data.city);
  const coaches = data.coaches.slice(0, 5);
  const studios = data.studios.slice(0, 4);
  const groups = data.groups.slice(0, 3);
  const hasDirectory = !!(coaches.length || studios.length || groups.length);
  const days = [...new Set(data.classes.map((item) => item.iso))];
  const authHref = (mode: "signup" | "login") => `/?join=${mode}&next=${encodeURIComponent(intent?.next ?? "/calendar")}`;
  const updateCity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCity = city.trim();
    if (!nextCity) return;
    router.push(`/?city=${encodeURIComponent(nextCity)}`);
  };

  return (
    <main id="top" className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <div className={styles.headerActions}>
          <Link href="/?join=login" className={styles.signIn}>Sign in</Link>
          <Link href="/?join=signup" className={styles.primary}>Get started</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <h1>Find fitness near you.</h1>
          <p className={styles.lede}>Follow local coaches, studios, and groups. Keep every schedule in one place.</p>
        </div>
        <form className={styles.location} onSubmit={updateCity}>
          <Icon name="place" size={21} />
          <label htmlFor="preview-city">Explore near</label>
          <input id="preview-city" name="city" value={city} onChange={(event) => setCity(event.target.value)} aria-label="City" />
          <button type="submit">Go</button>
        </form>
      </section>

      {hasDirectory && (
        <div id="near" className={styles.directory} aria-label={`Fitness near ${data.city}`}>
          {!!coaches.length && (
            <section className={styles.railSection}>
              <div className={styles.sectionHead}><h2>Coaches near {data.city.split(",")[0]}</h2><Link href="/?join=signup">See more</Link></div>
              <div className={styles.rail}>
                {coaches.map((entity) => (
                  <div className={styles.entity} key={entity.key}>
                    <Link href={entity.href} aria-label={`View ${entity.name}`}><Avatar entity={entity} size={68} /></Link>
                    <Link href={entity.href} className={styles.entityName}>{entity.name}</Link>
                    <button type="button" onClick={() => setIntent(intentFor("follow", entity.name, entity))}>Follow</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {!!studios.length && (
            <section className={styles.railSection}>
              <div className={styles.sectionHead}><h2>Studios near {data.city.split(",")[0]}</h2><Link href="/?join=signup">See more</Link></div>
              <div className={styles.placeRail}>{studios.map((entity) => <EntityCard key={entity.key} entity={entity} onIntent={setIntent} />)}</div>
            </section>
          )}
          {!!groups.length && (
            <section className={styles.railSection}>
              <div className={styles.sectionHead}><h2>Groups near {data.city.split(",")[0]}</h2><Link href="/?join=signup">See more</Link></div>
              <div className={styles.placeRail}>{groups.map((entity) => <EntityCard key={entity.key} entity={entity} onIntent={setIntent} />)}</div>
            </section>
          )}
        </div>
      )}

      <section id={hasDirectory ? undefined : "near"} className={styles.schedule}>
        <div className={styles.sectionHead}>
          <div><p className={styles.kicker}>Public schedules</p><h2>Coming up</h2></div>
          <button type="button" className={styles.addButton} onClick={() => setIntent(intentFor("add"))}><Icon name="add" size={20} /> Add yours</button>
        </div>
        {data.classes.length ? days.map((iso) => {
          const rows = data.classes.filter((item) => item.iso === iso);
          return (
            <section className={styles.day} key={iso}>
              <h3>{rows[0]?.day}</h3>
              {rows.map((item) => (
                <article className={styles.classRow} key={item.key}>
                  <Link href={item.href} className={styles.classMain}>
                    <span className={styles.avatar} style={{ background: item.color }}>
                      {item.photo ? <img src={item.photo} alt="" width="52" height="52" loading="lazy" decoding="async" /> : initialOf(item.coach ?? item.place)}
                    </span>
                    <span className={styles.classCopy}><strong>{item.name}</strong><span>{item.place}</span>{item.coach && <small>{item.coach}</small>}</span>
                  </Link>
                  <time dateTime={`${item.iso}T${item.time}`}>{item.time}</time>
                  <button className={styles.save} type="button" aria-label={`Save ${item.name}`} onClick={() => setIntent(intentFor("save", item.name))}><Icon name="bookmark" size={20} /></button>
                </article>
              ))}
            </section>
          );
        }) : (
          <div className={styles.empty}>
            <Icon name="place" size={28} />
            <h3>No public schedules found in {data.city}</h3>
            <p>Try a nearby city, or be the first to publish a calendar here.</p>
            <button type="button" onClick={() => setIntent(intentFor("add"))}>Create a FittList</button>
          </div>
        )}
      </section>

      <section className={styles.closer}>
        <h2>One link for your whole fitness world.</h2>
        <p>Share a live schedule, manage studio shifts, or keep the calendars you care about close.</p>
        <button className={styles.closerCta} type="button" onClick={() => setIntent(intentFor("add"))}>Get started</button>
      </section>

      <nav className={styles.mobileNav} aria-label="Preview navigation">
        <a href="#top"><Icon name="calendar_month" /><span>Calendar</span></a>
        <a href="#near"><Icon name="search" /><span>Discover</span></a>
        <button type="button" onClick={() => setIntent(intentFor("notifications"))}><Icon name="notifications" /><span>Updates</span></button>
      </nav>

      {intent && (
        <div className={styles.scrim} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIntent(null)}>
          <section className={styles.prompt} role="dialog" aria-modal="true" aria-labelledby="public-intent-title">
            <button className={styles.close} type="button" aria-label="Close" onClick={() => setIntent(null)}><Icon name="close" /></button>
            <span className={styles.promptMark}><Wordmark /></span>
            {intent.entity && <span className={styles.promptEntity}><Avatar entity={intent.entity} size={78} /></span>}
            <h2 id="public-intent-title">{intent.title}</h2>
            <p>{intent.body}</p>
            <Link href={authHref("signup")} className={styles.primary}>Get started</Link>
            <Link href={authHref("login")} className={styles.loginLink}><span>Already have an account?</span> Log in</Link>
          </section>
        </div>
      )}
    </main>
  );
}
