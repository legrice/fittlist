"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DAYS, fmtTime, palForSeq, timeToMinutes } from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

export function ScheduleScreen({
  classes,
  studios,
  templates,
  lastUsed,
  subsCount,
  autoOpenAdder,
}: {
  classes: ClassDto[];
  studios: StudioDto[];
  templates: TemplateDto[];
  lastUsed: LastUsed;
  subsCount: number;
  autoOpenAdder: boolean;
}) {
  const router = useRouter();
  const [adder, setAdder] = useState<{ open: boolean; prefill?: AdderPrefill }>({ open: false });
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
        classId: c.id,
      },
    });
  };

  return (
    <section className="screen">
      <div className="appbar">
        <Wordmark />
        <div className="sub">My schedule</div>
      </div>
      <div className="pad" style={{ paddingTop: 4, paddingBottom: 110 }}>
        <h1 className="screen-title">This week</h1>
        {classes.length === 0 ? (
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
        ) : (
          <div className="weekgrid">
            {DAYS.map((day, di) => (
              <div key={day} className={`daycol${byDay[di].length ? "" : " nix"}`}>
                <div className="daylabel">{day}</div>
                {byDay[di].map((c) => {
                  const studio = studioById.get(c.studioId);
                  const p = palForSeq(studio?.seq ?? 1);
                  return (
                    <div
                      key={c.id}
                      className="class-card editable"
                      role="button"
                      tabIndex={0}
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

      {classes.length > 0 && !adder.open && (
        <button className="fab" onClick={() => setAdder({ open: true })}>
          + Add class
        </button>
      )}

      {adder.open && (
        <Adder
          studios={studios}
          templates={templates}
          lastUsed={lastUsed}
          subsCount={subsCount}
          prefill={adder.prefill}
          firstPublish={classes.length === 0}
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
