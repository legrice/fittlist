"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DAYS, fmtDateLong, fmtTime, timeToMinutes } from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { DayTabs } from "@/components/DayTabs";
import { Icon } from "@/components/Icon";
import { ProfileSheet } from "@/components/ProfileSheet";
import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

const INITIAL_WEEKS = 4;
const MAX_WEEKS = 52;

export function ScheduleScreen({
  classes,
  hasAnyClass,
  todayIso,
  studios,
  templates,
  lastUsed,
  subsCount,
  autoOpenAdder,
  handle,
  name,
  title,
  photo,
  visits,
  classCount,
  googleConfigured,
  googleConnected,
  googleEmail,
}: {
  classes: ClassDto[];
  hasAnyClass: boolean;
  todayIso: string;
  studios: StudioDto[];
  templates: TemplateDto[];
  lastUsed: LastUsed;
  subsCount: number;
  autoOpenAdder: boolean;
  handle: string;
  name: string;
  title: string;
  photo: string | null;
  visits: number;
  classCount: number;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
}) {
  const router = useRouter();
  const [adder, setAdder] = useState<{ open: boolean; prefill?: AdderPrefill }>({ open: false });
  const [profileOpen, setProfileOpen] = useState(false);
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (autoOpenAdder) {
      setAdder({ open: true });
      window.history.replaceState(null, "", "/app");
    }
  }, [autoOpenAdder]);

  // Returning from the Google OAuth flow -> confirm and open the profile.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("gcal");
    if (!g) return;
    const msg: Record<string, string> = {
      connected: "Google Calendar connected — your classes are syncing",
      denied: "Google connection cancelled",
      noretoken: "Couldn't connect — try again and allow calendar access",
      unconfigured: "Google Calendar isn't set up yet",
      error: "Something went wrong connecting Google",
    };
    toast(msg[g] ?? "");
    if (g === "connected") setProfileOpen(true);
    window.history.replaceState(null, "", "/app");
  }, [toast]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);

  const edit = (c: ClassDto) => {
    setAdder({
      open: true,
      prefill: {
        name: c.name,
        startTime: c.startTime,
        durationMin: c.durationMin,
        studioId: c.studioId,
        links: c.links.map((l) => ({ ...l })),
        days: [c.dayOfWeek],
        specificDate: c.specificDate,
        classId: c.id,
      },
    });
  };

  // The infinite calendar: every date from today forward that has classes —
  // weekly classes recur on their weekday, one-offs land on their date. The
  // window grows as the trainer scrolls (see the loader below).
  const days = useMemo(() => {
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: { iso: string; label: string; tabLabel: string; items: ClassDto[] }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const items = classes
        .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (items.length) {
        const full = fmtDateLong(iso); // "Mon, July 20"
        const weekday = DAYS[dow];
        out.push({
          iso,
          label: full,
          tabLabel: `${weekday[0]}${weekday.slice(1).toLowerCase()} ${full.split(" ").pop()}`,
          items,
        });
      }
    }
    return out;
  }, [classes, todayIso, weeks]);

  const dayTabs = useMemo(
    () => days.map((d) => ({ id: `day-${d.iso}`, label: d.tabLabel })),
    [days],
  );

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
    <section className="screen">
      <div className="pad" style={{ paddingTop: 14, paddingBottom: 110 }}>
        <div className="brandbar">
          <Wordmark variant="ink" />
          <button className="usericon" aria-label="My page" onClick={() => setProfileOpen(true)}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="usericon-photo" src={photo} alt="" />
            ) : (
              <span className="usericon-initial" aria-hidden="true">
                {(name.trim().charAt(0) || "?").toUpperCase()}
              </span>
            )}
          </button>
        </div>
        <div className="calbar-title">Schedule</div>

        {!hasAnyClass ? (
          <div className="empty-block">
            <div className="glyph">MON–SUN</div>
            <h2>Your week is empty</h2>
            <p>
              Add the classes you coach — every studio, one schedule. Your link starts working with
              the first one.
            </p>
            <button className="btn si" onClick={() => setAdder({ open: true })}>
              Add your first class
            </button>
          </div>
        ) : days.length === 0 ? (
          <p className="ps-none">Nothing coming up — add a class to fill your calendar.</p>
        ) : (
          <>
            <DayTabs days={dayTabs} />
            <div className="ps-week">
              {days.map((d) => (
                <div key={d.iso} id={`day-${d.iso}`} className="ps-daygroup">
                  <div className="ps-daycol">{d.label}</div>
                  <div className="ps-daycards">
                    {d.items.map((c) => {
                      const studio = studioById.get(c.studioId);
                      return (
                        <button
                          key={`${d.iso}-${c.id}`}
                          className="ps-event"
                          data-cid={c.id}
                          onClick={() => edit(c)}
                        >
                          <span className="ps-etimecol">
                            <span className="ps-etime">{fmtTime(c.startTime)}</span>
                            <span className="ps-edur">{c.durationMin} min</span>
                          </span>
                          <span className="ps-ebody">
                            <span className="ps-enm">{c.name}</span>
                            {studio && <span className="ps-estudio">{studio.name}</span>}
                          </span>
                          <span className="ps-echev" aria-hidden="true">
                            <Icon name="chevron_right" size={20} />
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
        <button className="fab" aria-label="Add class" onClick={() => setAdder({ open: true })}>
          +
        </button>
      )}

      {profileOpen && (
        <ProfileSheet
          handle={handle}
          name={name}
          title={title}
          photo={photo}
          visits={visits}
          subsCount={subsCount}
          classCount={classCount}
          googleConfigured={googleConfigured}
          googleConnected={googleConnected}
          googleEmail={googleEmail}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {adder.open && (
        <Adder
          studios={studios}
          templates={templates}
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

      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}
