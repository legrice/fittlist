"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addGymClass,
  deleteGymClass,
  updateGymClass,
  type GymClassDto,
  type GymCoachDto,
} from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  coachUserId: string;
};

const blank = (dayOfWeek: number): Draft => ({
  id: null,
  name: "",
  dayOfWeek,
  startTime: "06:00",
  durationMin: 60,
  coachUserId: "",
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
  hasAccount,
  classes,
  coaches,
}: {
  studioId: string;
  studioName: string;
  backHref: string;
  hasAccount: boolean;
  classes: GymClassDto[];
  coaches: GymCoachDto[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const byDay = DAYS.map((_, d) => classes.filter((c) => c.dayOfWeek === d));
  const assigned = classes.filter((c) => c.coachUserId).length;
  const open = classes.length - assigned;

  const save = () => {
    if (!draft || pending) return;
    const input = {
      name: draft.name,
      dayOfWeek: draft.dayOfWeek,
      startTime: draft.startTime,
      durationMin: draft.durationMin,
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
            {classes.length === 0
              ? "The week is empty"
              : `${classes.length} ${classes.length === 1 ? "class" : "classes"} a week` +
                (open ? ` · ${open} with nobody on` : "")}
          </p>
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      <div className="rota">
        {DAYS.map((day, d) => (
          <div key={day} className="rotaday">
            <div className="rotaday-h">
              <span>{day}</span>
              <button className="rotaadd" onClick={() => setDraft(blank(d))}>
                <Icon name="add" size={16} /> Add
              </button>
            </div>
            {byDay[d].length === 0 ? (
              <p className="rotaempty">Nothing on</p>
            ) : (
              byDay[d].map((c) => (
                <button
                  key={c.id}
                  className={`rotarow${c.coachUserId ? "" : " rotaopen"}`}
                  onClick={() =>
                    setDraft({
                      id: c.id,
                      name: c.name,
                      dayOfWeek: c.dayOfWeek,
                      startTime: c.startTime,
                      durationMin: c.durationMin,
                      coachUserId: c.coachUserId ?? "",
                    })
                  }
                >
                  <span className="rotarow-t">{fmtTime(c.startTime)}</span>
                  <span className="rotarow-main">
                    <span className="rotarow-nm">{c.name}</span>
                    <span className="rotarow-who">
                      {c.coachName || "Nobody on it yet"}
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
            <h2 style={{ marginTop: 10 }}>{draft.id ? "This class" : "Add a class"}</h2>

            <label className="fieldlabel" htmlFor="rotaName">
              What is it
            </label>
            <input
              id="rotaName"
              className="input"
              placeholder="e.g. Guns, Buns, and Lungs"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />

            <label className="fieldlabel">Day</label>
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
                <label className="fieldlabel" htmlFor="rotaTime">
                  Starts
                </label>
                <input
                  id="rotaTime"
                  className="input"
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="fieldlabel" htmlFor="rotaDur">
                  Minutes
                </label>
                <input
                  id="rotaDur"
                  className="input"
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

            <label className="fieldlabel" htmlFor="rotaCoach">
              Who&rsquo;s coaching
            </label>
            <select
              id="rotaCoach"
              className="input"
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
            <p className="fieldhint">
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
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
