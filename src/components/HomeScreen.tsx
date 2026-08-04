"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { followTrainer } from "@/app/actions/subscribe";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { initialOf } from "@/lib/avatar";
import { ActivityRow } from "@/components/ActivityRow";
import type { HomeData, HomePerson, HomeStudio, HomeUpcoming } from "@/lib/home";

// The Home tab: a mixed scroll that has something on it whether or not your
// follow graph changed. Your own next seven days lead (they're yours, and
// their emptiness is actionable), then the people and places near you, then
// what the people you follow are up to. It is a finite page that ends: no
// infinite scroll, no ranking, nothing here is engineered to be sticky.
export function HomeScreen({
  data,
  scheduleHref,
}: {
  data: HomeData;
  /** Where "Schedule" points for this viewer: /app for a coach, /week else. */
  scheduleHref: string;
}) {
  const [toastMsg, toastOn, toast] = useToast();
  return (
    <div className="homewrap">
      {/* Where and when this page thinks it is. The chip is the viewer's own
          city (the one they gave us), not a guess. */}
      <div className="hm-place">
        {data.location && <span className="hm-where">{data.location}</span>}
        <span className="hm-when">{data.todayLabel}</span>
      </div>

      <section className="hm-sec">
        <div className="hm-sechead">
          <h2 className="hm-title">Upcoming</h2>
          <Link className="hm-see" href={scheduleHref}>
            Schedule <Icon name="chevron_right" size={15} />
          </Link>
        </div>
        <p className="hm-sub">Classes you&rsquo;re going to, next 7 days</p>
        {data.upcoming.length ? (
          <ClassOpener handle="">
            <div className="hm-rail">
              {data.upcoming.map((u) => (
                <UpcomingCard key={`${u.classId}|${u.iso}`} u={u} />
              ))}
            </div>
          </ClassOpener>
        ) : (
          <div className="hm-emptywrap">
            <div className="hm-empty">
              <h3>Nothing planned yet</h3>
              <p>Mark a class as going and it shows up here.</p>
              <Link className="btn si hm-emptybtn" href="/discover">
                Find a class
              </Link>
            </div>
          </div>
        )}
      </section>

      {data.people.length > 0 && (
        <section className="hm-sec">
          <div className="hm-sechead">
            <h2 className="hm-title">People near you</h2>
            <Link className="hm-see" href="/discover">
              All <Icon name="chevron_right" size={15} />
            </Link>
          </div>
          <div className="hm-coachrail">
            {data.people.map((p) => (
              <PersonBubble key={p.id} p={p} onToast={toast} />
            ))}
          </div>
        </section>
      )}

      {data.studios.length > 0 && (
        <section className="hm-sec">
          <div className="hm-sechead">
            <h2 className="hm-title">Studios</h2>
            <Link className="hm-see" href="/discover">
              All <Icon name="chevron_right" size={15} />
            </Link>
          </div>
          <div className="hm-list">
            {data.studios.map((s) => (
              <StudioLine key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {data.activity.length > 0 && (
        <section className="hm-sec">
          <div className="hm-sechead">
            <h2 className="hm-title">Activity</h2>
            <Link className="hm-see" href="/activity">
              See all <Icon name="chevron_right" size={15} />
            </Link>
          </div>
          <div className="hm-list">
            {data.activity.map((a) => (
              <ActivityRow key={a.key} a={a} />
            ))}
          </div>
          {/* The privacy rule, said where the feed is: this list is only ever
              public acts, and Personal never reaches it. */}
          <p className="hm-foot">
            Only public actions appear here. Anything marked Personal stays private.
          </p>
        </section>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

function UpcomingCard({ u }: { u: HomeUpcoming }) {
  return (
    <a className="hm-card" href={u.href} data-cid={u.classId} data-d={u.iso} data-base={u.base}>
      {/* The pill is quiet now: it says when, which every card says, so a
          loud one on every card is a rail of shouting. The spine came off
          for the same reason, and because the colour meant a kind on a rail
          where every card is the same kind. */}
      <span className="hm-whenpill">
        {u.dayLabel} · {u.time}
      </span>
      <span className="hm-cardnm">{u.name}</span>
      {/* Who, then where. They were one run-on line with a dot between them
          and the studio was the half that got cut; the length took a line of
          its own underneath and said the least of the three. */}
      {u.coachName && (
        <span className="hm-cardrow">
          <span className="hm-cardav" style={{ background: u.coachColor }}>
            {u.coachPhoto ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={u.coachPhoto} alt="" />
            ) : (
              initialOf(u.coachName)
            )}
          </span>
          <span className="hm-cardmeta">{u.coachName}</span>
        </span>
      )}
      {u.where && <span className="hm-cardmeta">{u.where}</span>}
      {u.alsoGoing.length > 0 && (
        <span className="hm-cardmeta hm-also">
          {u.alsoGoing.length === 1
            ? `${u.alsoGoing[0]} is going too`
            : `${u.alsoGoing[0]} and ${u.alsoGoing.length - 1} ${u.alsoGoing.length === 2 ? "other" : "others"} going`}
        </span>
      )}
    </a>
  );
}

// The section that feeds the follow graph: the follow is one tap, right
// here, and tapping the face is what navigates.
function PersonBubble({ p, onToast }: { p: HomePerson; onToast: (m: string) => void }) {
  const [state, setState] = useState<"none" | "following" | "requested">("none");
  const [, start] = useTransition();
  const follow = () =>
    start(async () => {
      const res = await followTrainer(p.handle);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong.");
        return;
      }
      setState(res.requested ? "requested" : "following");
      if (res.requested) onToast(`Asked ${p.name} to follow.`);
    });
  return (
    <div className="hm-coach">
      <Link href={`/${p.handle}?from=home`} className="hm-coachlink">
        <span className="hm-bigav" style={{ background: p.color }}>
          {p.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.photo} alt="" />
          ) : (
            initialOf(p.name)
          )}
        </span>
        <span className="hm-coachnm">{p.name}</span>
        <span className="hm-coachsub">{p.sub}</span>
      </Link>
      {state === "none" ? (
        <button className="hm-follow" onClick={follow}>
          Follow
        </button>
      ) : (
        <span className="hm-follow hm-followed">
          {state === "requested" ? "Requested" : "Following"}
        </span>
      )}
    </div>
  );
}

function StudioLine({ s }: { s: HomeStudio }) {
  return (
    <Link className="hm-lrow" href={`/s/${s.slug}?from=home`}>
      <span className="hm-sq" style={{ background: s.color }}>
        {s.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={s.photo} alt="" />
        ) : (
          initialOf(s.name)
        )}
      </span>
      <span className="hm-lrowtxt">
        <span className="hm-lrownm">
          {s.name}
          {/* The word alone, in the quiet green: the page behind the row
              carries the full badge and its explaining sheet. */}
          {/* In a list the mark is enough: the word repeated down a column
              is a column of one word, and the tick is what people already
              read as verified. The page itself still says it in full. */}
          {s.verified && (
            <span className="hm-vtick" aria-label="Verified">
              <Icon name="verified" size={16} />
            </span>
          )}
        </span>
        <span className="hm-lrowsub">{s.sub}</span>
      </span>
      <span className="hm-lrowchev" aria-hidden="true">
        <Icon name="chevron_right" size={18} />
      </span>
    </Link>
  );
}

