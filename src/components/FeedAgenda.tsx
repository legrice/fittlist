"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";

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
  const [share, setShare] = useState(false);
  const [goingOnly, setGoingOnly] = useState(false);
  // Keyed by class AND day: a weekly class is a different commitment each week.
  const [going, setGoingMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(days.flatMap((d) => d.items.map((i) => [`${i.classId}|${d.iso}`, i.going]))),
  );
  const [, startTransition] = useTransition();
  const selCoach = sel ? coaches.find((c) => c.id === sel) : undefined;

  const shown = days
    .map((d) => ({
      ...d,
      items: d.items.filter(
        (i) => (!sel || i.coachId === sel) && (!goingOnly || going[`${i.classId}|${d.iso}`]),
      ),
    }))
    .filter((d) => d.items.length > 0);

  const goingCount = Object.values(going).filter(Boolean).length;

  const toggleGoing = (classId: string, iso: string) => {
    const key = `${classId}|${iso}`;
    const next = !going[key];
    setGoingMap((g) => ({ ...g, [key]: next })); // optimistic — the tap must land instantly
    startTransition(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) setGoingMap((g) => ({ ...g, [key]: !next }));
    });
  };

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
            <Icon name="groups" size={26} />
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

      {selCoach && (
        <div className="feedfilterbar">
          <span className="feedfilter-txt">Classes with {selCoach.name}</span>
          <Link href={`/${selCoach.handle}`} className="feedfilter-link">
            View page <Icon name="chevron_right" size={16} />
          </Link>
        </div>
      )}

      {goingCount > 0 && (
        <div className="goingbar">
          <button
            type="button"
            className={`goingfilter${goingOnly ? " on" : ""}`}
            aria-pressed={goingOnly}
            onClick={() => setGoingOnly(!goingOnly)}
          >
            <Icon name="check" size={15} /> Going ({goingCount})
          </button>
          <button type="button" className="goingshare" onClick={() => setShare(true)}>
            <Icon name="ios_share" size={16} /> Share my week
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
                {d.items.map((i) => (
                  <div
                    key={`${d.iso}-${i.classId}`}
                    className={`ps-event feedrow${going[`${i.classId}|${d.iso}`] ? " goingon" : ""}`}
                  >
                    <span className="ps-accent" aria-hidden="true" />
                    <Link className="feedrow-main" href={`/${i.handle}/${i.classId}`}>
                      <span className="ps-ebody">
                        <span className="ps-enm">{i.name}</span>
                        <span className="ps-estudio ps-ecoach">
                          {avatar(i.coachPhoto, i.coachName, "ps-ecoachav", i.coachColor)}
                          <span className="ps-ecoach-txt">
                            {i.coachName.trim().split(/\s+/)[0]}
                            {i.where ? ` · ${i.where}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="ps-etimecol">
                        <span className="ps-etime">
                          {i.hm}
                          <span className="ps-ap">{i.ap}</span>
                        </span>
                        <span className="ps-edur">{i.durationMin} min</span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      className={`goingbtn${going[`${i.classId}|${d.iso}`] ? " on" : ""}`}
                      aria-pressed={!!going[`${i.classId}|${d.iso}`]}
                      onClick={() => toggleGoing(i.classId, d.iso)}
                      title="A personal note — not a booking"
                    >
                      <Icon name={going[`${i.classId}|${d.iso}`] ? "check" : "add"} size={16} />
                      {going[`${i.classId}|${d.iso}`] ? "Going" : "I'm going"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {share && <ShareMyWeekSheet onClose={() => setShare(false)} />}
    </>
  );
}
