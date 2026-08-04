"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setGoing, setGoingVisibility } from "@/app/actions/going";
import { Agenda, AgendaAvatar, ClassRow } from "@/components/Agenda";
import { useBandTop } from "@/components/CalendarBits";
import { Icon } from "@/components/Icon";
import { RailArrows } from "@/components/RailArrows";
import { ClassSheet } from "@/components/ClassSheet";
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
export function FeedAgenda({
  coaches,
  days,
  meId,
  todayIso,
}: {
  coaches: FeedCoach[];
  days: FeedDay[];
  /** The viewer, when they're a coach — their own classes are in here too. */
  meId?: string;
  /** The app's today, for the two bands that say it in words. The server's,
   *  not the browser's: the app's day is Eastern and the device's may not be. */
  todayIso: string;
}) {
  const router = useRouter();
  // The day bands pin here too. There is no calendar chrome on this screen,
  // and the coach rail scrolls away with the list, so the only thing above
  // them is the app header: no element to pass, just its height.
  useBandTop();
  // A set, not one id: people train with more than one coach and want to see
  // two of them side by side without flipping back and forth. Empty is All.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const railRef = useRef<HTMLDivElement>(null);
  // What the swipes changed, laid over what the server sent. Keeping the two
  // apart means a refresh can't wipe a mark the member just made.
  const [swiped, setSwiped] = useState<Record<string, boolean>>({});
  const [toastMsg, toastOn, toast] = useToast();
  // Tapping a row opens the class from the bottom, so the week stays behind it.
  const [open, setOpen] = useState<{ handle: string; classId: string; iso: string } | null>(null);
  // The note that answers the ribbon: which class went to the plans, and the
  // way there. The ribbon filling says it happened; this says where it went,
  // which is the thing a first tap can't know. It carries the mark's keys
  // too, because the note is also where the visibility choice lives: a mark
  // shows to your followers by default, and the moment it's made is the
  // moment to say so and offer the way off.
  const [justAdded, setJustAdded] = useState<{ name: string; classId: string; iso: string } | null>(
    null,
  );
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addTimer.current) clearTimeout(addTimer.current); }, []);
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
  const picked = coaches.filter((c) => sel.has(c.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // "Sam", "Sam and Mia", "Sam, Mia and Ana", then a count: a list of five
  // names is not a label any more.
  const names = (() => {
    const n = picked.map((c) => c.name.trim().split(/\s+/)[0]);
    if (n.length <= 1) return n[0] ?? "";
    if (n.length === 2) return `${n[0]} and ${n[1]}`;
    if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]}`;
    return `${n[0]}, ${n[1]} and ${n.length - 2} others`;
  })();

  // Swipe commits straight away and shows the result; if the server refuses,
  // the row goes back where it was and says why.
  const toggleGoing = (classId: string, iso: string, next: boolean, name?: string) => {
    const k = `${classId}|${iso}`;
    setSwiped((s) => ({ ...s, [k]: next }));
    if (next && name) {
      setJustAdded({ name, classId, iso });
      if (addTimer.current) clearTimeout(addTimer.current);
      addTimer.current = setTimeout(() => setJustAdded(null), 6500);
    } else if (!next) {
      setJustAdded(null);
    }
    startTransition(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setSwiped((s) => ({ ...s, [k]: !next }));
        setJustAdded(null);
        toast(res.error ?? "Something went wrong.");
      }
    });
  };

  const shown = days
    .map((d) => ({ ...d, items: d.items.filter((i) => sel.size === 0 || sel.has(i.coachId)) }))
    .filter((d) => d.items.length > 0);

  return (
    <>
      {/* No coach has anything coming up, so there is nothing to filter. */}
      {/* No label row above the faces: it read as clutter on the home screen.
          The rail still orders itself (soonest teacher first); the Discover
          tab is one tap down. */}
      {coaches.length > 0 && (
      <div className="feedrail">
      <div className={`feedstrip${sel.size ? " hassel" : ""}`} ref={railRef}>
        {/* "All" clears the filter — the way back to the merged week without
            having to remember which avatar is currently selected. */}
        <button
          type="button"
          className={`feedav${sel.size === 0 ? " on" : ""}`}
          aria-pressed={sel.size === 0}
          style={{ "--avring": "var(--ink)" } as CSSProperties}
          onClick={() => setSel(new Set())}
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
            className={`feedav${sel.has(c.id) ? " on" : ""}`}
            aria-pressed={sel.has(c.id)}
            // The ring is the coach's own accent, the same colour their rows
            // wear down the left: picking a face lights everything theirs.
            style={{ "--avring": c.color } as CSSProperties}
            onClick={() => toggle(c.id)}
          >
            <AgendaAvatar photo={c.photo} name={c.name} cls="feedav-img" color={c.color} />
            <span className="feedav-nm">{c.name.trim().split(/\s+/)[0]}</span>
          </button>
        ))}
        {/* The end of the rail is where you notice the list is short, so the
            way to lengthen it lives there. A link rather than a filter: it
            wears the faces' shape so it reads as part of the row, and the
            dashed ring says it is a slot to fill rather than somebody who is
            already in it. */}
        <Link className="feedav feedav-add" href="/discover">
          <span className="feedav-img feedav-all feedav-plus" aria-hidden="true">
            <Icon name="add" size={30} />
          </span>
          <span className="feedav-nm">Find</span>
        </Link>
      </div>
      <RailArrows railRef={railRef} />
      </div>
      )}

      {picked.length > 0 && (
        <div className="feedfilterbar">
          <span className="feedfilter-txt">Classes with {names}</span>
          {/* One coach has a profile to go to; several don't, so the link
              makes way for the way back out. */}
          {picked.length === 1 ? (
            <Link href={`/${picked[0].handle}?from=following`} className="feedfilter-link">
              View profile <Icon name="chevron_right" size={16} />
            </Link>
          ) : (
            <button className="feedfilter-link" onClick={() => setSel(new Set())}>
              Clear
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-block">
          <h2>Nothing coming up</h2>
          <p>
            {picked.length
              ? `${names} ${picked.length === 1 ? "hasn’t" : "haven’t"} posted upcoming classes yet.`
              : "Your coaches haven’t posted upcoming classes yet. Check back soon."}
          </p>
        </div>
      ) : (
        // The row is the shared one; what wraps it here is the swipe. No pin on
        // the studio line: a merged row already carries the coach's face above
        // the class name, and a second glyph under it is one mark too many.
        // Flat rows, not cards: the accent bar down the left is the coach's
        // own colour, the same one their avatar's ring wears when picked, and
        // a wall of white cards hid it.
        <Agenda
          className="feedagenda"
          today={todayIso}
          days={shown.map((d) => ({
            iso: d.iso,
            label: d.label,
            items: d.items.map((i) => ({
              key: i.classId,
              name: i.name,
              hm: i.hm,
              ap: i.ap,
              durationMin: i.durationMin,
              where: i.where,
              coachName: i.coachName,
              coachPhoto: i.coachPhoto,
              coachColor: i.coachColor,
              you: i.coachId === meId,
              // No Added tag: the filled ribbon in the corner already says it,
              // and a word beside the time was the state said twice.
              tag: null,
              on: going[`${i.classId}|${d.iso}`],
              classId: i.classId,
              base: i.handle,
            })),
          }))}
          row={(item, d) => (
            <>
              <SwipeGoing
                going={!!item.on}
                onToggle={() => toggleGoing(item.classId!, d.iso, !item.on, item.name)}
              >
                <ClassRow
                  item={item}
                  onClick={() =>
                    setOpen({ handle: item.base!, classId: item.classId!, iso: d.iso })
                  }
                />
              </SwipeGoing>
              {/* What you do with a class, on the card itself: the same
                  ribbon the sheet's pill carries, so the swipe stops being
                  the only way in. A sibling of the card, not a child,
                  because a button inside a button is not a thing. The share
                  circle came off every row; sharing lives on the class
                  sheet, where one class has the whole screen. */}
              <button
                className={`evcard-add${item.on ? " on" : ""}`}
                aria-label={item.on ? "Added to your plans" : "Add to your plans"}
                aria-pressed={!!item.on}
                onClick={() => toggleGoing(item.classId!, d.iso, !item.on, item.name)}
              >
                <Icon name={item.on ? "bookmark_added" : "bookmark"} size={20} />
                <span className="evcard-add-t">{item.on ? "Added" : "Add"}</span>
              </button>
            </>
          )}
        />
      )}

      {open && (
        <ClassSheet
          handle={open.handle}
          classId={open.classId}
          iso={open.iso}
          onClose={() => setOpen(null)}
          // The row behind reflects the change without a round trip; the
          // header count needs the server, so refresh for that.
          onChanged={(nowOn) => {
            setSwiped((sw) => ({ ...sw, [`${open.classId}|${open.iso}`]: nowOn }));
            router.refresh();
          }}
        />
      )}
      {/* Same note the class sheet shows for the same tap, so the two ways
          of adding answer in one voice. */}
      <div className={`favtoast listadded${justAdded ? " on" : ""}`} aria-hidden={!justAdded}>
        {/* Words only while it speaks: the faded-out shell otherwise still
            holds matching text, and anything looking for the sheet's own
            toast finds two. */}
        {justAdded && (
          <>
            <Icon name="bookmark_added" size={16} />
            <span className="favtoast-t">Added {justAdded.name}. Followers can see it.</span>
            <Link
              className="favtoast-link"
              href={`/week?hl=${encodeURIComponent(`${justAdded.classId}.${justAdded.iso}`)}`}
              onClick={() => setJustAdded(null)}
            >
              See it
            </Link>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
