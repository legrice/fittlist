import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { lookMode } from "@/lib/darkmode";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import styles from "./marketing.module.css";

const sampleClasses = [
  { day: "Today", time: "6:00pm", name: "Soul Power Yoga", place: "Asana Soul Practice", tone: "mint" },
  { day: "Tomorrow", time: "7:00am", name: "Guns, Buns, and Lungs", place: "Ironbound Performance", tone: "blue" },
  { day: "Tomorrow", time: "6:00pm", name: "Strength & Mobility", place: "Studio Arc", tone: "amber" },
];

const multiStudioWeek = [
  { day: "Mon", time: "7:00am", name: "Soul Flow Yoga", place: "Asana Soul Practice", tone: "mint" },
  { day: "Tue", time: "6:00pm", name: "Strength & Mobility", place: "Ironbound Performance", tone: "blue" },
  { day: "Thu", time: "12:00pm", name: "Sculpt Yoga", place: "Studio Arc", tone: "amber" },
  { day: "Sat", time: "9:00am", name: "Hot Power Hour", place: "Powerflow Yoga", tone: "rose" },
];

export const dynamic = "force-dynamic";

export default async function MarketingPreviewPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  return (
    <main className={styles.page} data-mode={lookMode(admin.look)}>
      <div className={styles.previewBar}>
        <Link href="/settings"><Icon name="arrow_back" size={18} /> Settings</Link>
        <span>Private preview</span>
      </div>

      <header className={styles.header}>
        <Wordmark />
        <Link href="/?join=signup" className={styles.headerCta}>Get started</Link>
      </header>

      <section className={styles.hero}>
        <h1>Fit all of your fitness<br />into one calendar.</h1>
        <Link href="/?join=signup" className={styles.primary}>Get started</Link>
        <div className={styles.heroArt} aria-label="FittList calendar on a phone">
          <img src="/landing-hero.webp" alt="A FittList calendar showing classes from multiple coaches" />
          <span className={styles.photoBarOne} aria-hidden="true" />
          <span className={styles.photoBarTwo} aria-hidden="true" />
          <span className={styles.photoBarThree} aria-hidden="true" />
        </div>
      </section>

      <section className={styles.proof}>
        <p className={styles.kicker}>Your week, live</p>
        <h2>One link.<br />Every class.</h2>
        <div className={styles.calendarDemo} aria-label="Example FittList calendar">
          <div className={styles.demoHead}><strong>This week</strong><span>Jersey City</span></div>
          {sampleClasses.map((item, index) => (
            <article key={`${item.name}-${index}`}>
              <span className={styles.demoDay}>{item.day}</span>
              <span className={styles.demoMark} data-tone={item.tone} aria-hidden="true" />
              <span className={styles.demoClass}><strong>{item.name}</strong><small>{item.place}</small></span>
              <time>{item.time}</time>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.coachSection}>
        <div className={styles.sectionCopy}>
          <p className={styles.kicker}>For coaches</p>
          <h2>Four studios.<br />One calendar.</h2>
          <p>Teach everywhere. Share once.</p>
        </div>
        <div className={styles.weekCard}>
          <div className={styles.weekIdentity}>
            <span>E</span>
            <div><strong>Erin&apos;s week</strong><small>4 studios</small></div>
          </div>
          {multiStudioWeek.map((item) => (
            <div className={styles.weekRow} key={`${item.day}-${item.time}`}>
              <span className={styles.weekDay}>{item.day}</span>
              <span className={styles.placeMark} data-tone={item.tone} aria-hidden="true">{item.place.slice(0, 1)}</span>
              <span className={styles.weekClass}><strong>{item.name}</strong><small>{item.place}</small></span>
              <time>{item.time}</time>
            </div>
          ))}
          <span className={styles.cardAction}>Share your week <Icon name="reply" size={18} /></span>
        </div>
      </section>

      <section className={styles.studioSection}>
        <div className={styles.studioCard}>
          <div className={styles.studioIdentity}><span>I</span><strong>Ironbound Performance</strong></div>
          <div className={styles.studioStats}>
            <p><strong>38</strong><span>Classes</span></p>
            <p><strong>12</strong><span>Coaches</span></p>
            <p><strong>4</strong><span>Open</span></p>
          </div>
          <span className={styles.clearStatus}><Icon name="check_circle" size={20} /> No conflicts</span>
        </div>
        <div className={styles.sectionCopy}>
          <p className={styles.kicker}>For studios</p>
          <h2>Build it.<br />Staff it.<br />Share it.</h2>
          <p>One source of truth.</p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.brandBars} aria-hidden="true"><span /><span /><span /></div>
        <h2>Put your week<br />in motion.</h2>
        <Link href="/?join=signup" className={styles.primary}>Get started</Link>
      </section>

      <footer className={styles.footer}><Wordmark /><span>Fitness, organized.</span></footer>
    </main>
  );
}
