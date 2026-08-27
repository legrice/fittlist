import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import styles from "@/app/admin/marketing/marketing.module.css";

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

type ShareBrand = "instagram" | "whatsapp" | "tiktok" | "gmail" | "facebook" | "linkedin";

function ShareBrandMark({ brand }: { brand: ShareBrand }) {
  if (brand === "instagram") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs><radialGradient id="instagram-gradient" cx="30%" cy="100%" r="125%"><stop offset="0" stopColor="#ffd600"/><stop offset=".45" stopColor="#ff0169"/><stop offset="1" stopColor="#7638fa"/></radialGradient></defs>
        <rect width="48" height="48" rx="14" fill="url(#instagram-gradient)"/>
        <rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3.2"/>
        <circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" strokeWidth="3.2"/>
        <circle cx="32.5" cy="15.7" r="2" fill="#fff"/>
      </svg>
    );
  }
  if (brand === "whatsapp") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#25d366"/>
        <path d="M14.3 35.4l2.1-7.6a13.2 13.2 0 1 1 5.1 5l-7.2 2.6Z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M20.2 17.6c.4-1 1.1-1 1.7-.2l1.8 2.5c.4.6.3 1-.2 1.6l-1 1.1c1.3 2.7 3.3 4.6 6 5.8l1-1.1c.5-.6 1-.7 1.6-.3l2.5 1.8c.8.6.8 1.3-.1 1.8-1.2.7-2.5 1-3.7.8-5.8-1.2-11.5-6.7-12.4-12.3-.2-1.3.2-2.5.8-3.6Z" fill="#fff"/>
      </svg>
    );
  }
  if (brand === "tiktok") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#050505"/>
        <path d="M27.5 11v18.1a7.2 7.2 0 1 1-6.2-7.1v4.3a3.1 3.1 0 1 0 2.1 2.9V11h4.1c.6 3.4 2.7 5.4 6.4 6.1v4.2c-2.6-.3-4.7-1.3-6.4-2.8" fill="none" stroke="#25f4ee" strokeWidth="4" strokeLinejoin="round"/>
        <path d="M29.6 11v18.1a7.2 7.2 0 1 1-6.2-7.1v4.3a3.1 3.1 0 1 0 2.1 2.9V11h4.1c.6 3.4 2.7 5.4 6.4 6.1v4.2c-2.6-.3-4.7-1.3-6.4-2.8" fill="none" stroke="#fe2c55" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M28.5 11v18.1a7.2 7.2 0 1 1-6.2-7.1v4.3a3.1 3.1 0 1 0 2.1 2.9V11h4.1c.6 3.4 2.7 5.4 6.4 6.1v4.2c-2.6-.3-4.7-1.3-6.4-2.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (brand === "gmail") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#fff"/>
        <path d="M10 16.5v18h6V22.3l8 6.1 8-6.1v12.2h6v-18l-4-3-10 7.6L14 13.5l-4 3Z" fill="#ea4335"/>
        <path d="M10 16.5l6 4.6v13.4h-6Z" fill="#4285f4"/>
        <path d="M38 16.5l-6 4.6v13.4h6Z" fill="#34a853"/>
        <path d="M14 13.5l10 7.6 10-7.6 4 3-14 10.7-14-10.7Z" fill="#fbbc04"/>
      </svg>
    );
  }
  if (brand === "facebook") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="#1877f2"/>
        <path d="M27.4 40V25.4h5l.8-5.7h-5.8v-3.6c0-1.7.5-2.8 2.9-2.8h3.1V8.2c-.5-.1-2.4-.2-4.6-.2-4.5 0-7.6 2.8-7.6 7.8v3.9H16v5.7h5.2V40h6.2Z" fill="#fff"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="#0a66c2"/>
      <path d="M13.2 19.5h5.2V36h-5.2V19.5Zm2.6-8.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm5.8 8.2h5v2.3h.1c.7-1.3 2.4-2.8 5-2.8 5.3 0 6.3 3.5 6.3 8V36h-5.2v-8c0-1.9 0-4.4-2.7-4.4-2.7 0-3.1 2.1-3.1 4.3V36h-5.2V19.5Z" fill="#fff"/>
    </svg>
  );
}

export function MarketingLanding({
  privatePreview = false,
  mode,
}: {
  privatePreview?: boolean;
  mode?: string;
}) {
  return (
    <main className={styles.page} data-mode={mode}>
      {privatePreview ? (
        <div className={styles.previewBar}>
          <Link href="/settings"><Icon name="arrow_back" size={18} /> Settings</Link>
          <span>Private preview</span>
        </div>
      ) : null}

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
          <div className={styles.heroPhone} aria-hidden="true">
            <div className={styles.phoneStatus}><span>9:41</span><span>● ● ●</span></div>
            <div className={styles.phoneBrand}>
              <span className={styles.phoneBrandName}><span className={styles.phoneMark} /><strong>FittList</strong></span>
              <span className={styles.phoneTools}>
                <i><Icon name="search" size={16} /></i>
                <i><Icon name="add" size={16} /></i>
                <i><Icon name="notifications" size={16} /></i>
              </span>
            </div>
            <div className={styles.phoneIdentity}>
              <b>MC</b>
              <span><strong>Maya Cole</strong><small>Coach · 4 studios</small></span>
            </div>
            <div className={styles.phoneFilters}>
              <span data-selected="true">All Studios</span>
              <span>Northline Yoga</span>
              <span>Harbor Athletic Club</span>
              <span>Common Ground Studio</span>
              <span>Motive House</span>
            </div>
            <div className={styles.phoneSchedule}>
              <h3>Today</h3>
              <div><i data-tone="mint">N</i><span><strong>Evening Flow</strong><small>Northline Yoga</small></span><time>6:00pm</time></div>
              <div><i data-tone="blue">H</i><span><strong>Strength Circuit</strong><small>Harbor Athletic Club</small></span><time>7:00pm</time></div>
              <h3>Tomorrow</h3>
              <div><i data-tone="amber">C</i><span><strong>Mobility Lab</strong><small>Common Ground Studio</small></span><time>8:00am</time></div>
              <div><i data-tone="plum">M</i><span><strong>Power Hour</strong><small>Motive House</small></span><time>5:30pm</time></div>
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
        <div className={styles.shareShowcase}>
          <div className={styles.shareVisual} aria-label="Share a FittList calendar through Instagram, WhatsApp, TikTok, email, Facebook, and LinkedIn">
            <span className={styles.shareBrand} data-brand="gmail"><ShareBrandMark brand="gmail" /></span>
            <span className={styles.shareBrand} data-brand="whatsapp"><ShareBrandMark brand="whatsapp" /></span>
            <span className={styles.shareBrand} data-brand="facebook"><ShareBrandMark brand="facebook" /></span>
            <span className={styles.shareBrand} data-brand="instagram"><ShareBrandMark brand="instagram" /></span>
            <span className={styles.shareBrand} data-brand="tiktok"><ShareBrandMark brand="tiktok" /></span>
            <span className={styles.shareBrand} data-brand="linkedin"><ShareBrandMark brand="linkedin" /></span>
            <div className={styles.sharePreview}>
              <span className={styles.sharePreviewMark} aria-hidden="true" />
              <p>Maya&apos;s live week</p>
              <strong>4 studios.<br />One link.</strong>
              <small>Always up to date.</small>
              <span className={styles.shareReady}><Icon name="reply" size={19} /> Ready to share</span>
            </div>
          </div>
          <div className={styles.shareCopy}>
            <article><span>1</span><div><h3>Post your week</h3><p>Share a polished schedule to Stories and social.</p></div></article>
            <article><span>2</span><div><h3>Send the live link</h3><p>Text, email, or message one link that stays current.</p></div></article>
            <article><span>3</span><div><h3>Put it on your site</h3><p>Embed the same calendar wherever people find you.</p></div></article>
          </div>
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
        <h2>Ready when<br />you are.</h2>
        <Link href="/?join=signup" className={styles.primary}>Get started</Link>
      </section>

      <footer className={styles.footer}>
        <Wordmark />
        <div className={styles.footerMeta}>
          <span>© 2026 FittList. All rights reserved.</span>
          <Link href="/support">Support</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
