"use client";

import Link from "next/link";
import { initialOf } from "@/lib/avatar";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { RowFollow } from "@/components/RowFollow";

// One row for a person and one for a place, wherever the directory is listed.
//
// They were DiscoverList's, and search needed the same two. A second copy
// always drifts, and the drift is invisible until somebody screenshots both:
// the availability dot, the Coach badge and the classes-this-week line are
// the whole vocabulary of "here is someone", and they have to mean the same
// thing on both screens. `from` is the only thing that differs, and it is
// what lets the profile's back arrow name the list.
//
// A person's row carries the Follow pill again where the list asks for it
// (`follow`), which is Discover: following is most of what somebody is doing
// while they read that list, and making them open a page to do it put a
// navigation between the want and the act. Search doesn't ask for it, so it
// keeps the quieter row. Where the pill shows, the sub-line drops its
// "· Following": the pill is already saying it, and twice is once too many.
// A studio's row still carries nothing, because you follow a person and a gym
// is a place.

export type DirPerson = {
  id: string;
  handle: string;
  name: string;
  /** Members list here too; the badge is what tells them apart. */
  kind: "coach" | "member";
  photo: string | null;
  title: string;
  location: string;
  classesThisWeek: number;
  following: boolean;
  /** A pending ask at a coach who approves their followers. */
  requested: boolean;
  /** Worn as a dot on the avatar, same as the profile photo. Coaches only. */
  availability: string | null;
  /** What they teach, from the same list a studio picks its types from. */
  disciplines: string[];
  color: string;
};

/** A place in the directory. Not followable: you follow a person, and a gym
 *  is not a person. Its page is where its week lives. */
export type DirStudio = {
  id: string;
  slug: string;
  name: string;
  address: string;
  photo: string | null;
  types: string[];
  /** It runs its schedule here, so there's a week to see. */
  hasSchedule: boolean;
  /** Behind the initial when there's no photo, same sixty a coach draws from. */
  color: string;
};

/** A person: the whole row links to their page, chevron in the corner.
 *  `kindTag` is off where the list holds one kind: Discover lists coaches
 *  only, so a Coach badge on every row would be saying nothing; search
 *  mixes kinds, and there the badge is the distinction that matters. */
export function PersonRow({
  person: c,
  from,
  kindTag = true,
  follow = false,
}: {
  person: DirPerson;
  from: string;
  kindTag?: boolean;
  /** Offer the pill in the corner. Discover does; search doesn't. */
  follow?: boolean;
}) {
  return (
    <div className="disrow">
      <Link className="disrow-main" href={`/${c.handle}?from=${from}`}>
        <span className="disrow-avwrap">
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="disrow-av" src={c.photo} alt="" />
          ) : (
            <span
              className="disrow-av disrow-av-empty"
              style={{ background: c.color }}
              aria-hidden="true"
            >
              {(c.name.trim().charAt(0) || "?").toUpperCase()}
            </span>
          )}
          {c.availability && (
            <span className={`avphotodot avphotodot-${c.availability}`} aria-hidden="true" />
          )}
        </span>
        <span className="disrow-txt">
          <span className="disrow-nmline">
            <span className="nm">{c.name}</span>
            {kindTag && c.kind === "coach" && <span className="kindtag kindtag-sm">Coach</span>}
          </span>
          {/* The tagline, and the relationship after it only where there is
              no pill to say the same thing. */}
          <span className="sub">
            {c.title || `fittlist.co/${c.handle}`}
            {follow ? "" : c.following ? " · Following" : c.requested ? " · Requested" : ""}
          </span>
          {c.kind === "coach" && (
            <span className="wk">
              {c.classesThisWeek
                ? `${c.classesThisWeek} ${c.classesThisWeek === 1 ? "class" : "classes"} this week`
                : "No classes posted yet"}
            </span>
          )}
        </span>
        {/* The chevron steps aside for the pill: two things in one corner is
            the row shouting, and the whole row is still the link. */}
        {!follow && (
          <span className="disrow-chev">
            <Icon name="chevron_right" size={20} />
          </span>
        )}
        <LinkPending />
      </Link>
      {/* Outside the Link, because a button inside an anchor is invalid and
          the tap would belong to the wrong one. */}
      {follow && (
        <RowFollow
          handle={c.handle}
          name={c.name}
          isCoach={c.kind === "coach"}
          following={c.following}
          requested={c.requested}
        />
      )}
    </div>
  );
}

/** A place: the whole row is the link, and it carries no pill. */
export function StudioRow({ studio: st, from }: { studio: DirStudio; from: string }) {
  return (
    <Link className="disrow disrow-studio" href={`/s/${st.slug}?from=${from}`}>
      <span className="disrow-avwrap">
        {st.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="disrow-av" src={st.photo} alt="" />
        ) : (
          <span
            className="disrow-av disrow-av-empty"
            style={{ background: st.color }}
            aria-hidden="true"
          >
            {initialOf(st.name)}
          </span>
        )}
      </span>
      <span className="disrow-txt">
        <span className="disrow-nmline">
          <span className="nm">{st.name}</span>
          {st.hasSchedule && <span className="kindtag kindtag-sm">Schedule</span>}
        </span>
        <span className="disrow-sub">{st.address}</span>
      </span>
      <span className="disrow-chev">
        <Icon name="chevron_right" size={20} />
      </span>
    </Link>
  );
}
