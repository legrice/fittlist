"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clockParts, fmtDayHeader, runsOn, timeToMinutes } from "@/lib/format";
import { weekAsText } from "@/lib/weektext";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import { avatarColor } from "@/lib/avatar";
import { pageBeneath } from "@/components/NavTrack";
import { Icon } from "@/components/Icon";
import { InvitesBanner } from "@/components/InvitesBanner";
import { ProfileSheet } from "@/components/ProfileSheet";
import { QrSheet } from "@/components/QrSheet";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// One week at a time: the button at the bottom asks for the next one.
const INITIAL_WEEKS = 1;
const MAX_WEEKS = 52;

export function ScheduleScreen({
  classes,
  hasAnyClass,
  todayIso,
  studios,
  templates,
  customTypes,
  lastUsed,
  subsCount,
  inboxUnread,
  notifUnread,
  adminNew = null,
  weekCount,
  profileViews,
  requestCount,
  autoOpenAdder,
  handle,
  name,
  title,
  photo,
  email,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  about,
  availability,
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  isAdmin,
  canSendFeedback,
  shiftCount,
  shiftsPublic,
  invitesLeft,
  showFanView,
  discoverable,
  approveFollowers,
  messagesOpen,
  userId,
  myColor,
  look,
}: {
  classes: ClassDto[];
  hasAnyClass: boolean;
  todayIso: string;
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
  inboxUnread: number;
  notifUnread: number;
  adminNew?: number | null;
  weekCount: number;
  profileViews: number;
  requestCount: number;
  autoOpenAdder: boolean;
  handle: string;
  name: string;
  title: string;
  photo: string | null;
  email: string;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  about: string;
  availability: string | null;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  isAdmin: boolean;
  canSendFeedback: boolean;
  /** On a gym's rota, so the calendar row names shifts. */
  shiftCount: number;
  shiftsPublic: boolean;
  invitesLeft: number;
  showFanView: boolean;
  discoverable: boolean;
  approveFollowers: boolean;
  messagesOpen: boolean;
  userId: string;
  myColor: string | null;
  look: string | null;
}) {
  const router = useRouter();
  const [adder, setAdder] = useState<{ open: boolean; prefill?: AdderPrefill }>({ open: false });
  const [profileOpen, setProfileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // "up" when opened from the header avatar, "left" when reached via a back tap.
  const [acctAnim, setAcctAnim] = useState<"up" | "left" | "none">("up");
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  // The coach's own colour marks the classes they teach.
  const myAccent = avatarColor({ id: userId, avatarColor: myColor });
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (autoOpenAdder) {
      setAdder({ open: true });
      window.history.replaceState(null, "", "/app");
    }
  }, [autoOpenAdder]);

  // ?edit=<classId> arrives from tapping a class on your own public page: the
  // one thing you'd do with your class from there is change it, and this is
  // where the editor lives.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const c = classes.find((x) => x.id === editId);
    if (c) edit(c, params.get("d") ?? undefined);
    window.history.replaceState(null, "", "/app");
    // Once, on arrival. `classes` and `edit` are fresh on mount, which is the
    // only render this can fire on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back from the profile preview reopens the account page. Clear any
  // leftover slide-direction flag now that we're back on the schedule.
  //
  // ?acct=1 only ever arrives from another screen's settings gear (the gear on
  // this screen opens the overlay locally, with no navigation). So it doubles
  // as the signal for what closing should do: whoever came here for settings
  // goes back where they were, rather than being left on the schedule they
  // never asked for.
  const settingsWasDoor = useRef(false);
  useEffect(() => {
    sessionStorage.removeItem("fl-nav");
    if (new URLSearchParams(window.location.search).get("acct")) {
      // Returning from the public preview: the public page already slid out to
      // the right, so the account view should just be here, not animate in.
      settingsWasDoor.current = true;
      setAcctAnim("none");
      setProfileOpen(true);
    }
  }, []);

  // The URL says settings is open the whole time it is. It used to be
  // rewritten to /app on arrival, which meant a refresh mid-settings reloaded
  // the bare schedule underneath: a page you never asked for, appearing at
  // what read as random.
  const openSettings = () => {
    window.history.replaceState(null, "", "/app?acct=1");
    setAcctAnim("up");
    setProfileOpen(true);
  };

  const closeSettings = () => {
    // A cold landing (an emailed link, the Google redirect) has nothing to go
    // back to, so it falls through to the schedule.
    const beneath = pageBeneath();
    if (settingsWasDoor.current && beneath && beneath !== "/app") {
      router.back();
      return;
    }
    window.history.replaceState(null, "", "/app");
    setProfileOpen(false);
  };

  // Returning from the Google OAuth flow -> confirm and open the profile.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("gcal");
    if (!g) return;
    const msg: Record<string, string> = {
      connected: "Google Calendar connected. Your classes are syncing",
      denied: "Google connection cancelled",
      noretoken: "Couldn't connect. Try again and allow calendar access",
      unconfigured: "Google Calendar isn't set up yet",
      error: "Something went wrong connecting Google",
    };
    toast(msg[g] ?? "");
    if (g === "connected") setProfileOpen(true);
    window.history.replaceState(null, "", "/app");
  }, [toast]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);

  // One bell for everything: unread notifications + unread messages.
  const updatesUnread = notifUnread + inboxUnread;

  const edit = (c: ClassDto, onIso?: string) => {
    // A weekly class is stored as one row per day; editing it should load every
    // day it recurs on (its template's weekly rows), not just the tapped day. A
    // one-off is a single dated row.
    // Grouped by series, not template: the template is keyed on the class name,
    // so the same class at two studios shares one. Grouping by it pulled the
    // other studio's days into this editor and saved them onto this class.
    const days = c.specificDate
      ? [c.dayOfWeek]
      : [
          ...new Set(
            classes
              .filter((x) => !x.specificDate && x.seriesId === c.seriesId)
              .map((x) => x.dayOfWeek),
          ),
        ];
    setAdder({
      open: true,
      prefill: {
        name: c.name,
        classType: c.classType,
        description: c.description,
        startTime: c.startTime,
        durationMin: c.durationMin,
        studioId: c.studioId,
        location: c.location,
        isPublic: c.isPublic,
        links: c.links.map((l) => ({ ...l })),
        days,
        dayOfWeek: c.dayOfWeek,
        endsOn: c.endsOn,
        occurrenceDate: onIso ?? null,
        specificDate: c.specificDate,
        classId: c.id,
      },
    });
  };

  // The calendar: every date from today forward that has classes - weekly
  // classes recur on their weekday, one-offs land on their date. "A week" is
  // seven POPULATED days, not seven calendar days, so a Mon/Wed/Fri schedule
  // still fills the screen before View more; the calendar horizon caps the
  // walk so an empty schedule doesn't scan a year.
  const days = useMemo(() => {
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: { iso: string; label: string; items: ClassDto[] }[] = [];
    for (let i = 0; i < MAX_WEEKS * 7 && out.length < weeks * 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const items = classes
        .filter((c) => runsOn(c, iso, dow))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (items.length) {
        out.push({ iso, label: fmtDayHeader(iso), items }); // "Monday — Jul 20"
      }
    }
    return out;
  }, [classes, todayIso, weeks]);

  // The next seven days as pasteable text. Public classes only: a private
  // client session is not for the group chat.
  const copyWeek = async () => {
    const week = days.slice(0, 7).map((d) => ({
      iso: d.iso,
      items: d.items
        .filter((c) => c.isPublic)
        .map((c) => ({
          name: c.name,
          startTime: c.startTime,
          where: c.studioId ? (studioById.get(c.studioId)?.name ?? null) : c.location,
        })),
    }));
    const text = weekAsText(week, `${name.trim() || "My"} week on fittlist`);
    if (!text.trim()) {
      toast("Nothing on the calendar to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n\nfittlist.co/${handle}`);
      toast("Week copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  return (
    <section className={`screen${showFanView ? " hasnav" : ""}`}>
      <div className="pad" style={{ paddingTop: 14, paddingBottom: showFanView ? 150 : 110 }}>
        <AppHeader
          unread={updatesUnread}
          weekCount={weekCount}
          adminNew={adminNew}
          home={showFanView ? "/home" : "/app"}
          // Only where the bottom bar is: without the member side there are no
          // tabs to show, on any width.
          nav={showFanView ? { active: "you", youHref: `/${handle}` } : undefined}
          // The face is the You tab now, so the corner holds settings. Two
          // taps on the same picture, one of which quietly meant "account",
          // was the confusing part.
          onSettings={openSettings}
        />

        {invitesLeft !== 0 && <InvitesBanner />}

        {/* The action pills that used to sit here moved onto the profile,
            behind the three-dot button beside the name. Losing them also lost
            the page's identity: this became a bare list that read as showing
            up at random, so it says what it is like every other screen does. */}
        <div className="admintop pagetop">
          <div>
            <h1>Your schedule</h1>
            <p className="adminsub">The classes you teach. Tap one to edit it</p>
          </div>
        </div>
        {!hasAnyClass ? (
          <div className="empty-block">
            <h2>Your week is empty</h2>
            <p>
              Add the classes you coach, every studio in one schedule. Your link starts working with
              the first one.
            </p>
            <button className="btn si" onClick={() => setAdder({ open: true })}>
              Add your first class
            </button>
          </div>
        ) : days.length === 0 ? (
          <p className="ps-none">Nothing coming up. Add a class to fill your calendar.</p>
        ) : (
          <>
            <div className="ps-week ps-agenda">
              {days.map((d) => (
                <div key={d.iso} id={`day-${d.iso}`} className="ps-daygroup">
                  <div className="ps-daycol">{d.label}</div>
                  <div className="ps-daycards">
                    {d.items.map((c) => {
                      const studio = c.studioId ? studioById.get(c.studioId) : undefined;
                      const where = studio ? studio.name : c.location;
                      const start = clockParts(c.startTime);
                      return (
                        <button
                          key={`${d.iso}-${c.id}`}
                          className={`ps-event${c.isPublic ? "" : " ps-event-private"}`}
                          data-cid={c.id}
                          onClick={() => edit(c, d.iso)}
                        >
                          <span
                            className="ps-accent"
                            style={c.isPublic ? { background: myAccent } : undefined}
                            aria-hidden="true"
                          />
                          <span className="ps-ebody">
                            <span className="ps-enm">
                              {c.name}
                              {!c.isPublic && <span className="ps-private">Private</span>}
                            </span>
                            {where && (
                              <span className="ps-estudio">
                                <Icon name="place" size={13} className="ps-estudio-ic" />
                                {where}
                              </span>
                            )}
                          </span>
                          <span className="ps-etimecol">
                            <span className="ps-etime">
                              {start.hm}
                              <span className="ps-ap">{start.ap}</span>
                            </span>
                            <span className="ps-edur">{c.durationMin} min</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* A week at a time, on request. The old behavior loaded four and
                kept loading on scroll, which made the schedule feel endless;
                asking is one tap and the list stays the size you asked for.
                Gone once the horizon runs dry: a short last page means there
                is nothing further to show. */}
            {weeks < MAX_WEEKS && days.length === weeks * 7 && (
              <button className="viewmore" onClick={() => setWeeks((w) => Math.min(w + 1, MAX_WEEKS))}>
                View more
              </button>
            )}
          </>
        )}
      </div>

      {hasAnyClass && !adder.open && (
        <button className="fab" onClick={() => setAdder({ open: true })}>
          <Icon name="add" size={20} />
          Add class
        </button>
      )}

      {showFanView && (
        <NavBar
          active="you"
          youHref={`/${handle}`}
          face={{
            photo,
            color: myAccent,
            initial: (name.trim().charAt(0) || "?").toUpperCase(),
          }}
        />
      )}

      {profileOpen && (
        <ProfileSheet
          handle={handle}
          anim={acctAnim}
          name={name}
          title={title}
          photo={photo}
          subsCount={subsCount}
          profileViews={profileViews}
          requestCount={requestCount}
          email={email}
          instagram={instagram}
          website={website}
          contactEmail={contactEmail}
          phone={phone}
          whatsapp={whatsapp}
          about={about}
          availability={availability}
          googleConfigured={googleConfigured}
          googleConnected={googleConnected}
          googleEmail={googleEmail}
          hasPassword={hasPassword}
          passkeyCount={passkeyCount}
          isAdmin={isAdmin}
          canSendFeedback={canSendFeedback}
          shiftCount={shiftCount}
          shiftsPublic={shiftsPublic}
          avatarColor={myAccent}
          showFanView={showFanView}
          discoverable={discoverable}
          approveFollowers={approveFollowers}
          messagesOpen={messagesOpen}
          look={look}
          onClose={closeSettings}
        />
      )}

      {adder.open && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={subsCount}
          prefill={adder.prefill}
          firstPublish={!hasAnyClass}
          onClose={() => setAdder({ open: false })}
          onToast={toast}
          onPublished={(msg) => {
            setAdder({ open: false });
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setAdder({ open: false });
            toast(msg);
            router.refresh();
          }}
        />
      )}

      <ShareWeekSheet
        handle={handle}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={toast}
      />
      <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />

      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}
