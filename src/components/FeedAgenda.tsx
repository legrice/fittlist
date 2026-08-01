"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setGoing } from "@/app/actions/going";
import { Agenda, AgendaAvatar, ClassRow } from "@/components/Agenda";
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
}: {
  coaches: FeedCoach[];
  days: FeedDay[];
  /** The viewer, when they're a coach — their own classes are in here too. */
  meId?: string;
}) {
  const router = useRouter();
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
            onClick={() => toggle(c.id)}
          >
            <AgendaAvatar photo={c.photo} name={c.name} cls="feedav-img" color={c.color} />
            <span className="feedav-nm">{c.name.trim().split(/\s+/)[0]}</span>
          </button>
        ))}
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
            <Link href={`/${picked[0].handle}?from=home`} className="feedfilter-link">
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
        <Agenda
          className="feedagenda"
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
              // The control says Add and the note says Added to your plans, so
              // the row says the same word.
              tag: going[`${i.classId}|${d.iso}`] ? "Added" : null,
              on: going[`${i.classId}|${d.iso}`],
              classId: i.classId,
              base: i.handle,
            })),
          }))}
          row={(item, d) => (
            <SwipeGoing
              going={!!item.on}
              onToggle={() => toggleGoing(item.classId!, d.iso, !item.on)}
            >
              <ClassRow
                item={item}
                onClick={() => setOpen({ handle: item.base!, classId: item.classId!, iso: d.iso })}
              />
            </SwipeGoing>
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
