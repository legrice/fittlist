import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { lookMode } from "@/lib/darkmode";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import styles from "./marketing.module.css";

const sampleClasses = [
  { day: "Today", time: "6:00pm", name: "Evening Flow", place: "Northline Yoga", tone: "mint" },
  { day: "Tomorrow", time: "7:00am", name: "Strength Circuit", place: "Harbor Athletic Club", tone: "blue" },
  { day: "Tomorrow", time: "6:00pm", name: "Mobility Lab", place: "Common Ground Studio", tone: "amber" },
];

const multiStudioWeek = [
  { day: "Mon", time: "7:00am", name: "Morning Flow", place: "Northline Yoga", tone: "mint" },
  { day: "Tue", time: "6:00pm", name: "Strength & Mobility", place: "Harbor Athletic Club", tone: "blue" },
  { day: "Thu", time: "12:00pm", name: "Sculpt", place: "Common Ground Studio", tone: "amber" },
  { day: "Sat", time: "9:00am", name: "Power Hour", place: "Atlas Movement", tone: "rose" },
];

const shareMethods = [
  { icon: "link", title: "Live link", copy: "One link that always stays current." },
  { icon: "image", title: "Story image", copy: "A polished weekly schedule ready to post." },
  { icon: "code", title: "Website embed", copy: "Put your live calendar on your own site." },
  { icon: "qr_code_2", title: "QR code", copy: "Bring people from a flyer straight to your week." },
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
        <div className={styles.headerActions}>
          <Link href="/?join=login" className={styles.signIn}>Sign in</Link>
          <Link href="/?join=signup" className={styles.headerCta}>Get started</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <h1>Fit all of your fitness<br />into one calendar.</h1>
        <Link href="/?join=signup" className={styles.primary}>Get started</Link>
        <div className={styles.heroArt} aria-label="FittList calendar on a phone">
          <span className={styles.heroLogo} aria-hidden="true" />
          <div className={styles.heroPhone} aria-hidden="true">
            <div className={styles.phoneStatus}><span>9:41</span><span>● ● ●</span></div>
            <div className={styles.phoneBrand}><span className={styles.phoneMark} /><strong>FittList</strong></div>
            <div className={styles.phoneRail}>
              <span className={styles.phoneAdd}><b>+</b><small>Add</small></span>
              <span><b>MC</b><small>Maya</small></span>
              <span><b>JL</b><small>Jordan</small></span>
              <span><b>SR</b><small>Sam</small></span>
            </div>
            <div className={styles.phoneSchedule}>
              <h3>Today</h3>
              <div><i data-tone="mint">M</i><span><strong>Evening Flow</strong><small>Northline Yoga · Maya Cole</small></span><time>6:00pm</time></div>
              <div><i data-tone="blue">J</i><span><strong>Strength Circuit</strong><small>Harbor Athletic Club · Jordan Lee</small></span><time>7:00pm</time></div>
              <h3>Tomorrow</h3>
              <div><i data-tone="amber">S</i><span><strong>Mobility Lab</strong><small>Common Ground Studio · Sam Rivera</small></span><time>8:00am</time></div>
            </div>
          </div>
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
            <span>M</span>
            <div><strong>Maya&apos;s week</strong><small>4 studios</small></div>
          </div>
          {multiStudioWeek.map((item) => (
            <div className={styles.weekRow} key={`${item.day}-${item.time}`}>
              <span className={styles.weekDay}>{item.day}</span>
              <span className={styles.placeMark} data-tone={item.tone} aria-hidden="true">{item.place.slice(0, 1)}</span>
              <span className={styles.weekClass}><strong>{item.name}</strong><small>{item.place}</small></span>
              <time>{item.time}</time>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.shareSection}>
        <div className={styles.shareHeading}>
          <p className={styles.kicker}>Share it your way</p>
          <h2>One calendar.<br />Everywhere.</h2>
          <p>Make it easy to find wherever your people already are.</p>
        </div>
        <div className={styles.shareGrid}>
          {shareMethods.map((method) => (
            <article key={method.title}>
              <span><Icon name={method.icon} size={24} /></span>
              <h3>{method.title}</h3>
              <p>{method.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.studioSection}>
        <div className={styles.studioCard}>
          <div className={styles.studioIdentity}><span>H</span><strong>Harbor Athletic Club</strong></div>
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
        <span className={styles.finalMark} aria-hidden="true" />
        <h2>Put your week<br />in motion.</h2>
        <Link href="/?join=signup" className={styles.primary}>Get started</Link>
      </section>

      <footer className={styles.footer}>
        <Wordmark />
        <div className={styles.footerMeta}>
          <span>© 2026 FittList. All rights reserved.</span>
          <a href="mailto:hello@fittlist.co">Contact</a>
        </div>
      </footer>
    </main>
  );
}
