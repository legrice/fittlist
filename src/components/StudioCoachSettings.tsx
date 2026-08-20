"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeStudioCoach,
  setStudioCoachScheduled,
  type StudioCoachDetailDto,
} from "@/app/actions/gym";
import { AgendaAvatar } from "@/components/Agenda";
import { BackLink } from "@/components/BackLink";
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const staffHref = `/s/${studioSlug}/manage/staff`;

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

  return (
    <div className="pad studio-staff-pad studio-coach-settings">
      <div className="studio-manage-top pagetop">
        <BackLink className="evback studio-manage-back" href={staffHref} label="Back to staff">
          <Icon name="arrow_back" size={23} />
        </BackLink>
        <div className="studio-coach-heading">
          <AgendaAvatar
            photo={coach.photo}
            name={coach.name}
            color={coach.color ?? "var(--color-text-secondary)"}
            cls="studio-coach-avatar"
          />
          <div>
            <h1>{coach.name}</h1>
            <p className="adminsub">{studioName}</p>
          </div>
        </div>
      </div>

      <StudioManageNav slug={studioSlug} active="staff" />

      <div className="rotaweek studio-coach-month">
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
          <div className="n">{coach.total}</div>
          <div className="l">Total shifts</div>
        </div>
        <div className="stat">
          <div className="n">{coach.first}</div>
          <div className="l">{coach.firstLabel}</div>
        </div>
        <div className="stat">
          <div className="n">{coach.second}</div>
          <div className="l">{coach.secondLabel}</div>
        </div>
      </div>

      <h3 className="setgroup-h">Coach settings</h3>
      <div className="settingslist">
        <button
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
        </button>
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
              They will no longer be associated with this studio. Reassign or open any future
              shifts first.
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
