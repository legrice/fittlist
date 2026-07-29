"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clockParts, fmtDayHeader, runsOn, timeToMinutes } from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import { avatarColor } from "@/lib/avatar";
import { Icon } from "@/components/Icon";
import { InvitesBanner } from "@/components/InvitesBanner";
import { ProfileSheet } from "@/components/ProfileSheet";
import { QrSheet } from "@/components/QrSheet";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { Toast, useToast } from "@/components/Toast";

const INITIAL_WEEKS = 4;
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
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  isAdmin,
  canSendFeedback,
  invitesLeft,
  showFanView,
  discoverable,
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
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  isAdmin: boolean;
  canSendFeedback: boolean;
  invitesLeft: number;
  showFanView: boolean;
  discoverable: boolean;
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

  // Coming back from the profile preview reopens the account page. Clear any
  // leftover slide-direction flag now that we're back on the schedule.
  useEffect(() => {
    sessionStorage.removeItem("fl-nav");
    if (new URLSearchParams(window.location.search).get("acct")) {
      // Returning from the public preview: the public page already slid out to
      // the right, so the account view should just be here, not animate in.
      setAcctAnim("none");
      setProfileOpen(true);
      window.history.replaceState(null, "", "/app");
    }
  }, []);

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

  // The infinite calendar: every date from today forward that has classes -
  // weekly classes recur on their weekday, one-offs land on their date. The
  // window grows as the trainer scrolls (see the loader below).
  const days = useMemo(() => {
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: { iso: string; label: string; items: ClassDto[] }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
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

  // Load more weeks when the trainer nears the bottom (one load per render).
  const loadingRef = useRef(false);
  useEffect(() => {
    loadingRef.current = false;
  }, [weeks]);
  useEffect(() => {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const onScroll = () => {
      if (loadingRef.current) return;
      if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 800) {
        loadingRef.current = true;
        setWeeks((w) => Math.min(w + INITIAL_WEEKS, MAX_WEEKS));
      }
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    return () => stage.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className={`screen${showFanView ? " hasnav" : ""}`}>
      <div className="pad" style={{ paddingTop: 14, paddingBottom: showFanView ? 150 : 110 }}>
        <AppHeader
          unread={updatesUnread}
          home={showFanView ? "/feed" : "/app"}
          // Only where the bottom bar is: without the member side there are no
          // tabs to show, on any width.
          nav={showFanView ? { active: "schedule", onSchedule: () => setProfileOpen(false) } : undefined}
          avatar={{
            photo,
            color: myAccent,
            initial: (name.trim().charAt(0) || "?").toUpperCase(),
            onClick: () => {
              setAcctAnim("up");
              setProfileOpen(true);
            },
          }}
        />

        {invitesLeft > 0 && <InvitesBanner left={invitesLeft} />}

        {/* The three things a coach reaches for from their week — the title
            said nothing the tab bar doesn't already say, so the tools get the
            space instead. */}
        <div className="dashstrip">
          <div className="dashlinks">
            <button className="dashlink" onClick={() => router.push(`/${handle}`)}>
              <Icon name="account_circle" size={19} />
              <span>Your page</span>
            </button>
            <button className="dashlink" onClick={() => setShareOpen(true)}>
              <Icon name="calendar_today" size={19} />
              <span>Share cal</span>
            </button>
            <button className="dashlink" onClick={() => setQrOpen(true)}>
              <Icon name="qr_code_2" size={19} />
              <span>QR code</span>
            </button>
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
        <NavBar active="schedule" onSchedule={() => setProfileOpen(false)} />
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
          googleConfigured={googleConfigured}
          googleConnected={googleConnected}
          googleEmail={googleEmail}
          hasPassword={hasPassword}
          passkeyCount={passkeyCount}
          isAdmin={isAdmin}
          canSendFeedback={canSendFeedback}
          avatarColor={myAccent}
          showFanView={showFanView}
          discoverable={discoverable}
          look={look}
          onClose={() => setProfileOpen(false)}
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
