"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import { removePersonalClass, type PersonalMatch } from "@/app/actions/personal";
import { Adder } from "@/components/Adder";
import { InviteSheet } from "@/components/InviteFriends";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay } from "@/lib/week";
import { Icon } from "@/components/Icon";
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
  studios,
  templates,
  customTypes,
  lastUsed,
  canCoach,
}: {
  days: WeekDay[];
  /** The adder's ingredients. Adding a class you go to is the same form as
   *  adding one you teach, so it needs the same directory and the same memory
   *  of what you filled in last time. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  /** They coach too, so the form asks whether this one is theirs to teach. */
  canCoach: boolean;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [share, setShare] = useState(false);
  // Removing is one tap next to a list of things you meant to do, so it asks.
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; key: string; name: string; personalId?: string } | null>(null);
  // A class you go to. It used to be five fields in a sheet of its own, which
  // meant the thing you booked through ClassPass arrived with no studio, no
  // description and no picture. It is the coach's own form now.
  const [addOpen, setAddOpen] = useState(false);
  // A public class already sits at that day and time; offer the real one, and
  // keep the way back to "mine anyway" so the answer costs them nothing.
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  // "Is Jenny on fittlist?" — the invite sheet, opened from a personal row.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const remove = (classId: string, iso: string, key: string, personalId?: string) => {
    setConfirm(null);
    setGone((g) => ({ ...g, [key]: true }));
    start(async () => {
      const res = personalId
        ? await removePersonalClass(personalId)
        : await setGoing(classId, iso, false);
      if (!res.ok) {
        setGone((g) => ({ ...g, [key]: false }));
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      toast("Removed from your plans");
      router.refresh();
    });
  };

  const shown = days
    .map((d) => ({ ...d, items: d.items.filter((i) => !gone[`${i.personal ? i.id : i.classId}|${i.iso}`]) }))
    .filter((d) => d.items.length > 0);
  // The first named person on a personal entry, for the invite line.
  const namedCoach = days
    .flatMap((d) => d.items)
    .find((i) => i.personal && i.coachName.trim())?.coachName.trim();

  const addTheRealOne = () => {
    if (!match || pBusy) return;
    const { m } = match;
    setPBusy(true);
    start(async () => {
      const res = await setGoing(m.classId, m.iso, true);
      setPBusy(false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't add that");
        return;
      }
      setMatch(null);
      setAddOpen(false);
      toast(`Added ${m.name} with ${m.coachName.trim().split(/\s+/)[0]}`);
      router.refresh();
    });
  };
  const left = shown.reduce((n, d) => n + d.items.length, 0);

  return (
    // The tabs layout is the shell now: header above, bar below, and its .pad
    // already leaves room for the bar. The extra room here is for the floating
    // Share pill, which sits above it.
    <>
      <div className="weekwrap">
        <div className="admintop pagetop">
          <div>
            <h1>Your plans</h1>
            <p className="adminsub">
              {left === 0
                ? "Classes you add land here"
                : `${left} class${left === 1 ? "" : "es"} coming up`}
            </p>
          </div>
          {/* The other way in, across from the title: a class you go to whose
              coach isn't here yet, or one you booked somewhere else. The empty
              state carries its own copy of this door. */}
          {shown.length > 0 && (
            <button className="weekinvite weekaddown weekaddtop" onClick={() => setAddOpen(true)}>
              <Icon name="add" size={15} /> Add a class
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="empty-block">
            <h2>Nothing added yet</h2>
            <p>
              Heart a class and it lands here. What you pick
              lands here, and drops off once it&rsquo;s been and gone.
            </p>
            <Link className="btn si" href="/feed">
              Find something to add
            </Link>
            {/* The other way in: a class you go to whose coach isn't here
                yet. Yours alone; nothing public. */}
            <button className="btn ghost" onClick={() => setAddOpen(true)}>
              Add a class
            </button>
          </div>
        ) : (
          <>
            <div className="weeklist">
              {shown.map((d) => (
                <div key={d.iso} className="weekday">
                  <div className="ps-daycol">{d.label}</div>
                  {d.items.map((i) => {
                    const key = `${i.personal ? i.id : i.classId}|${i.iso}`;
                    const body = (
                      <>
                        <span className="weekrow-nm">{i.name}</span>
                        <span className="weekrow-sub">
                          {i.hm}
                          <span className="ps-ap">{i.ap}</span> · {i.durationMin} min
                          {i.where ? ` · ${i.where}` : ""}
                        </span>
                        {i.coachName.trim() && <span className="weekrow-who">with {i.coachName}</span>}
                        {/* People you both follow, going to the same one. The
                            whole payoff of following a member. */}
                        {i.alsoGoing && i.alsoGoing.length > 0 && (
                          <span className="weekrow-also">
                            {i.alsoGoing.slice(0, 3).map((p, idx) => (
                              p.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={idx} className="weekrow-alsoav" src={p.photo} alt="" />
                              ) : (
                                <span
                                  key={idx}
                                  className="weekrow-alsoav weekrow-alsoav-empty"
                                  style={{ background: p.color }}
                                  aria-hidden="true"
                                >
                                  {(p.name.charAt(0) || "?").toUpperCase()}
                                </span>
                              )
                            ))}
                            <span className="weekrow-alsotxt">
                              {i.alsoGoing.length === 1
                                ? `${i.alsoGoing[0].name.split(/\s+/)[0]} is going too`
                                : `${i.alsoGoing[0].name.split(/\s+/)[0]} and ${
                                    i.alsoGoing.length - 1
                                  } more are going too`}
                            </span>
                          </span>
                        )}
                      </>
                    );
                    return (
                      <div key={key} className="weekrow">
                        <span
                          className="ps-accent weekrow-accent"
                          style={{ background: i.coachColor }}
                          aria-hidden="true"
                        />
                        {i.personal ? (
                          /* Yours alone: no class page behind it, so no link. */
                          <span className="weekrow-main">{body}</span>
                        ) : (
                          <Link className="weekrow-main" href={`/${i.handle}/${i.classId}?d=${i.iso}&from=week`}>
                            {body}
                          </Link>
                        )}
                        {/* Every row can leave. A calendar's entries don't; a
                            list's do, and that difference is most of what keeps
                            this from reading as one. */}
                        <button
                          className="weekrow-x"
                          aria-label={`Remove ${i.name}`}
                          onClick={() =>
                            setConfirm({
                              classId: i.classId,
                              iso: i.iso,
                              key,
                              name: i.name,
                              personalId: i.personal ? i.id : undefined,
                            })
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
            {namedCoach && (
              <button className="weekinvite" onClick={() => setInviteOpen(true)}>
                Is {namedCoach.split(/\s+/)[0]} on fittlist? Send them your invite link
              </button>
            )}
          </>
        )}
      </div>
      {/* The same floating pill the class overlay wears: the one thing to do
          with a full list, riding above the tab bar. Pinned rather than
          parked at the end, because a week with enough classes in it pushed
          the button off the bottom, and that's the week you'd most want to
          share. */}
      {shown.length > 0 && (
        <div className="classoverlay-cta weekshare">
          <button className="ovcta-btn" onClick={() => setShare(true)}>
            <Icon name="campaign" size={17} /> Share your schedule
          </button>
        </div>
      )}
      {addOpen && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach }}
          onClose={() => setAddOpen(false)}
          onToast={toast}
          onPublished={(msg) => {
            setAddOpen(false);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            toast(msg);
            router.refresh();
          }}
          onMatch={(m, again) => {
            // The match stands alone; two stacked sheets read as a collision.
            // `again` still holds everything they typed.
            setAddOpen(false);
            setMatch({ m, again });
          }}
        />
      )}
      {match && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMatch(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>That class is on fittlist</h2>
            <p className="lead">
              {match.m.name} with {match.m.coachName} runs then. Add the real one and it stays up
              to date when the coach changes it.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pBusy} onClick={addTheRealOne}>
                Add {match.m.name}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={pBusy}
                onClick={() => {
                  const { again } = match;
                  setMatch(null);
                  again();
                }}
              >
                Add mine anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {inviteOpen && (
        <InviteSheet
          onClose={() => setInviteOpen(false)}
          onCopied={() => toast("Link copied, ready to paste")}
        />
      )}
      {confirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Take it out of your plans?</h2>
            <p className="lead">
              {confirm.name} comes off your list. You can add it back from the coach&rsquo;s
              schedule any time.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => remove(confirm.classId, confirm.iso, confirm.key, confirm.personalId)}
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
      {/* The range starts where their plans do, so the first poster they see
          has their week on it rather than nothing. */}
      {share && (
        <ShareMyWeekSheet onClose={() => setShare(false)} firstIso={shown[0]?.iso} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
