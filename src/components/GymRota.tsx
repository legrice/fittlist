"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addGymClass,
  deleteGymClass,
  setShiftCover,
  updateGymClass,
  type GymCatalogItem,
  type GymClassDto,
  type GymCoachDto,
  type GymWeekDto,
} from "@/app/actions/gym";
import { CLASS_TYPES, detectProvider } from "@/lib/format";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Thu, Aug 6" — the date a swap is about, said the way a person would. */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const fmtTime = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ap}`;
};

type Draft = {
  id: string | null;
  name: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  classType: string;
  description: string;
  links: { label: string; url: string }[];
  /** Who normally teaches it. */
  coachUserId: string;
  /** The date being looked at, and who is on it that day. */
  iso: string;
  onUserId: string;
  covered: boolean;
};

const blank = (dayOfWeek: number, iso: string): Draft => ({
  id: null,
  name: "",
  dayOfWeek,
  startTime: "06:00",
  durationMin: 60,
  classType: "",
  description: "",
  links: [],
  coachUserId: "",
  iso,
  onUserId: "",
  covered: false,
});

// The rota: the thing the spreadsheet was for. A week of slots, each one a
// class and the person on it, and both are two taps to change. That is the one
// thing the spreadsheet was genuinely good at, so it is the thing to keep.
//
// Who is on a slot drives the shift, the notification and the calendar. It is
// not what the public sees: the gym's schedule goes out under the gym's name,
// and showing coaches is a separate switch with the coach's own say in it.
export function GymRota({
  studioId,
  studioName,
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const typeOptions = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...CLASS_TYPES, ...customTypes, ...(draft?.classType ? [draft.classType] : [])]) {
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  })();

  const days = week?.days ?? [];
  const all = days.flatMap((d) => d.items);
  const open = all.filter((c) => !c.onUserId).length;

  const save = () => {
    if (!draft || pending) return;
    const input = {
      name: draft.name,
      dayOfWeek: draft.dayOfWeek,
      startTime: draft.startTime,
      durationMin: draft.durationMin,
      classType: draft.classType || null,
      description: draft.description,
      links: draft.links,
      coachUserId: draft.coachUserId || null,
    };
    start(async () => {
      const res = draft.id
        ? await updateGymClass(studioId, draft.id, input)
        : await addGymClass(studioId, input);
      if (!res.ok) {
        toast(res.error ?? "Couldn't save that");
        return;
      }
      setDraft(null);
      toast(draft.id ? "Saved" : "Added to the week");
      router.refresh();
    });
  };

  // Who's on this one date. A swap is about a date, so it never touches the
  // standing rota; setting it back to the regular coach clears the exception.
  const cover = (who: string) => {
    if (!draft?.id || pending) return;
    start(async () => {
      const res = await setShiftCover(studioId, draft.id!, draft.iso, who || null);
      if (!res.ok) {
        toast(res.error ?? "Couldn't change that");
        return;
      }
      setDraft({ ...draft, onUserId: who, covered: who !== draft.coachUserId });
      toast(who ? "Swapped" : "Opened up");
      router.refresh();
    });
  };

  const remove = () => {
    if (!draft?.id || pending) return;
    start(async () => {
      const res = await deleteGymClass(studioId, draft.id!);
      if (!res.ok) {
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      setDraft(null);
      toast("Taken off the week");
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
          <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio">
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

  return (
    <div className="pad">
      <div className="admintop pagetop">
        <div>
          <h1>{studioName}</h1>
          <p className="adminsub">
            {all.length === 0
              ? "The week is empty"
              : `${all.length} ${all.length === 1 ? "class" : "classes"}` +
                (open ? ` · ${open} with nobody on` : "")}
          </p>
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      {/* Counted from this schedule rather than tallied by hand, which is the
          whole reason the rota is worth keeping here. */}
      <Link className="btn ghost rotacounts" href={`${manageBase}/counts`}>
        <Icon name="calendar_month" size={17} /> Shifts worked
      </Link>

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

      <div className="rota">
        {days.map((day, d) => (
          <div key={day.iso} className="rotaday">
            <div className="rotaday-h">
              <span>{day.label}</span>
              <button className="rotaadd" onClick={() => setDraft(blank(d, day.iso))}>
                <Icon name="add" size={16} /> Add
              </button>
            </div>
            {day.items.length === 0 ? (
              <p className="rotaempty">Nothing on</p>
            ) : (
              day.items.map((c) => (
                <button
                  key={c.id}
                  className={`rotarow${c.onUserId ? "" : " rotaopen"}`}
                  onClick={() =>
                    setDraft({
                      id: c.id,
                      name: c.name,
                      dayOfWeek: c.dayOfWeek,
                      startTime: c.startTime,
                      durationMin: c.durationMin,
                      classType: c.classType ?? "",
                      description: c.description ?? "",
                      links: c.links.map((l) => ({ ...l })),
                      coachUserId: c.coachUserId ?? "",
                      iso: day.iso,
                      onUserId: c.onUserId ?? "",
                      covered: c.covered,
                    })
                  }
                >
                  <span className="rotarow-t">{fmtTime(c.startTime)}</span>
                  <span className="rotarow-main">
                    <span className="rotarow-nm">{c.name}</span>
                    <span className="rotarow-who">
                      {c.onName || "Nobody on it yet"}
                      {c.covered && <span className="rotaswap">covering</span>}
                    </span>
                  </span>
                  <span className="rotarow-dur">{c.durationMin} min</span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>

      {draft && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDraft(null);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setDraft(null)}>
              <Icon name="close" size={16} />
            </button>
            <h2 style={{ marginTop: 10 }}>{draft.id ? draft.name : "Add a class"}</h2>

            {/* This one date first: it is what a manager opens the rota to
                change. The standing class is underneath, because changing it
                changes every week. */}
            {draft.id && (
              <>
                <label className="flabel" htmlFor="rotaOn">
                  Who&rsquo;s on {fmtDay(draft.iso)}
                </label>
                <select
                  id="rotaOn"
                  className="editinput"
                  value={draft.onUserId}
                  disabled={pending}
                  onChange={(e) => cover(e.target.value)}
                >
                  <option value="">Nobody yet</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.id === draft.coachUserId ? " (usually)" : ""}
                    </option>
                  ))}
                </select>
                <p className="rotahint">
                  {draft.covered
                    ? "Just this one. The standing rota is unchanged, and both of them have been told."
                    : "Changing this only changes this date. Whoever it moves to and from hears about it."}
                </p>
                <h3 className="rotasec-h">Every week</h3>
              </>
            )}

            {/* Somebody here has already written this class down. Pull it in
                rather than typing it again, and the descriptions stay the same
                everywhere the class appears. */}
            {!draft.id && catalog.length > 0 && (
              <>
                <label className="flabel" htmlFor="rotaPull">
                  Pull one in <span>· classes already described here</span>
                </label>
                <select
                  id="rotaPull"
                  className="editinput"
                  value=""
                  onChange={(e) => {
                    const c = catalog.find((x) => x.name === e.target.value);
                    if (!c) return;
                    setDraft({
                      ...draft,
                      name: c.name,
                      classType: c.classType ?? "",
                      description: c.description ?? "",
                      links: c.links.map((l) => ({ ...l })),
                    });
                  }}
                >
                  <option value="">Start from scratch</option>
                  {catalog.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="flabel" htmlFor="rotaName">
              What is it
            </label>
            <input
              id="rotaName"
              className="editinput"
              placeholder="e.g. Guns, Buns, and Lungs"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />

            <label className="flabel">
              Day <span>· it runs this day every week</span>
            </label>
            <div className="daypick">
              {SHORT.map((s, i) => (
                <button
                  key={s}
                  className={`chip${draft.dayOfWeek === i ? " sel" : ""}`}
                  onClick={() => setDraft({ ...draft, dayOfWeek: i })}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="rotatimes">
              <div>
                <label className="flabel" htmlFor="rotaTime">
                  Starts
                </label>
                <input
                  id="rotaTime"
                  className="editinput"
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="flabel" htmlFor="rotaDur">
                  Minutes
                </label>
                <input
                  id="rotaDur"
                  className="editinput"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  value={draft.durationMin}
                  onChange={(e) =>
                    setDraft({ ...draft, durationMin: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <label className="flabel" htmlFor="rotaType">
              Type
            </label>
            <select
              id="rotaType"
              className="editinput"
              value={draft.classType}
              onChange={(e) => setDraft({ ...draft, classType: e.target.value })}
            >
              <option value="">Not set</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label className="flabel" htmlFor="rotaDesc">
              Description <span>· what to expect</span>
            </label>
            <textarea
              id="rotaDesc"
              className="editinput abouttext"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />

            <label className="flabel">
              Booking link <span>· paste any link, we tag it</span>
            </label>
            <div>
              {draft.links.map((l, i) => (
                <div className="linkrow" key={i}>
                  <div className="linkfield">
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="Paste a link"
                      aria-label="Booking link"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={l.url}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          links: draft.links.map((x, xi) =>
                            xi === i
                              ? { url: e.target.value, label: detectProvider(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                    {l.url.trim() && (
                      <span className="linktag">
                        <Icon name="check" size={13} /> {detectProvider(l.url)}
                      </span>
                    )}
                  </div>
                  <button
                    className="iconbtn"
                    aria-label="Remove link"
                    onClick={() =>
                      setDraft({ ...draft, links: draft.links.filter((_, xi) => xi !== i) })
                    }
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <button
                className="linktoggle"
                onClick={() =>
                  setDraft({ ...draft, links: [...draft.links, { url: "", label: "Book" }] })
                }
              >
                + Add a link
              </button>
            </div>

            <label className="flabel" htmlFor="rotaCoach">
              {draft.id ? "Who normally coaches it" : "Who\u2019s coaching"}
            </label>
            <select
              id="rotaCoach"
              className="editinput"
              value={draft.coachUserId}
              onChange={(e) => setDraft({ ...draft, coachUserId: e.target.value })}
            >
              <option value="">Nobody yet</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="rotahint">
              They&rsquo;ll be told, and it lands in their calendar. Your schedule goes out under
              the gym&rsquo;s name, so this stays between you and them.
            </p>

            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending || !draft.name.trim()} onClick={save}>
                {pending ? "Saving…" : draft.id ? "Save" : "Add it"}
              </button>
            </div>
            {draft.id && (
              <button className="tertiary tellsheet-done" disabled={pending} onClick={remove}>
                Take it off the week
              </button>
            )}
            {!draft.id && (
              <p className="rotahint" style={{ textAlign: "center" }}>
                It repeats weekly from now on. Swap or open a single date from the week itself.
              </p>
            )}
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
