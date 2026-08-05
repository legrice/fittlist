"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setShiftCover,
  type GymCatalogItem,
  type GymClassDto,
  type GymCoachDto,
  type GymWeekDto,
} from "@/app/actions/gym";
import { clockParts } from "@/lib/format";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

/** "Thu, Aug 6" — the date a swap is about, said the way a person would. */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** What the sheet is open on: a slot, or an empty day waiting for one. */
type Open = { iso: string; dayOfWeek: number; cls: GymClassDto | null };

// The rota: the thing the spreadsheet was for. A week of slots, each one a
// class and the person on it, and both are two taps to change. That is the one
// thing the spreadsheet was genuinely good at, so it is the thing to keep.
//
// Filling a class in is the coach's own adder, not a copy of it. A gym writes
// down the same things a coach does and had been asked for them twice in two
// slightly different forms, which is how the two drift. The gym-shaped parts
// are handed to it: the studio is fixed, private is not offered, and who is on
// the slot is a field only a rota has.
//
// Who is on a slot drives the shift, the notification and the calendar. It is
// not what the public sees: the gym's schedule goes out under the gym's name,
// and showing coaches is a separate switch with the coach's own say in it.
export function GymRota({
  studioId,
  studioName,
  studioAddress,
  backHref,
  manageBase,
  hasAccount,
  week,
  coaches,
  catalog,
  customTypes,
}: {
  studioId: string;
  studioName: string;
  studioAddress: string;
  backHref: string;
  /** /s/{slug}/manage, for the week links. */
  manageBase: string;
  hasAccount: boolean;
  week: GymWeekDto | null;
  coaches: GymCoachDto[];
  /** Classes already described at this studio, to pull in rather than retype. */
  catalog: GymCatalogItem[];
  customTypes: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  // The one-date swap saves as you pick, so the rota keeps it rather than the
  // form: these echo the row while the sheet is up.
  const [onUserId, setOnUserId] = useState("");
  const [covered, setCovered] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const days = week?.days ?? [];
  const all = days.flatMap((d) => d.items);
  const openSlots = all.filter((c) => !c.onUserId).length;

  const show = (iso: string, dayOfWeek: number, cls: GymClassDto | null) => {
    setOnUserId(cls?.onUserId ?? "");
    setCovered(cls?.covered ?? false);
    setOpen({ iso, dayOfWeek, cls });
  };

  const done = (msg: string) => {
    setOpen(null);
    toast(msg);
    router.refresh();
  };

  // Who's on this one date. A swap is about a date, so it never touches the
  // standing rota; setting it back to the regular coach clears the exception.
  const cover = (who: string) => {
    if (!open?.cls || pending) return;
    const cls = open.cls;
    start(async () => {
      const res = await setShiftCover(studioId, cls.id, open.iso, who || null);
      if (!res.ok) {
        toast(res.error ?? "Couldn't change that");
        return;
      }
      setOnUserId(who);
      setCovered(who !== (cls.coachUserId ?? ""));
      toast(who ? "Swapped" : "Opened up");
      router.refresh();
    });
  };

  if (!hasAccount) {
    return (
      <div className="pad">
        <div className="admintop pagetop">
          <div>
            <h1>{studioName}</h1>
            <p className="adminsub">The schedule</p>
          </div>
          <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio's shifts">
            <Icon name="close" size={18} />
          </BackLink>
        </div>
        <p className="adminempty" style={{ marginTop: 24 }}>
          This studio isn&rsquo;t running its schedule here yet. Write to us and we&rsquo;ll turn
          it on.
        </p>
      </div>
    );
  }

  const cls = open?.cls ?? null;
  // Editing points the form at the row that was tapped. Adding still carries
  // the day, so the sheet opens on the day the manager asked for.
  const prefill: AdderPrefill | undefined = open
    ? cls
      ? {
          classId: cls.id,
          name: cls.name,
          classType: cls.classType,
          description: cls.description,
          image: cls.image,
          startTime: cls.startTime,
          durationMin: cls.durationMin,
          studioId,
          isPublic: true,
          links: cls.links.map((l) => ({ ...l })),
          days: cls.specificDate ? [] : [cls.dayOfWeek],
          dayOfWeek: cls.dayOfWeek,
          endsOn: cls.endsOn,
          specificDate: cls.specificDate,
          occurrenceDate: open.iso,
        }
      : {
          name: "",
          startTime: "06:00",
          durationMin: 60,
          studioId,
          isPublic: true,
          links: [],
          days: [open.dayOfWeek],
        }
    : undefined;

  return (
    <div className="pad">
      <div className="admintop pagetop">
        <div>
          <h1>{studioName}</h1>
          <p className="adminsub">
            {all.length === 0
              ? "The week is empty"
              : `${all.length} ${all.length === 1 ? "class" : "classes"}` +
                (openSlots ? ` · ${openSlots} with nobody on` : "")}
          </p>
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio's shifts">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      {/* A real week, dates and all, because that's what the spreadsheet is
          and what a swap is about. */}
      <div className="rotaweek">
        <Link
          className={`rotanav${week && week.offset > 0 ? "" : " off"}`}
          href={`${manageBase}?w=${Math.max(0, (week?.offset ?? 0) - 1)}`}
          aria-disabled={!week || week.offset === 0}
        >
          <Icon name="chevron_left" size={18} />
        </Link>
        <span className="rotaweek-lbl">{week?.label ?? ""}</span>
        <Link className="rotanav" href={`${manageBase}?w=${(week?.offset ?? 0) + 1}`}>
          <Icon name="chevron_right" size={18} />
        </Link>
      </div>

      <div className="rota ps-week ps-agenda">
        {days.map((day, d) => (
          <div key={day.iso} className="rotaday">
            <div className="rotaday-h">
              <span>{day.label}</span>
              <button className="rotaadd" onClick={() => show(day.iso, d, null)}>
                <Icon name="add" size={16} /> Add
              </button>
            </div>
            {day.items.length === 0 ? (
              <p className="rotaempty">Nothing on</p>
            ) : (
              day.items.map((c) => (
                <button
                  key={c.id}
                  className={`ps-event${c.onUserId ? "" : " ps-event-open"}`}
                  onClick={() => show(day.iso, d, c)}
                >
                  <span className="ps-accent" aria-hidden="true" />
                  <span className="ps-ebody">
                    <span className="ps-enm">
                      {c.name}
                      {c.covered && <span className="rotaswap">covering</span>}
                    </span>
                    {/* Where a class card says the place, the rota says the
                        person: on a gym's own page the place is a given. */}
                    <span className="ps-estudio">
                      <Icon name="person_add" size={13} className="ps-estudio-ic" />
                      {c.onName || "Nobody on it yet"}
                    </span>
                  </span>
                  <span className="ps-etimecol">
                    <span className="ps-etime">
                      {clockParts(c.startTime).hm}
                      <span className="ps-ap">{clockParts(c.startTime).ap}</span>
                    </span>
                    <span className="ps-edur">{c.durationMin} min</span>
                  </span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>


      {open && (
        <Adder
          studios={[{ id: studioId, seq: 0, name: studioName, address: studioAddress }]}
          templates={[]}
          customTypes={customTypes}
          lastUsed={{ startTime: "06:00", durationMin: 60, studioId }}
          subsCount={0}
          prefill={prefill}
          firstPublish={false}
          gym={{
            studioId,
            coaches: coaches.map((c) => ({ id: c.id, name: c.name })),
            catalog,
            coachUserId: cls?.coachUserId ?? "",
            dateSwap: cls ? (
              <>
                <label className="flabel" htmlFor="rotaOn">
                  Who&rsquo;s on {fmtDay(open.iso)}
                </label>
                <select
                  id="rotaOn"
                  className="typeselect"
                  value={onUserId}
                  disabled={pending}
                  onChange={(e) => cover(e.target.value)}
                >
                  <option value="">Nobody yet</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.id === cls.coachUserId ? " (usually)" : ""}
                    </option>
                  ))}
                </select>
                <p className="durnote" style={{ marginTop: 8, marginBottom: 18 }}>
                  {covered
                    ? "Just this one. The weekly slot is unchanged, and both of them have been told."
                    : "Changing this only changes this date. Whoever it moves to and from hears about it."}
                </p>
              </>
            ) : null,
          }}
          onClose={() => setOpen(null)}
          onToast={toast}
          onPublished={done}
          onDeleted={done}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
