"use client";

import { ChangeEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import { initialOf } from "@/lib/avatar";
import type { PublicPreviewData } from "@/lib/public-preview";
import styles from "./PublicPreview.module.css";

type Intent = {
  title: string;
  body: string;
  next: string;
};

const intentFor = (kind: "save" | "add", name?: string): Intent => {
  if (kind === "save") return { title: `Save ${name ?? "this class"}`, body: "Create your FittList to keep classes together and get back to them quickly.", next: "/calendar" };
  return { title: "Build your calendar", body: "Create your FittList to publish classes, manage a studio, or keep your own fitness schedule.", next: "/calendar" };
};

export function PublicPreview({ data }: { data: PublicPreviewData }) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);
  const days = [...new Set(data.classes.map((item) => item.iso))];
  const authHref = (mode: "signup" | "login") => `/?join=${mode}&next=${encodeURIComponent(intent?.next ?? "/calendar")}`;
  const updateCity = (event: ChangeEvent<HTMLSelectElement>) => {
    router.push(`/?city=${encodeURIComponent(event.target.value)}`);
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
        <h1>All of your fitness in one calendar.</h1>
        <button className={styles.heroCta} type="button" onClick={() => setIntent(intentFor("add"))}>Start your FittList</button>
      </section>

      <section className={styles.schedule} aria-label={`Public calendar near ${data.city}`}>
        <label className={styles.citySelect}>
          <span className="sr-only">Calendar city</span>
          <select value={data.city} onChange={updateCity}>
            {data.cities.map((city) => <option value={city} key={city}>{city}</option>)}
          </select>
          <Icon name="expand_more" size={17} />
        </label>
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
            <p>Try a nearby city from the menu above.</p>
          </div>
        )}
      </section>

      {intent && (
        <div className={styles.scrim} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIntent(null)}>
          <section className={styles.prompt} role="dialog" aria-modal="true" aria-labelledby="public-intent-title">
            <button className={styles.close} type="button" aria-label="Close" onClick={() => setIntent(null)}><Icon name="close" /></button>
            <span className={styles.promptMark}><Wordmark /></span>
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
