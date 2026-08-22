"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStandardCalendar, type StandardCalendarSlot } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function StandardCalendarEditor({ studioId, backHref, initial }: {
  studioId: string;
  backHref: string;
  initial: Record<string, StandardCalendarSlot[]>;
}) {
  const [week, setWeek] = useState(initial);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();
  const update = (day: number, index: number, patch: Partial<StandardCalendarSlot>) =>
    setWeek((current) => ({ ...current, [day]: (current[day] ?? []).map((slot, i) => i === index ? { ...slot, ...patch } : slot) }));
  const add = (day: number) => setWeek((current) => ({
    ...current,
    [day]: [...(current[day] ?? []), { name: "", startTime: "06:00", durationMin: 60, plannerColor: null }],
  }));
  const remove = (day: number, index: number) => setWeek((current) => ({
    ...current, [day]: (current[day] ?? []).filter((_, i) => i !== index),
  }));
  const save = () => start(async () => {
    const result = await setStandardCalendar(studioId, week);
    if (!result.ok) return toast(result.error ?? "Couldn't save the standard calendar");
    toast("Standard calendar saved");
    router.refresh();
  });
  return <div className="pad standard-calendar-pad">
    <div className="studio-manage-top pagetop"><div className="studio-manage-topbar">
      <BackLink className="evback studio-manage-back" href={backHref} label="Back to studio dashboard"><Icon name="arrow_back" size={23} /></BackLink>
      <h1 className="studio-calendar-title">Standard calendar</h1><span className="studio-top-spacer" />
    </div></div>
    <p className="standard-calendar-note">This is the class schedule used as your weekly source. Coach assignments stay on the live calendar and do not change here.</p>
    <div className="standard-calendar-week">
      {DAYS.map((label, day) => <section className="standard-calendar-day" key={label}>
        <header><h2>{label}</h2><button type="button" onClick={() => add(day)}><Icon name="add" size={20} />Add class</button></header>
        {(week[day] ?? []).length ? (week[day] ?? []).map((slot, index) => <div className="standard-calendar-slot" key={`${day}-${index}`}>
          <input aria-label={`${label} class name`} value={slot.name} placeholder="Class name" onChange={(event) => update(day, index, { name: event.target.value })} />
          <input aria-label={`${label} start time`} type="time" value={slot.startTime} onChange={(event) => update(day, index, { startTime: event.target.value })} />
          <label><input aria-label={`${label} duration`} type="number" min="5" max="600" step="5" value={slot.durationMin} onChange={(event) => update(day, index, { durationMin: Number(event.target.value) })} /><span>min</span></label>
          <button type="button" aria-label={`Remove ${slot.name || "class"}`} onClick={() => remove(day, index)}><Icon name="delete" size={19} /></button>
        </div>) : <p>No standard classes.</p>}
      </section>)}
    </div>
    <div className="publishwrap"><button className="btn si" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save standard calendar"}</button></div>
    <Toast msg={toastMsg} on={toastOn} />
  </div>;
}
