import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { lookMode } from "@/lib/darkmode";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import styles from "./marketing.module.css";

const sampleClasses = [
  { day: "Today", time: "6:00pm", name: "Soul Power Yoga", place: "Asana Soul Practice" },
  { day: "Tomorrow", time: "7:00am", name: "Guns, Buns, and Lungs", place: "Ironbound Performance Athletics" },
  { day: "Tomorrow", time: "6:00pm", name: "Strength & Mobility", place: "Studio Arc" },
];

export const dynamic = "force-dynamic";

export default async function MarketingPreviewPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  return (
    <main className={styles.page} data-mode={lookMode(admin.look)}>
      <div className={styles.previewBar}>
        <Link href="/settings"><Icon name="arrow_back" size={18} /> Settings</Link>
        <span>Private marketing preview</span>
      </div>

      <header className={styles.header}>
        <Wordmark />
        <nav aria-label="Marketing preview">
          <a href="#coaches">For coaches</a>
          <a href="#studios">For studios</a>
          <a href="#community">For communities</a>
        </nav>
        <Link href="/?join=signup" className={styles.headerCta}>Start your FittList</Link>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Your week in motion</p>
        <h1>One calendar for your whole fitness world.</h1>
        <p className={styles.heroCopy}>Publish a schedule, follow the people and places you train with, and keep every class close without digging through social posts.</p>
        <div className={styles.heroActions}>
          <Link href="/?join=signup" className={styles.primary}>Start your FittList</Link>
          <a href="#how" className={styles.secondary}>See how it works</a>
        </div>
        <div className={styles.calendarDemo} aria-label="Example FittList calendar">
          <div className={styles.demoHead}><span>This week</span><span>Jersey City</span></div>
          {sampleClasses.map((item, index) => (
            <article key={`${item.name}-${index}`}>
              <span className={styles.demoDay}>{item.day}</span>
              <span className={styles.demoDot} aria-hidden="true" />
              <span className={styles.demoClass}><strong>{item.name}</strong><small>{item.place}</small></span>
              <time>{item.time}</time>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className={styles.statement}>
        <p>Fitness schedules should be easier to find than a story highlight.</p>
        <h2>FittList turns the classes you teach, coach, and care about into one live calendar.</h2>
      </section>

      <section id="coaches" className={styles.feature}>
        <div className={styles.featureCopy}>
          <span>For coaches</span>
          <h2>Your schedule becomes your link in bio.</h2>
          <p>Change a class once and the live schedule updates everywhere you share it. Clients always know where and when to find you.</p>
        </div>
        <div className={styles.shareCard}>
          <div className={styles.shareMark}><Wordmark /></div>
          <h3>This week with Erin</h3>
          <p>3 places · 7 classes</p>
          <div><span>Mon</span><strong>Soul Flow Yoga</strong><time>7:00am</time></div>
          <div><span>Thu</span><strong>Yin Yoga</strong><time>6:00pm</time></div>
          <span className={styles.shareButton}>Share your week <Icon name="reply" size={18} /></span>
        </div>
      </section>

      <section id="studios" className={`${styles.feature} ${styles.reverse}`}>
        <div className={styles.featureCopy}>
          <span>For studios</span>
          <h2>Build the schedule. Staff it without the spreadsheet.</h2>
          <p>Set a standard week, assign coaches, catch conflicts, cover open shifts, and give your team one source of truth.</p>
        </div>
        <div className={styles.studioCard}>
          <div className={styles.studioTitle}><span className={styles.studioPhoto}>I</span><div><strong>Ironbound Performance</strong><small>Studio calendar</small></div></div>
          <div className={styles.stat}><strong>38</strong><span>classes this week</span></div>
          <div className={styles.stat}><strong>4</strong><span>open shifts</span></div>
          <div className={styles.task}><Icon name="check_circle" size={20} /><span>Schedule conflict protection</span></div>
        </div>
      </section>

      <section id="community" className={styles.community}>
        <p className={styles.eyebrow}>Made for the way fitness really spreads</p>
        <h2>Share the class. Keep the connection.</h2>
        <p>Instagram can help people find you. FittList gives them a place to keep the schedule, follow updates, and come back next week.</p>
        <Link href="/?join=signup" className={styles.primary}>Start your FittList</Link>
      </section>

      <footer className={styles.footer}><Wordmark /><span>Calendar infrastructure for fitness communities.</span></footer>
    </main>
  );
}
