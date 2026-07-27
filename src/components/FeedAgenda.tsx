"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export type FeedCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
};

export type FeedItem = {
  classId: string;
  coachId: string;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
};

export type FeedDay = { iso: string; label: string; items: FeedItem[] };

// The fan feed: one chronological agenda across every followed coach, day by
// day starting today. The avatar strip on top filters to a single coach —
// tap to focus, tap again to clear.
export function FeedAgenda({ coaches, days }: { coaches: FeedCoach[]; days: FeedDay[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const selCoach = sel ? coaches.find((c) => c.id === sel) : undefined;

  const shown = days
    .map((d) => ({ ...d, items: sel ? d.items.filter((i) => i.coachId === sel) : d.items }))
    .filter((d) => d.items.length > 0);

  const avatar = (photo: string | null, name: string, cls: string) =>
    photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={cls} src={photo} alt="" />
    ) : (
      <span className={`${cls} ${cls}-empty`} aria-hidden="true">
        {(name.trim().charAt(0) || "?").toUpperCase()}
      </span>
    );

  return (
    <>
      <div className={`feedstrip${sel ? " hassel" : ""}`}>
        {coaches.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`feedav${sel === c.id ? " on" : ""}`}
            aria-pressed={sel === c.id}
            onClick={() => setSel(sel === c.id ? null : c.id)}
          >
            {avatar(c.photo, c.name, "feedav-img")}
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
                  <Link
                    key={`${d.iso}-${i.classId}`}
                    className="ps-event"
                    href={`/${i.handle}/${i.classId}`}
                  >
                    <span className="ps-accent" aria-hidden="true" />
                    <span className="ps-ebody">
                      <span className="ps-enm">{i.name}</span>
                      <span className="ps-estudio ps-ecoach">
                        {avatar(i.coachPhoto, i.coachName, "ps-ecoachav")}
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
