"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DAYS,
  type AppTheme,
  blocksFill,
  fmtTime,
  fmtDateLong,
  palForSeq,
  timeToMinutes,
} from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { Icon } from "@/components/Icon";
import { ProfileSheet } from "@/components/ProfileSheet";
import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

export function ScheduleScreen({
  classes,
  upcoming = [],
  hasAnyClass,
  studios,
  templates,
  lastUsed,
  subsCount,
  autoOpenAdder,
  theme,
  weekLabel,
  weekDateLabels,
  handle,
  visits,
  classCount,
}: {
  classes: ClassDto[];
  upcoming?: ClassDto[];
  hasAnyClass: boolean;
  studios: StudioDto[];
  templates: TemplateDto[];
  lastUsed: LastUsed;
  subsCount: number;
  autoOpenAdder: boolean;
  theme: AppTheme;
  weekLabel: string;
  weekDateLabels: string[];
  handle: string;
  visits: number;
  classCount: number;
}) {
  const router = useRouter();
  const [adder, setAdder] = useState<{ open: boolean; prefill?: AdderPrefill }>({ open: false });
  const [profileOpen, setProfileOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (autoOpenAdder) {
      setAdder({ open: true });
      window.history.replaceState(null, "", "/app");
    }
  }, [autoOpenAdder]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const byDay = useMemo(() => {
    const g: ClassDto[][] = DAYS.map(() => []);
    for (const c of classes) g[c.dayOfWeek]?.push(c);
    for (const list of g) list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return g;
  }, [classes]);

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

  // Blocks lays the week out as one flat, day-ordered stack of bands.
  const flat = useMemo(() => byDay.flat(), [byDay]);

  // Future-dated one-offs, grouped by their own date so a day with several
  // classes shares one gutter header.
  const upcomingGroups = useMemo(() => {
    const groups: { date: string; items: ClassDto[] }[] = [];
    for (const c of upcoming) {
      if (!c.specificDate) continue;
      const last = groups[groups.length - 1];
      if (last && last.date === c.specificDate) last.items.push(c);
      else groups.push({ date: c.specificDate, items: [c] });
    }
    return groups;
  }, [upcoming]);

  return (
    <section className="screen">
      <div className="appbar">
        <Wordmark />
        <div className="sub">My schedule</div>
      </div>
      <div className="pad" style={{ paddingTop: 14, paddingBottom: 110 }}>
        {theme === "poster" && (
          <>
            <div className="brandbar">
              <Wordmark variant="cloud" />
              <button
                className="usericon"
                aria-label="Your page"
                onClick={() => setProfileOpen(true)}
              >
                <Icon name="person" size={22} />
              </button>
            </div>
            <div className="calbar-title">My Calendar</div>
          </>
        )}
        {theme === "classic" && <h1 className="screen-title">This week</h1>}
        {classes.length === 0 && upcoming.length === 0 ? (
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
        ) : theme === "poster" ? (
          <>
            <div className="ps-week">
              {DAYS.map((day, di) =>
                byDay[di].length ? (
                  <div key={day} className="ps-daygroup">
                    <div className="ps-daycol">{weekDateLabels[di]}</div>
                    <div className="ps-daycards">
                      {byDay[di].map((c) => {
                        const studio = studioById.get(c.studioId);
                        return (
                          <button key={c.id} className="ps-event" onClick={() => edit(c)}>
                            <span className="ps-etime">{fmtTime(c.startTime)}</span>
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
                ) : null,
              )}
            </div>
            {upcomingGroups.length > 0 && (
              <>
                <div className="ps-h2 ps-upnext">Up Next</div>
                <div className="ps-week">
                  {upcomingGroups.map(({ date, items }) => (
                    <div key={date} className="ps-daygroup">
                      <div className="ps-daycol">{fmtDateLong(date)}</div>
                      <div className="ps-daycards">
                        {items.map((c) => {
                          const studio = studioById.get(c.studioId);
                          return (
                            <button key={c.id} className="ps-event" onClick={() => edit(c)}>
                              <span className="ps-etime">{fmtTime(c.startTime)}</span>
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
          </>
        ) : theme === "blocks" ? (
          <div className="blweek" style={{ marginLeft: -18, marginRight: -18 }}>
            <div className="bl-head">
              <div className="eb">Week of {weekLabel}</div>
              <h2>This week</h2>
            </div>
            {flat.map((c, idx) => {
              const studio = studioById.get(c.studioId);
              const bf = blocksFill(studio?.seq ?? 1);
              const showDay = idx === 0 || flat[idx - 1].dayOfWeek !== c.dayOfWeek;
              return (
                <button
                  key={c.id}
                  className="bl-band"
                  style={{ ["--bbg" as string]: bf.bg, ["--bfg" as string]: bf.fg }}
                  onClick={() => edit(c)}
                >
                  <span className="bl-day">{showDay ? DAYS[c.dayOfWeek] : ""}</span>
                  <span className="bl-body">
                    <span className="bl-nm">{c.name}</span>
                    <span className="bl-mt">
                      {fmtTime(c.startTime)} · {c.durationMin} min
                    </span>
                    {studio && <span className="bl-loc">{studio.name}</span>}
                  </span>
                  <span className="bl-edit" aria-hidden="true">
                    <Icon name="edit" size={15} />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="weekgrid">
            {DAYS.map((day, di) => (
              <div key={day} className={`daycol${byDay[di].length ? "" : " nix"}`}>
                <div className="daylabel">{day}</div>
                {byDay[di].map((c) => {
                  const studio = studioById.get(c.studioId);
                  const p = palForSeq(studio?.seq ?? 1);
                  const bf = blocksFill(studio?.seq ?? 1);
                  return (
                    <div
                      key={c.id}
                      className="class-card editable"
                      role="button"
                      tabIndex={0}
                      style={{ ["--bbg" as string]: bf.bg, ["--bfg" as string]: bf.fg }}
                      onClick={() => edit(c)}
                      onKeyDown={(e) => e.key === "Enter" && edit(c)}
                    >
                      <div className="rail" style={{ background: p.rail }} />
                      <div className="time">{fmtTime(c.startTime)}</div>
                      <div className="body">
                        <div className="name">{c.name}</div>
                        <div className="meta">
                          {c.durationMin} min
                          {c.links.length
                            ? ` · ${c.links.length} booking link${c.links.length > 1 ? "s" : ""}`
                            : ""}
                        </div>
                        {studio && (
                          <span className="loctag" style={{ background: p.bg, color: p.tx }}>
                            <span className="swd" style={{ background: p.rail }} />
                            {studio.name}
                          </span>
                        )}
                      </div>
                      <div className="editrow">
                        <button
                          className="iconbtn"
                          aria-label="Edit class"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            edit(c);
                          }}
                        >
                          <Icon name="edit" size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
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
          visits={visits}
          subsCount={subsCount}
          classCount={classCount}
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
