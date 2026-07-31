"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEventGoing } from "@/app/actions/events";
import { setGoing } from "@/app/actions/going";
import { addPersonalClass, removePersonalClass } from "@/app/actions/personal";
import { InviteSheet } from "@/components/InviteFriends";
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
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; key: string; name: string; personalId?: string; eventId?: string } | null>(null);
  // Your own standing class: the one your coach isn't on fittlist for yet.
  const [addOpen, setAddOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pDay, setPDay] = useState(0);
  const [pTime, setPTime] = useState("18:00");
  const [pEnd, setPEnd] = useState("19:00");
  // A public class already sits at that day and time; offer the real one.
  const [match, setMatch] = useState<{
    classId: string;
    name: string;
    coachName: string;
    handle: string;
    iso: string;
  } | null>(null);
  const [pWhere, setPWhere] = useState("");
  const [pWith, setPWith] = useState("");
  const [pBusy, setPBusy] = useState(false);
  // "Is Jenny on fittlist?" — the invite sheet, opened from a personal row.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const remove = (classId: string, iso: string, key: string, personalId?: string, eventId?: string) => {
    setConfirm(null);
    setGone((g) => ({ ...g, [key]: true }));
    start(async () => {
      const res = eventId
        ? await setEventGoing(eventId, false)
        : personalId
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
    .map((d) => ({
      ...d,
      items: d.items.filter((i) => !gone[`${i.personal ? i.id : i.classId}|${i.iso}`]),
      events: (d.events ?? []).filter((e) => !gone[`ev|${e.eventId}`]),
    }))
    .filter((d) => d.items.length > 0 || d.events.length > 0);
  // The first named person on a personal entry, for the invite line.
  const namedCoach = days
    .flatMap((d) => d.items)
    .find((i) => i.personal && i.coachName.trim())?.coachName.trim();

  // Duration comes from the two times; nobody thinks in minutes.
  const minutesBetween = (a: string, b: string) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return bh * 60 + bm - (ah * 60 + am);
  };

  const saveOwn = (force = false) => {
    if (pBusy || !pName.trim()) return;
    const durationMin = minutesBetween(pTime, pEnd);
    if (durationMin <= 0) {
      toast("It ends before it starts");
      return;
    }
    setPBusy(true);
    start(async () => {
      const res = await addPersonalClass({
        name: pName,
        dayOfWeek: pDay,
        startTime: pTime,
        durationMin,
        location: pWhere,
        withWho: pWith,
        force,
      });
      setPBusy(false);
      if (!res.ok) {
        if (res.match) {
          // The match stands alone; two stacked sheets read as a collision.
          // The form state stays, so "Add mine anyway" has everything.
          setAddOpen(false);
          setMatch(res.match);
          return;
        }
        toast(res.error ?? "Couldn't add that");
        return;
      }
      setAddOpen(false);
      setMatch(null);
      setPName("");
      setPWhere("");
      setPWith("");
      toast("Added to your plans");
      router.refresh();
    });
  };

  const addTheRealOne = () => {
    if (!match || pBusy) return;
    setPBusy(true);
    start(async () => {
      const res = await setGoing(match.classId, match.iso, true);
      setPBusy(false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't add that");
        return;
      }
      setMatch(null);
      setAddOpen(false);
      setPName("");
      toast(`Added ${match.name} with ${match.coachName.trim().split(/\s+/)[0]}`);
      router.refresh();
    });
  };
  const left = shown.reduce((n, d) => n + d.items.length, 0);

  return (
    <section className="screen hasnav">
      <div className="pad" style={{ paddingTop: 14, paddingBottom: 186 }}>
        {header}
        <div className="admintop pagetop">
          <div>
            <h1>Your plans</h1>
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
              Heart a class and it lands here. What you pick
              lands here, and drops off once it&rsquo;s been and gone.
            </p>
            <Link className="btn si" href="/feed">
              Find something to add
            </Link>
            {/* The other way in: the class you already go to, whose coach
                isn't here yet. Yours alone; nothing public. */}
            <button className="btn ghost" onClick={() => setAddOpen(true)}>
              Add your own class
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
                  {/* Events you marked, riding the same day. The heart means
                      one thing everywhere it appears. */}
                  {d.events.map((e) => (
                    <div key={`ev|${e.eventId}`} className="weekrow">
                      <span className="ps-accent weekrow-accent weekrow-ev" aria-hidden="true" />
                      <Link className="weekrow-main" href={`/e/${e.eventId}`}>
                        <span className="weekrow-nm">{e.name}</span>
                        <span className="weekrow-sub">
                          {e.timeLabel ? `${e.timeLabel} · ` : ""}
                          {e.place}
                        </span>
                      </Link>
                      <button
                        className="weekrow-x"
                        aria-label={`Remove ${e.name}`}
                        onClick={() =>
                          setConfirm({
                            classId: "",
                            iso: d.iso,
                            key: `ev|${e.eventId}`,
                            name: e.name,
                            eventId: e.eventId,
                          })
                        }
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {/* In-flow rather than pinned: the strip stays one row, and this
                belongs with the list it adds to. */}
            <button className="weekinvite weekaddown" onClick={() => setAddOpen(true)}>
              <Icon name="add" size={15} /> Add your own class
            </button>
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
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pBusy) setAddOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your own class</h2>
            <p className="lead">
              For the classes you already go to, whose coaches aren&rsquo;t on fittlist yet. Only
              you see it, and it repeats weekly until you take it out.
            </p>
            <label className="flabel" htmlFor="ownName">Class</label>
            <input
              id="ownName"
              type="text"
              className="editinput"
              maxLength={80}
              placeholder="e.g. Spin"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
            />
            <label className="flabel">Day</label>
            <div className="seg ownday">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, idx) => (
                <button key={d} className={pDay === idx ? "sel" : ""} onClick={() => setPDay(idx)}>
                  {d}
                </button>
              ))}
            </div>
            {/* Same two-column time row as the coach's class editor: native
                time inputs have a wide intrinsic minimum, and .editinput let
                Ends run off the sheet on a phone. */}
            <div className="timegrid two">
              <div>
                <label className="flabel" htmlFor="ownTime">Starts</label>
                <input
                  id="ownTime"
                  type="time"
                  className="timeinput"
                  value={pTime}
                  onChange={(e) => setPTime(e.target.value)}
                />
              </div>
              <div>
                <label className="flabel" htmlFor="ownEnd">Ends</label>
                <input
                  id="ownEnd"
                  type="time"
                  className="timeinput"
                  value={pEnd}
                  onChange={(e) => setPEnd(e.target.value)}
                />
              </div>
            </div>
            <label className="flabel" htmlFor="ownWhere">Where <span>· optional</span></label>
            <input
              id="ownWhere"
              type="text"
              className="editinput"
              maxLength={120}
              placeholder="e.g. CorePower, Grove St"
              value={pWhere}
              onChange={(e) => setPWhere(e.target.value)}
            />
            <label className="flabel" htmlFor="ownWith">Coach <span>· optional</span></label>
            <input
              id="ownWith"
              type="text"
              className="editinput"
              maxLength={80}
              placeholder="e.g. Jenny"
              value={pWith}
              onChange={(e) => setPWith(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pBusy || !pName.trim()} onClick={() => saveOwn()}>
                {pBusy ? "Adding…" : "Add to your plans"}
              </button>
            </div>
          </div>
        </div>
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
              {match.name} with {match.coachName} runs then. Add the real one and it stays up to
              date when the coach changes it.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pBusy} onClick={addTheRealOne}>
                Add {match.name}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={pBusy}
                onClick={() => {
                  setMatch(null);
                  saveOwn(true);
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
                onClick={() => remove(confirm.classId, confirm.iso, confirm.key, confirm.personalId, confirm.eventId)}
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
