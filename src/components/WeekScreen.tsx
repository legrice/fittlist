"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import type { WeekDay } from "@/lib/week";
import { Icon } from "@/components/Icon";
import { NavBar } from "@/components/NavBar";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// The classes you added, and nothing else.
//
// Deliberately not a calendar: no month grid, no empty days, no time gutter.
// It's a shortlist that empties itself as the week passes, and every row can
// leave. That, and the fact that it only ever holds what you picked, is what
// stops it reading as "fittlist wants to be your calendar now".
export function WeekScreen({
  days,
  header,
  coach = true,
  face,
  youHref,
}: {
  days: WeekDay[];
  /** The app header, built on the server and handed down. */
  header?: React.ReactNode;
  /** false drops the Schedule tab: a member has nothing behind it. */
  coach?: boolean;
  /** Your own face, for the You tab. */
  face?: { photo: string | null; color: string; initial: string };
  /** Where You goes: a coach's public page. Without it the tab fell back to
   *  /app, which surfaced the bare schedule from this one screen. */
  youHref?: string;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [share, setShare] = useState(false);
  // Removing is one tap next to a list of things you meant to do, so it asks.
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; key: string; name: string } | null>(null);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const remove = (classId: string, iso: string, key: string) => {
    setConfirm(null);
    setGone((g) => ({ ...g, [key]: true }));
    start(async () => {
      const res = await setGoing(classId, iso, false);
      if (!res.ok) {
        setGone((g) => ({ ...g, [key]: false }));
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      toast("Removed from your week");
      router.refresh();
    });
  };

  const shown = days
    .map((d) => ({ ...d, items: d.items.filter((i) => !gone[`${i.classId}|${i.iso}`]) }))
    .filter((d) => d.items.length > 0);
  const left = shown.reduce((n, d) => n + d.items.length, 0);

  return (
    <section className="screen hasnav">
      <div className="pad" style={{ paddingTop: 14, paddingBottom: 186 }}>
        {header}
        <div className="admintop pagetop">
          <div>
            <h1>Your week</h1>
            <p className="adminsub">
              {left === 0
                ? "Classes you add land here"
                : `${left} class${left === 1 ? "" : "es"} coming up`}
            </p>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="empty-block">
            <h2>Nothing added yet</h2>
            <p>
              Swipe any class on Following, or open one and tap Add to your week. What you pick
              lands here, and drops off once it&rsquo;s been and gone.
            </p>
            <Link className="btn si" href="/feed">
              Find something to add
            </Link>
          </div>
        ) : (
          <>
            <div className="weeklist">
              {shown.map((d) => (
                <div key={d.iso} className="weekday">
                  <div className="ps-daycol">{d.label}</div>
                  {d.items.map((i) => {
                    const key = `${i.classId}|${i.iso}`;
                    return (
                      <div key={key} className="weekrow">
                        <span
                          className="ps-accent weekrow-accent"
                          style={{ background: i.coachColor }}
                          aria-hidden="true"
                        />
                        <Link className="weekrow-main" href={`/${i.handle}/${i.classId}?d=${i.iso}&from=week`}>
                          <span className="weekrow-nm">{i.name}</span>
                          <span className="weekrow-sub">
                            {i.hm}
                            <span className="ps-ap">{i.ap}</span> · {i.durationMin} min
                            {i.where ? ` · ${i.where}` : ""}
                          </span>
                          <span className="weekrow-who">with {i.coachName}</span>
                        </Link>
                        {/* Every row can leave. A calendar's entries don't; a
                            list's do, and that difference is most of what keeps
                            this from reading as one. */}
                        <button
                          className="weekrow-x"
                          aria-label={`Remove ${i.name}`}
                          onClick={() =>
                            setConfirm({ classId: i.classId, iso: i.iso, key, name: i.name })
                          }
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {/* A coach shares their week as a story image; this is the same move from
          the other side. Pinned rather than parked at the end of the list: a
          week with enough classes in it pushed the button off the bottom, and
          that's the week you'd most want to share. */}
      {shown.length > 0 && (
        <div className="weekcal">
          <button className="setrow" onClick={() => setShare(true)}>
            <span className="setrow-ic"><Icon name="share" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Share my week</span>
              <span className="s">A story image of what you&rsquo;re training this week</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
        </div>
      )}
      {confirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Take it out of your week?</h2>
            <p className="lead">
              {confirm.name} comes off your list. You can add it back from the coach&rsquo;s
              schedule any time.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => remove(confirm.classId, confirm.iso, confirm.key)}
              >
                Remove it
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirm(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
      {share && <ShareMyWeekSheet onClose={() => setShare(false)} />}
      <NavBar coach={coach} face={face} youHref={youHref} />
      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}
