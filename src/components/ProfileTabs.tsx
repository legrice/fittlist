"use client";

import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useBandTop, useStuck } from "@/components/CalendarBits";
import { ProfileShare } from "@/components/ProfileShare";
import { ProfileAbout } from "@/components/ProfileAbout";
import Link from "next/link";

// Contact is not among them: it's the pill in the header and a sheet, and
// /{handle}/contact redirects onto the schedule where that pill lives.
export type ProfileTab = "about" | "studios" | "schedule" | "following" | "shoutouts";

/** One tab: the key is the URL suffix, and the first in the list owns the
 *  bare base rather than a suffix of its own. */
export type TabDef = {
  key: string;
  label: string;
  /** A control rendered beside the tab, outside its link: a button inside a
   *  link is not a thing, so the info dot rides as a sibling. */
  info?: ReactNode;
};

// The profile header and one section under it. A coach, a member and a studio
// all wear this: the same circle of a face, the same name, the same two pills,
// the same tab row. What changes is what goes in the slots, which is the
// point: three near-identical headers is how they drift.
//
// The face is a circle again, not a full-bleed photograph. The hero shipped
// and it was handsome, and it was also the wrong app: a screen of photograph
// before any schedule said editorial when the product says calendar. The big
// picture still exists, one tap away, behind the avatar.
//
// The tabs are links, not scroll anchors. Every section has its own URL, so a
// coach can send someone straight to fittlist.co/{handle}/schedule and they
// land on the schedule rather than at the top of a long page with an implied
// instruction to scroll.
export function ProfileTabs({
  base,
  tab,
  tabs,
  name,
  handle,
  title,
  location,
  trackSchedule = false,
  trackHandle,
  avatar,
  heroPhoto,
  heroColor,
  heroCta,
  actions,
  endorsement,
  summary,
  sharePrompt,
  shareLabel = "Share their profile",
  badges,
  ownerTop,
  backTo,
  stickAction,
  sectionToggle = false,
  closingContent,
  infoSheet = false,
  children,
}: {
  /** The page's own URL: "/matt" for a person, "/s/ironbound" for a studio.
   *  Every tab but the first hangs its key off this. */
  base: string;
  /** Which tab's key is showing. */
  tab: string;
  /** In order. Empty means no tab row at all, which is right for a page with
   *  only one section: two tabs over two short lists is worse than neither. */
  tabs: TabDef[];
  name: string;
  /** Public identity shown beneath the display name. */
  handle?: string;
  title: string;
  location: string;
  /** Count one "schedule open" per visit, for a coach's own stats. */
  trackSchedule?: boolean;
  trackHandle?: string;
  /** The face: a person's AvatarZoom (tap it, see it big, with the share
   *  actions under it), a studio's plain circle. */
  avatar: ReactNode;
  /** The photo as a full-bleed hero instead of the circle: it runs up under
   *  the header, everything on it goes white, and a scrim at each end keeps
   *  the words legible. An experiment, by Matt's ask; null keeps the circle. */
  heroPhoto?: string | null;
  /** No photo yet: the hero runs anyway, filled with the person's own
   *  derived colour, so a page without a picture is the same page rather
   *  than a lesser layout. */
  heroColor?: string | null;
  /** A small control on the colour hero: the owner's way to add the photo
   *  the space is waiting for. */
  heroCta?: ReactNode;
  /** The row of pills under the name. A visitor gets Contact and Follow; the
   *  owner gets Share and Edit profile in the same two slots. */
  actions: ReactNode;
  /** A positive bit of social proof between the action rail and sections. */
  endorsement?: ReactNode;
  /** About copy shown once beneath the action pills. */
  summary?: string | null;
  /** Closing growth loop, worded for a person or a studio by its caller. */
  sharePrompt?: string;
  shareLabel?: string;
  /** Beside the name: only a studio uses it now, for the Verified badge that
   *  explains why the pencil is missing. */
  badges: ReactNode | null;
  /** Top right of the header: a studio's dots. A person's settings live in
   *  the shared app header, so their profile corner stays empty. */
  ownerTop?: ReactNode;
  /** Where a back control should go, when they got here from a list. */
  backTo?: { href: string; label: string } | null;
  /** A compact copy of the Follow control, across from the small name in the
   *  stuck bar, so scrolling never carries someone away from the yes. */
  stickAction?: ReactNode;
  /** People use two true views rather than anchors in one long document:
   *  Schedule is the bare profile URL and Info is /about. */
  sectionToggle?: boolean;
  /** Social proof that closes a person's profile after its useful content
   *  and share prompt. */
  closingContent?: ReactNode;
  /** Move the existing profile-about section into an About sheet instead of
   *  making profile information compete with functional section navigation. */
  infoSheet?: boolean;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(tab);
  const [infoOpen,setInfoOpen]=useState(false);
  const tracked = useRef(false);
  const stickRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // The tab row pins at the top once the card slides up, the calendar's own
  // pattern: it publishes its measured height as --dayband-top, and the day
  // bands in the schedule pin right under it. One writer, one reader chain,
  // same as everywhere bands pin under chrome.
  useBandTop(stickRef);
  // Pinned at the very top, the row squares its corners: kept round, the
  // rows scroll up visibly behind the corner notches.
  useStuck(stickRef);

  // The head is chrome, pinned like the header above it: face, name, meta and
  // the two pills all stay put, and the card slides up over the lot. Its
  // sticky top is the header's measured height, zero for a stranger whose
  // page has no app header; measured, because the safe area moves it.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    // The app header signed in, the public bar for a stranger: whichever is
    // above the head is what it pins under (and what the hero photo reaches
    // up beneath). Its bottom edge is the head's natural top, because both
    // bars pin at the very top themselves.
    const bar = document.querySelector<HTMLElement>(".brandbar, .pubtop");
    const set = () =>
      el.style.setProperty("--head-top", `${bar ? Math.round(bar.getBoundingClientRect().bottom) : 0}px`);
    set();
    if (!bar) return;
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Count one "schedule open" per visit. It used to fire when the scroll-spy
  // reached the schedule section; landing on the URL is the event now.
  useEffect(() => {
    if (activeSection !== "schedule" || !trackSchedule || !trackHandle || tracked.current) return;
    tracked.current = true;
    const url = `/api/track/schedule/${trackHandle}`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [activeSection, trackSchedule, trackHandle]);

  useEffect(() => {
    if (sectionToggle) {
      setActiveSection(tab);
      return;
    }
    const sections = tabs
      .map((t) => document.getElementById(`profile-${t.key}`))
      .filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id.replace("profile-", ""));
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionToggle, tab, tabs]);

  // Profile sections are already part of the page. Keep the identity/header
  // mounted and swap only the panel, while still giving every section its
  // own shareable URL. Native history also makes the browser Back button walk
  // through tab choices without asking the server to rebuild the profile.
  useEffect(() => {
    if (!sectionToggle) return;
    const readPath = () => {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      const cleanBase = base.replace(/\/$/, "") || "/";
      const next = path === cleanBase ? tabs[0]?.key : tabs.find((item) => path === `${cleanBase}/${item.key}`)?.key;
      if (next) setActiveSection(next);
    };
    window.addEventListener("popstate", readPath);
    return () => window.removeEventListener("popstate", readPath);
  }, [base, sectionToggle, tabs]);

  // The first tab is the bare URL: it's what the link is for, and an About page
  // somebody hasn't filled in is an awkward first thing to land on. The old
  // suffix still resolves, because people have already sent that link.
  // A tab with an info dot wraps the pair, so the pill's wash draws around
  // both and the dot reads as part of the tab rather than a fourth one. The
  // dot stays a sibling of the link inside it: a button in a link is not a
  // thing.
  const tabLink = (t: TabDef, i: number) => {
    const href = sectionToggle
      ? (i === 0 ? base : `${base}/${t.key}`)
      : `#profile-${t.key}`;
    const link = (
      <Link
        href={href}
        aria-current={activeSection === t.key ? "location" : undefined}
        className={`pubtab${activeSection === t.key ? " sel" : ""}`}
        onClick={(event) => {
          if (sectionToggle) {
            event.preventDefault();
            if (activeSection !== t.key) window.history.pushState(null, "", href);
          }
          setActiveSection(t.key);
        }}
      >
        {t.label}
      </Link>
    );
    // The info dot only rides its tab while that tab is the one you are
    // on, by Matt's call: pinned to an unselected pill it read as a stray
    // control that fell out of the row.
    if (!t.info || activeSection !== t.key) return <Fragment key={t.key}>{link}</Fragment>;
    return (
      <span key={t.key} className={`pubtab-pair${activeSection === t.key ? " sel" : ""}`}>
        {link}
        {t.info}
      </span>
    );
  };

  return (
    <>
      {/* Who this is, top to bottom and centred: face, name, what and where,
          then the two things you can do about it. A profile is the one screen
          about a person rather than a list, so it gets the symmetry. */}
      <div className={`pubhead${heroPhoto || heroColor ? " pubhead-hero" : ""}`} ref={headRef}>
        {(heroPhoto || heroColor) && (
          <div className="pubhero-media">
        {heroPhoto ? (
          <>
            {/* The photo, from the very top of the screen: it reaches up by
                the pinned header's measured height (--head-top is already on
                this element), so the header floats on it in white. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pubhero-bg" src={heroPhoto} alt="" />
            <span className="pubhero-dim" aria-hidden="true" />
          </>
        ) : heroColor ? (
          <>
            {/* The same full-bleed block in the person's own colour, with
                the same bottom scrim so the name reads the same way. */}
            <span className="pubhero-bg pubhero-color" style={{ background: heroColor }} aria-hidden="true" />
            <span className="pubhero-dim" aria-hidden="true" />
          </>
        ) : null}
          {/* Navigation stays on the photograph; identity starts on paper. */}
        {backTo ? (
          <div className="profback">
            <BackLink
              className="evback"
              href={backTo.href}
              label={backTo.label}
              anywhere
              notUnder={base}
            >
              <Icon name="arrow_back" size={23} />
            </BackLink>
          </div>
        ) : null}
        {(infoSheet||ownerTop)&&<div className="ownertop profile-top-actions">{infoSheet&&<button type="button" className="actpill profile-about-trigger" onClick={()=>setInfoOpen(true)}><Icon name="info" size={19}/>About</button>}{ownerTop}</div>}
          </div>
        )}
        <div className="pubidentity pubidentity-paper">
            {!heroPhoto && !heroColor && <div className="profile-identity-lead">{avatar}</div>}
            {!heroPhoto && !heroColor && (
              <>
            {backTo ? <div className="profback"><BackLink className="evback" href={backTo.href} label={backTo.label} anywhere notUnder={base}><Icon name="arrow_back" size={23} /></BackLink></div> : null}
            {(infoSheet||ownerTop)&&<div className="ownertop profile-top-actions">{infoSheet&&<button type="button" className="actpill profile-about-trigger" onClick={()=>setInfoOpen(true)}><Icon name="info" size={19}/>About</button>}{ownerTop}</div>}
              </>
            )}
            {(title.trim() || location.trim()) && (
              <div className="profile-eyebrow">
                <span>{title.trim()}</span>
                <span>{location.trim()}</span>
              </div>
            )}
            {badges && <div className="profbadges-top">{badges}</div>}
            <div className="profname-row"><h1 className="profname">{name}</h1></div>
            {handle ? <p className="profhandle">@{handle}</p> : null}
        </div>
        <div className="pubbelow">
        {actions}
        {summary?.trim() ? <ProfileAbout text={summary.trim()} className="profile-summary" /> : null}
        {endorsement}
        </div>
      </div>
      {/* The card. The head above sits on the shell gray; the tabs row is
          the first thing on the paper, and the panel rides it to the bottom
          of the page. */}
      <div className="pubcard">
      <div ref={stickRef} className={`pubstick${tabs.length ? "" : " pubstick-bare"}`}>
        <div className="pubstick-row">
          {/* A duplicate for the eyes only; the real name is the h1 above. */}
          <div className="pubstick-name" aria-hidden="true">
            {name}
          </div>
          {stickAction}
        </div>
        {tabs.length > 0 && (
          <div className="pubtabs" aria-label="Profile sections">
            {tabs.map(tabLink)}
          </div>
        )}
      </div>
      <div className={`pubpanel${sectionToggle ? " pubpanel-toggle" : ""}${infoSheet?" has-info-sheet":""}${infoOpen?" info-open":""}`} data-active={sectionToggle ? activeSection : undefined}>{children}</div>
      {infoOpen&&<><div className="profile-info-scrim" onClick={()=>setInfoOpen(false)}/><button type="button" className="profile-info-close" aria-label="Close About" onClick={()=>setInfoOpen(false)}><Icon name="close" size={20}/></button></>}
      {sharePrompt && (
        <section className="profile-share-cta">
          <h2>{sharePrompt}</h2>
          <ProfileShare path={base} name={name} cta ctaText={shareLabel} />
        </section>
      )}
      {closingContent && <div className="profile-closing-content">{closingContent}</div>}
      </div>
    </>
  );
}
