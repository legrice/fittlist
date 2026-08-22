"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeStudioCoach,
  setShiftCover,
  setStudioCoachScheduled,
  type StudioCoachDetailDto,
} from "@/app/actions/gym";
import { AgendaAvatar } from "@/components/Agenda";
import { Icon } from "@/components/Icon";
import { StudioManageNav } from "@/components/StudioManageNav";
import { Toast, useToast } from "@/components/Toast";

const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function StudioCoachSettings({
  studioId,
  studioName,
  studioSlug,
  coach,
}: {
  studioId: string;
  studioName: string;
  studioSlug: string;
  coach: StudioCoachDetailDto;
}) {
  const router = useRouter();
  const [onSchedule, setOnSchedule] = useState(coach.onSchedule);
  const [shifts, setShifts] = useState(coach.shifts);
  const [savingShift, setSavingShift] = useState<Record<string, true>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const staffHref = `/s/${studioSlug}/manage/staff`;

  useEffect(() => {
    setShifts(coach.shifts);
  }, [coach.shifts]);

  const assignShift = (classId: string, date: string, who: string) => {
    const key = `${classId}:${date}`;
    if (savingShift[key]) return;
    setSavingShift((current) => ({ ...current, [key]: true }));
    void (async () => {
      const result = await setShiftCover(studioId, classId, date, who || null);
      if (!result.ok) {
        toast(result.error ?? "Couldn't change that shift");
      } else {
        const nextCoach = coach.coaches.find((person) => person.id === who);
        setShifts((current) => current.filter((shift) => `${shift.classId}:${shift.date}` !== key));
        toast(nextCoach ? `Reassigned to ${nextCoach.name}` : "Shift is open");
        router.refresh();
      }
      setSavingShift((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    })();
  };

  const toggleSchedule = () => {
    const next = !onSchedule;
    setOnSchedule(next);
    start(async () => {
      const result = await setStudioCoachScheduled(studioId, coach.id, next);
      if (!result.ok) {
        setOnSchedule(!next);
        toast(result.error ?? "Couldn't save that");
        return;
      }
      toast(next ? "They can be scheduled" : "Removed from the schedule");
      router.refresh();
    });
  };

  const remove = () => {
    setConfirmRemove(false);
    start(async () => {
      const result = await removeStudioCoach(studioId, coach.id);
      if (!result.ok) {
        toast(result.error ?? "Couldn't remove them");
        return;
      }
      router.replace(staffHref);
      router.refresh();
    });
  };

  const pendingInvite = coach.state === "placeholder" || coach.state === "invited";
  const isCoach = coach.role === "coach";
  const coachOptions = coach.coaches.some((person) => person.id === coach.id)
    ? coach.coaches
    : [{ id: coach.id, name: coach.name, email: coach.email ?? "" }, ...coach.coaches];

  return (
    <div className="pad studio-staff-pad studio-coach-settings">
      <div className="studio-manage-top pagetop">
        <Link
          className="evback studio-manage-back"
          href={staffHref}
          replace
          aria-label="Back to staff"
        >
          <Icon name="arrow_back" size={23} />
        </Link>
        <div className="studio-coach-heading">
          <AgendaAvatar
            photo={coach.photo}
            name={coach.name}
            color={coach.color ?? "var(--color-text-secondary)"}
            cls="studio-coach-avatar"
          />
          <div>
            <h1>{coach.name}</h1>
            <p className="adminsub">{isCoach ? studioName : `Front desk · ${studioName}`}</p>
          </div>
        </div>
      </div>

      <StudioManageNav slug={studioSlug} active="staff" />

      {isCoach && <><div className="rotaweek studio-coach-month">
        <Link className="rotanav" href={`${staffHref}/${coach.id}?m=${shiftMonth(coach.month, -1)}`}>
          <Icon name="chevron_left" size={20} />
        </Link>
        <span className="rotaweek-lbl">{coach.monthLabel} shifts</span>
        <Link className="rotanav" href={`${staffHref}/${coach.id}?m=${shiftMonth(coach.month, 1)}`}>
          <Icon name="chevron_right" size={20} />
        </Link>
      </div>

      <div className="statgrid studio-coach-stats">
        <div className="stat">
          <div className="n">{shifts.length}</div>
          <div className="l">Total shifts</div>
        </div>
        <div className="stat">
          <div className="n">{shifts.filter((shift) => Number(shift.date.slice(8, 10)) <= 15).length}</div>
          <div className="l">{coach.firstLabel}</div>
        </div>
        <div className="stat">
          <div className="n">{shifts.filter((shift) => Number(shift.date.slice(8, 10)) > 15).length}</div>
          <div className="l">{coach.secondLabel}</div>
        </div>
      </div>

      <h3 className="setgroup-h studio-coach-shifts-title">Shifts in {coach.monthLabel}</h3>
      {shifts.length ? (
        <div className="studio-coach-shifts">
          {shifts.map((shift) => {
            const key = `${shift.classId}:${shift.date}`;
            const [hourRaw, minute] = shift.startTime.split(":").map(Number);
            const suffix = hourRaw >= 12 ? "PM" : "AM";
            const hour = hourRaw % 12 || 12;
            return (
              <article
                className="studio-coach-shift"
                data-planner-color={shift.plannerColor ?? undefined}
                key={key}
              >
                <div className="studio-coach-shift-copy">
                  <span className="studio-coach-shift-when">
                    {shift.dateLabel} · {hour}:{String(minute).padStart(2, "0")} {suffix}
                  </span>
                  <strong>{shift.name}</strong>
                  <span className="studio-coach-shift-status">
                    {shift.covered ? "One-time assignment" : "Regular shift"}
                    {!shift.isPublic && " · Draft"}
                  </span>
                </div>
                <label className="studio-coach-shift-picker">
                  <span className="sr-only">Assign {shift.name} on {shift.dateLabel}</span>
                  <select
                    aria-label={`Assign ${shift.name} on ${shift.dateLabel}`}
                    defaultValue={coach.id}
                    disabled={!!savingShift[key]}
                    onChange={(event) => assignShift(shift.classId, shift.date, event.target.value)}
                  >
                    <option value="">Open</option>
                    {coachOptions.map((person) => (
                      <option value={person.id} key={person.id}>{person.name}</option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="adminempty studio-coach-shifts-empty">
          {coach.name} has no shifts at {studioName} in {coach.monthLabel}.
        </p>
      )}
      </>}

      <h3 className="setgroup-h">{isCoach ? "Coach settings" : "Staff settings"}</h3>
      <div className="settingslist">
        {isCoach && <button
          className="setrow"
          role="switch"
          aria-checked={onSchedule}
          disabled={pending}
          onClick={toggleSchedule}
        >
          <span className="setrow-txt">
            <span className="t">Can be scheduled</span>
            <span className="s">
              {pendingInvite
                ? onSchedule
                  ? "Can be assigned now; staff tools unlock after they join"
                  : "Invite is pending and they cannot be assigned"
                : onSchedule
                  ? "Can be assigned classes and pick up open shifts"
                  : "Still associated with the studio, but cannot be assigned"}
            </span>
          </span>
          <span className={`switch${onSchedule ? " on" : ""}`} aria-hidden="true">
            <span className="switch-knob" />
          </span>
        </button>}
        {coach.email && (
          <div className="setrow">
            <span className="setrow-txt">
              <span className="t">{pendingInvite ? "Invite pending" : "Email"}</span>
              <span className="s">{coach.email}</span>
            </span>
          </div>
        )}
      </div>

      <button className="tertiary studio-coach-remove" disabled={pending} onClick={() => setConfirmRemove(true)}>
        Remove from studio
      </button>

      {confirmRemove && (
        <div className="sheet-scrim" onClick={(event) => {
          if (event.target === event.currentTarget) setConfirmRemove(false);
        }}>
          <div className="sheet confirmsheet">
            <h2>Remove {coach.name}?</h2>
            <p className="lead">
              {isCoach
                ? "They will no longer be associated with this studio. Reassign or open any future shifts first."
                : "They will no longer be associated with this studio."}
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={remove}>Remove {coach.name}</button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirmRemove(false)}>
                Keep them
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
