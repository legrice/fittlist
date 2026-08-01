"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { initialOf } from "@/lib/avatar";
import { FollowHint, followHintOff } from "@/components/FollowHint";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";

// One row for a person and one for a place, wherever the directory is listed.
//
// They were DiscoverList's, and search needed the same two. A second copy
// always drifts, and the drift is invisible until somebody screenshots both:
// the availability dot, the Coach badge, the classes-this-week line and the
// corner Follow are the whole vocabulary of "here is someone", and they have
// to mean the same thing on both screens. `from` is the only thing that
// differs, and it is what lets the profile's back arrow name the list.

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

// The row's corner control: a small Follow that flips green when it's a yes,
// so following someone doesn't require the round trip through their page.
// Same tri-state as the profile pill (a gated coach's tap reads Requested,
// tapping again withdraws it), scoped to its own row.
export function FollowMini({
  handle,
  name,
  isCoach,
  following,
  requested,
}: {
  handle: string;
  name: string;
  /** The hint promises a week on Following, which only a coach has. Following
   *  a member buys something quieter and mutual, and what it means is still
   *  being worked out, so the bar stays quiet until it can say something true. */
  isCoach: boolean;
  following: boolean;
  requested: boolean;
}) {
  const [state, setState] = useState<"off" | "asked" | "on">(
    following ? "on" : requested ? "asked" : "off",
  );
  // True only for a yes born of a tap, so the spring plays once at the moment
  // it means something and a page of already-green pills loads still.
  const [pop, setPop] = useState(false);
  const [hint, setHint] = useState(false);
  const [pending, start] = useTransition();
  const tap = () =>
    start(async () => {
      if (state === "off") {
        const res = await followTrainer(handle);
        if (res.ok) {
          setState(res.requested ? "asked" : "on");
          setPop(!res.requested);
          if (isCoach && !res.requested && !followHintOff()) setHint(true);
        }
      } else {
        const res = await unfollowTrainer(handle);
        if (res.ok) {
          setState("off");
          setPop(false);
        }
      }
    });
  return (
    <>
      <FollowHint
        name={name.trim().split(/\s+/)[0] || name}
        on={hint}
        onClose={() => setHint(false)}
      />
      <button
        className={`disfol${state === "on" ? " on" : ""}${pop ? " pop" : ""}`}
        disabled={pending}
        aria-pressed={state === "on"}
        onClick={tap}
      >
        {state === "on" && <Icon name="check" size={13} />}
        {state === "on" ? "Following" : state === "asked" ? "Requested" : "Follow"}
      </button>
    </>
  );
}

/** A person: the whole row links to their page, with Follow in the corner. */
export function PersonRow({ person: c, from }: { person: DirPerson; from: string }) {
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
          {/* The tag rides right beside the name; the Follow pill is the row's
              corner control, pinned top-right. */}
          <span className="disrow-nmline">
            <span className="nm">{c.name}</span>
            {c.kind === "coach" && <span className="kindtag kindtag-sm">Coach</span>}
          </span>
          {/* The tagline only. The city came off the line: the filter above
              already speaks location, and the repeated city name crowded out
              the taglines it sat beside. */}
          <span className="sub">{c.title || `fittlist.co/${c.handle}`}</span>
          {c.kind === "coach" && (
            <span className="wk">
              {c.classesThisWeek
                ? `${c.classesThisWeek} ${c.classesThisWeek === 1 ? "class" : "classes"} this week`
                : "No classes posted yet"}
            </span>
          )}
        </span>
        <LinkPending />
      </Link>
      <FollowMini
        handle={c.handle}
        name={c.name}
        isCoach={c.kind === "coach"}
        following={c.following}
        requested={c.requested}
      />
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
        <Icon name="chevron_right" size={18} />
      </span>
    </Link>
  );
}
