"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import {
  removePersonalClass,
  type PersonalDetail,
  type PersonalMatch,
} from "@/app/actions/personal";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { Agenda, ClassRow } from "@/components/Agenda";
import { ClassOpener } from "@/components/ClassOpener";
import { InviteSheet } from "@/components/InviteFriends";
import { PlanSheet } from "@/components/PlanSheet";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay } from "@/lib/week";
import { Icon } from "@/components/Icon";
import { QrSheet } from "@/components/QrSheet";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// A member's You tab: their calendar. The classes they added, their own
// entries, the tools across the top, and the plus to put more on it.
//
// Still no month grid, no empty days, no time gutter: it holds only what they
// picked, in time order, and it empties itself as the week passes. What
// changed is its place in the app: it is the same screen a coach's /app is,
// with the hats this viewer actually wears.
export function WeekScreen({
  days,
  studios,
  templates,
  customTypes,
  lastUsed,
  me,
}: {
  days: WeekDay[];
  /** The adder's ingredients. Adding a class you go to is the same form as
   *  adding one you teach, so it needs the same directory and the same memory
   *  of what you filled in last time. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  /** The viewer, for the rail across the top: their face on the Your profile
   *  pill, and the doors to their page. A coach never lands here (their
   *  calendar is /app), so the form below never needs the chair question. */
  me: { handle: string | null; name: string; photo: string | null; color: string };
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
  // The plus asks which kind first: a class, or anything else. A member has
  // two answers now, so they get the same sheet a coach does, minus the hat.
  const [addMenu, setAddMenu] = useState(false);
  const [personalEvent, setPersonalEvent] = useState(false);
  // One of your own, opened: it had no page behind it and so no way in at all.
  const [plan, setPlan] = useState<string | null>(null);
  // The same form again, this time on a row that already exists.
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  // Just added one. A row in a list doesn't say that a picture of it exists,
  // and the picture is the only thing one of your own can hand on, so the note
  // offers it once rather than a toast that reports the save and leaves.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // The same sheet, opened straight onto its card.
  const [shareId, setShareId] = useState<string | null>(null);
  // A public class already sits at that day and time; offer the real one, and
  // keep the way back to "mine anyway" so the answer costs them nothing.
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  // "Is Jenny on fittlist?" — the invite sheet, opened from a personal row.
  const [inviteOpen, setInviteOpen] = useState(false);
  // The rail menus: everything about your page behind Your profile.
  const [profMenu, setProfMenu] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  // Which slice of the calendar: the same underline tabs the coach's /app
  // wears, minus Coaching, which a member hasn't got. All on arrival, every
  // time; a tab is a way of looking, not a fact worth storing.
  const [calTab, setCalTab] = useState<"all" | "added" | "private">("all");

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

  // A tab is only offered where it can narrow something: both kinds have to
  // be on the calendar before the row appears at all.
  const presentKinds = new Set(
    days.flatMap((d) => d.items.map((i) => (i.personal ? "private" : "added"))),
  );
  const tab = calTab === "all" || presentKinds.has(calTab) ? calTab : "all";
  const shown = days
    .map((d) => ({
      ...d,
      items: d.items
        .filter((i) => !gone[`${i.personal ? i.id : i.classId}|${i.iso}`])
        .filter((i) => tab === "all" || (tab === "private") === !!i.personal),
    }))
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
  // One key per row, shared by the agenda item and the entry it came from: the
  // shared row only carries what every list needs, and removing one still wants
  // the whole thing.
  type Entry = WeekDay["items"][number];
  const rowKey = (i: Entry) => `${i.personal ? i.id : i.classId}|${i.iso}`;
  const byKey: Record<string, Entry> = Object.fromEntries(
    shown.flatMap((d) => d.items.map((i) => [rowKey(i), i] as const)),
  );

  return (
    // The tabs layout is the shell now: header above, bar below, and its .pad
    // already leaves room for the bar. The extra room here is for the floating
    // Share pill, which sits above it.
    <>
      <div className="weekwrap">
        {/* The same rail a coach's calendar wears, with the member's doors on
            it: their page, sharing their week, and the editor last. */}
        <div className="schedtools">
          {me.handle && (
            <button className="schedtool" onClick={() => setProfMenu(true)}>
              {me.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="schedtool-av" src={me.photo} alt="" />
              ) : (
                <span
                  className="schedtool-av schedtool-av-empty"
                  style={{ background: me.color }}
                  aria-hidden="true"
                >
                  {(me.name.trim().charAt(0) || "?").toUpperCase()}
                </span>
              )}
              Your profile
            </button>
          )}
          <button className="schedtool" onClick={() => setShare(true)}>
            <Icon name="auto_awesome" size={16} /> Share
          </button>
          <Link className="schedtool" href="/you?edit=1">
            <Icon name="edit" size={16} /> Edit profile
          </Link>
        </div>

        <div className="calhead-row">
          <h2 className="calhead">Your schedule</h2>
          <button className="calhead-add" onClick={() => setAddMenu(true)}>
            <Icon name="add" size={15} /> Add
          </button>
        </div>
        {/* The slices of the calendar, under the rail: All, the classes you
            added, your own private entries. Only when both kinds are here;
            one kind would make All a tab with no job. */}
        {presentKinds.size > 1 && (
          <div className="pubtabs distabs caltabs" aria-label="Calendar filter">
            {(
              [
                { k: "all" as const, t: "All" },
                { k: "added" as const, t: "Going" },
                { k: "private" as const, t: "Personal" },
              ]
            ).map((x) => (
              <button
                key={x.k}
                className={`pubtab${tab === x.k ? " sel" : ""}`}
                aria-current={tab === x.k ? "page" : undefined}
                onClick={() => setCalTab(x.k)}
              >
                {x.t}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty-block">
            <h2>Nothing added yet</h2>
            <p>
              Add a class from Following or a coach&rsquo;s page and it lands here,
              and drops off once it&rsquo;s been and gone.
            </p>
            <Link className="btn si" href="/feed">
              Find something to add
            </Link>
            {/* The other way in: a class you go to whose coach isn't here
                yet. Yours alone; nothing public. */}
            <button
              className="btn ghost"
              onClick={() => {
                setPersonalEvent(false);
                setAddOpen(true);
              }}
            >
              Add a class
            </button>
          </div>
        ) : (
          <>
            {/* The same rows Following draws. A member flipping between the two
                tabs is looking at one list of one kind of thing, and it used to
                be two designs. ClassOpener catches the tap on a real class; a
                personal one has no page, so it opens its own sheet. */}
            <ClassOpener handle="">
              <Agenda
                className="evcards"
                days={shown.map((d) => ({
                  iso: d.iso,
                  label: d.label,
                  items: d.items.map((i) => ({
                    key: rowKey(i),
                    name: i.name,
                    hm: i.hm,
                    ap: i.ap,
                    durationMin: i.durationMin,
                    where: i.where,
                    coachName: i.coachName,
                    coachPhoto: i.coachPhoto,
                    coachColor: i.coachColor,
                    // Going marks the classes you added; a personal row
                    // carries nothing, because the tab already says why it
                    // is here.
                    tag: i.personal ? null : "Going",
                    // No green ring here: on this screen every row is one they
                    // added, and a mark on all of them says nothing.
                    on: false,
                    href: i.personal ? null : `/${i.handle}/${i.classId}?d=${i.iso}&from=week`,
                    classId: i.personal ? undefined : i.classId,
                    iso: i.iso,
                    base: i.personal ? undefined : i.handle,
                  })),
                }))}
                row={(item) => {
                  const src = byKey[item.key];
                  return (
                    <>
                      <ClassRow
                        item={item}
                        onClick={src.personal ? () => setPlan(src.id) : undefined}
                      >
                        {/* People you both follow, going to the same one. The
                            whole payoff of following a member. */}
                        {src.alsoGoing && src.alsoGoing.length > 0 && (
                          <span className="weekrow-also">
                            {src.alsoGoing.slice(0, 3).map((p, idx) =>
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
                              ),
                            )}
                            <span className="weekrow-alsotxt">
                              {src.alsoGoing.length === 1
                                ? `${src.alsoGoing[0].name.split(/\s+/)[0]} is going too`
                                : `${src.alsoGoing[0].name.split(/\s+/)[0]} and ${
                                    src.alsoGoing.length - 1
                                  } more are going too`}
                            </span>
                          </span>
                        )}
                      </ClassRow>
                      {/* Every row can leave. A calendar's entries don't; a
                          list's do, and that difference is most of what keeps
                          this from reading as one. */}
                      <button
                        className="weekrow-x"
                        aria-label={`Remove ${src.name}`}
                        onClick={() =>
                          setConfirm({
                            classId: src.classId,
                            iso: src.iso,
                            key: item.key,
                            name: src.name,
                            personalId: src.personal ? src.id : undefined,
                          })
                        }
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </>
                  );
                }}
              />
            </ClassOpener>
            {namedCoach && (
              <button className="weekinvite" onClick={() => setInviteOpen(true)}>
                Is {namedCoach.split(/\s+/)[0]} on fittlist? Send them your invite link
              </button>
            )}
          </>
        )}
      </div>
      {/* Which kind this one is. A class gets the full form; anything else
          gets the same form with the class-shaped parts put away. */}
      {addMenu && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddMenu(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddMenu(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Add to your calendar</h2>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(false);
                  setAddOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="bookmark" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">A class you&rsquo;re going to</span>
                  <span className="s">Yours alone; nothing public</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(true);
                  setAddOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="calendar_today" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Anything else</span>
                  <span className="s">An appointment, a session, time you&rsquo;re keeping</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
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
          personal={{ canCoach: false, event: personalEvent }}
          onClose={() => setAddOpen(false)}
          onToast={toast}
          onPublished={(msg, planId) => {
            setAddOpen(false);
            router.refresh();
            if (planId) setJustAdded(planId);
            else toast(msg);
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
      {plan && (
        <PlanSheet
          id={plan}
          onClose={() => setPlan(null)}
          onToast={toast}
          onEdit={(p) => {
            setPlan(null);
            setEdit({
              id: p.id,
              prefill: {
                name: p.name,
                classType: p.classType,
                description: p.description,
                image: p.image,
                startTime: p.startTime,
                durationMin: p.durationMin,
                studioId: p.studioId,
                location: p.location,
                withWho: p.withWho,
                links: p.links,
                days: [p.dayOfWeek],
                dayOfWeek: p.dayOfWeek,
                endsOn: p.endsOn,
                specificDate: p.specificDate,
              },
            });
          }}
        />
      )}
      {edit && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, editId: edit.id }}
          prefill={edit.prefill}
          onClose={() => setEdit(null)}
          onToast={toast}
          onPublished={(msg) => {
            setEdit(null);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setEdit(null);
            toast(msg);
            router.refresh();
          }}
        />
      )}
      {/* The same shape the follow hint uses: a line, one thing to do about
          it, and a way to say no. */}
      {justAdded && (
        <div className="folhint weekadded" role="status" aria-live="polite">
          <p className="folhint-t">
            {personalEvent ? "Added to your calendar." : "Added to your plans."}
          </p>
          <div className="folhint-row">
            <button
              className="folhint-go"
              onClick={() => {
                setShareId(justAdded);
                setJustAdded(null);
              }}
            >
              Share it as a picture
            </button>
            <button className="folhint-off" onClick={() => setJustAdded(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {shareId && (
        <PlanSheet
          id={shareId}
          share
          onClose={() => setShareId(null)}
          onToast={toast}
          onEdit={() => setShareId(null)}
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
      {/* Everything about your page, behind the pill that wears your face. */}
      {profMenu && me.handle && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfMenu(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setProfMenu(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your profile</h2>
            <div className="settingslist ownermenu">
              <Link className="setrow" href={`/${me.handle}`}>
                <span className="setrow-ic"><Icon name="visibility" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">View public profile</span>
                  <span className="s">Your page, as everyone else sees it</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </Link>
              <Link className="setrow" href="/you?edit=1">
                <span className="setrow-ic"><Icon name="edit" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Edit profile</span>
                  <span className="s">Photo, name, bio and the rest</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </Link>
              <button
                className="setrow"
                onClick={async () => {
                  setProfMenu(false);
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/${me.handle}`);
                    toast("Link copied, ready to paste");
                  } catch {
                    toast(`fittlist.co/${me.handle}`);
                  }
                }}
              >
                <span className="setrow-ic"><Icon name="link" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy profile link</span>
                  <span className="s">Straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setProfMenu(false);
                  setQrOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="qr_code_2" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">QR code</span>
                  <span className="s">A scannable code that opens your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}
      {me.handle && (
        <QrSheet handle={me.handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />
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
