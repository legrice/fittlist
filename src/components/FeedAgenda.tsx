"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { SwipeGoing } from "@/components/SwipeGoing";
import { Toast, useToast } from "@/components/Toast";

export type FeedCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  color: string;
};

export type FeedItem = {
  classId: string;
  coachId: string;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
  going: boolean;
};

export type FeedDay = { iso: string; label: string; items: FeedItem[] };

// The fan feed: one chronological agenda across every followed coach, day by
// day starting today. The avatar strip on top filters to a single coach —
// tap to focus, tap again to clear.
export function FeedAgenda({ coaches, days }: { coaches: FeedCoach[]; days: FeedDay[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [goingOnly, setGoingOnly] = useState(false);
  // What the swipes changed, laid over what the server sent. Keeping the two
  // apart means a refresh can't wipe a mark the member just made.
  const [swiped, setSwiped] = useState<Record<string, boolean>>({});
  const [toastMsg, toastOn, toast] = useToast();
  const [, startTransition] = useTransition();
  // Keyed by class AND day: a weekly class is a different commitment each week.
  const going: Record<string, boolean> = Object.fromEntries(
    days.flatMap((d) =>
      d.items.map((i) => {
        const k = `${i.classId}|${d.iso}`;
        return [k, swiped[k] ?? i.going];
      }),
    ),
  );
  const selCoach = sel ? coaches.find((c) => c.id === sel) : undefined;

  // Swipe commits straight away and shows the result; if the server refuses,
  // the row goes back where it was and says why.
  const toggleGoing = (classId: string, iso: string, next: boolean) => {
    const k = `${classId}|${iso}`;
    setSwiped((s) => ({ ...s, [k]: next }));
    startTransition(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setSwiped((s) => ({ ...s, [k]: !next }));
        toast(res.error ?? "Something went wrong.");
      }
    });
  };

  const shown = days
    .map((d) => ({
      ...d,
      items: d.items.filter(
        (i) => (!sel || i.coachId === sel) && (!goingOnly || going[`${i.classId}|${d.iso}`]),
      ),
    }))
    .filter((d) => d.items.length > 0);

  const goingCount = Object.values(going).filter(Boolean).length;

  const avatar = (photo: string | null, name: string, cls: string, color: string) =>
    photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={cls} src={photo} alt="" />
    ) : (
      <span className={`${cls} ${cls}-empty`} style={{ background: color }} aria-hidden="true">
        {(name.trim().charAt(0) || "?").toUpperCase()}
      </span>
    );

  return (
    <>
      {/* No coach has anything coming up, so there is nothing to filter. */}
      {coaches.length > 0 && (
      <div className={`feedstrip${sel ? " hassel" : ""}`}>
        {/* "All" clears the filter — the way back to the merged week without
            having to remember which avatar is currently selected. */}
        <button
          type="button"
          className={`feedav${sel === null ? " on" : ""}`}
          aria-pressed={sel === null}
          onClick={() => setSel(null)}
        >
          <span className="feedav-img feedav-all" aria-hidden="true">
            <Icon name="groups" size={30} />
          </span>
          <span className="feedav-nm">All</span>
        </button>
        {coaches.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`feedav${sel === c.id ? " on" : ""}`}
            aria-pressed={sel === c.id}
            onClick={() => setSel(sel === c.id ? null : c.id)}
          >
            {avatar(c.photo, c.name, "feedav-img", c.color)}
            <span className="feedav-nm">{c.name.trim().split(/\s+/)[0]}</span>
          </button>
        ))}
      </div>
      )}

      {selCoach && (
        <div className="feedfilterbar">
          <span className="feedfilter-txt">Classes with {selCoach.name}</span>
          <Link href={`/${selCoach.handle}`} className="feedfilter-link">
            View page <Icon name="chevron_right" size={16} />
          </Link>
        </div>
      )}

      {/* One switch: the week, or just what you committed to. Sharing those
          classes lives in your account, not on top of the week. */}
      {goingCount > 0 && (
        <div className="goingbar">
          <button
            type="button"
            className={`goingtoggle${goingOnly ? " on" : ""}`}
            aria-pressed={goingOnly}
            onClick={() => setGoingOnly(!goingOnly)}
          >
            <span>Show going</span>
            <span className={`switch${goingOnly ? " on" : ""}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-block">
          <h2>Nothing coming up</h2>
          <p>
            {selCoach
              ? `${selCoach.name} hasn’t posted upcoming classes yet.`
              : "Your coaches haven’t posted upcoming classes yet — check back soon."}
          </p>
        </div>
      ) : (
        <div className="ps-week ps-agenda feedagenda">
          {shown.map((d) => (
            <div key={d.iso} className="ps-daygroup">
              <div className="ps-daycol">{d.label}</div>
              <div className="ps-daycards">
                {d.items.map((i) => {
                  const on = going[`${i.classId}|${d.iso}`];
                  return (
                    <SwipeGoing
                      key={`${d.iso}-${i.classId}`}
                      going={on}
                      onToggle={() => toggleGoing(i.classId, d.iso, !on)}
                    >
                      <Link
                        className={`ps-event${on ? " goingon" : ""}`}
                        href={`/${i.handle}/${i.classId}?d=${d.iso}&from=home`}
                      >
                        <span
                          className="ps-accent"
                          style={{ background: i.coachColor }}
                          aria-hidden="true"
                        />
                        {/* Who first, then what, then where — on a merged week
                            the coach is how you place the class. */}
                        <span className="ps-ebody">
                          <span className="ps-ecoach">
                            {avatar(i.coachPhoto, i.coachName, "ps-ecoachav", i.coachColor)}
                            <span className="ps-ecoach-txt">{i.coachName}</span>
                          </span>
                          <span className="ps-enm">
                            {i.name}
                            {on && <span className="ps-goingtag">Going</span>}
                          </span>
                          {i.where && <span className="ps-estudio ps-ewhere">{i.where}</span>}
                        </span>
                        <span className="ps-etimecol">
                          <span className="ps-etime">
                            {i.hm}
                            <span className="ps-ap">{i.ap}</span>
                          </span>
                          <span className="ps-edur">{i.durationMin} min</span>
                        </span>
                      </Link>
                    </SwipeGoing>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
