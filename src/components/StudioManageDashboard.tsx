"use client";

import Link from "next/link";
import { useState } from "react";
import { answerShiftRequest, type GymWeekDto, type ShiftRequestDto } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

export function StudioManageDashboard({
  studioName, studioSlug, registrationPro, hasAccount, week, classCount, openShiftCount, staffCount, requests, admin,
}: {
  studioName: string;
  studioSlug: string;
  hasAccount: boolean;
  registrationPro?: boolean;
  week: GymWeekDto | null;
  classCount: number;
  openShiftCount: number;
  staffCount: number;
  requests: ShiftRequestDto[];
  admin: { studio: StudioEditProps; showCoaches?: boolean; approvalOn?: boolean };
}) {
  const base = `/s/${studioSlug}/manage`;
  const [toDo, setToDo] = useState(requests);
  const [answering, setAnswering] = useState<string | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const coveredCount = Math.max(0, classCount - openShiftCount);
  const coverage = classCount ? Math.round(coveredCount / classCount * 100) : 0;
  const maxDayCount = Math.max(1, ...week?.days.map(day => day.closed ? 0 : day.items.length) ?? []);

  const answer = async (requestId: string, approve: boolean) => {
    if (answering) return;
    setAnswering(requestId);
    const result = await answerShiftRequest(requestId, approve);
    setAnswering(null);
    if (!result.ok) {
      toast(result.error ?? "Couldn't answer that request");
      return;
    }
    setToDo((current) => current.filter((request) => request.id !== requestId));
    toast(approve ? "Approved" : "Denied");
  };

  return (
    <main className="studio-dashboard">
      <div className="studio-manage-top pagetop">
        <div className="studio-dashboard-hero">
          <BackLink className="evback studio-manage-back" href={`/s/${studioSlug}`} anywhere notUnder={base} label="Back">
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <span className="studio-dashboard-photo">
            {admin.studio.photo ? <img src={admin.studio.photo} alt="" /> : <Icon name="storefront" size={42} />}
          </span>
          <h2>{studioName}</h2>
          <span className="studio-dashboard-admin-badge">Studio admin</span>
        </div>
      </div>

      <header className="studio-dashboard-heading">
        <div><h1>Dashboard</h1><p>{week?.label ?? "Your studio at a glance"}</p></div>
        <Link className="studio-dashboard-calendar-link" href={`${base}/calendar?show=all`} prefetch={false}><Icon name="calendar_month" size={19} />Open calendar</Link>
      </header>

      <dl className="studio-dashboard-stats">
        <div><dt>Classes this week</dt><dd>{classCount}</dd><small>On open studio days</small></div>
        <div><dt>Open shifts</dt><dd>{openShiftCount}</dd><small>Still need a coach</small></div>
        <div><dt><Link href={`${base}/staff`}>Teaching team</Link></dt><dd>{staffCount}</dd><small>{staffCount === 1 ? "Team member" : "Team members"}</small></div>
        <div><dt>Pending requests</dt><dd>{toDo.length}</dd><small>Waiting for your decision</small></div>
      </dl>

      <div className="studio-dashboard-panels">
        <section className="studio-dashboard-panel" aria-labelledby="studio-week-title">
          <h2 id="studio-week-title">This week</h2>
          {week && classCount > 0 ? <>
            <div className="studio-dashboard-week">
              {week.days.map(day => <div key={day.iso} className="studio-dashboard-day">
                <span>{new Date(`${day.iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday:"short", timeZone:"UTC" })}</span>
                <div className="studio-dashboard-bar" aria-hidden="true"><i style={{height:`${day.closed ? 0 : day.items.length / maxDayCount * 100}%`}} /></div>
                <strong>{day.closed ? "Closed" : day.items.length}</strong>
              </div>)}
            </div>
            <p className="studio-dashboard-note">Planned classes, including drafts. Closed days are excluded.</p>
          </> : <div className="studio-dashboard-empty"><p>{hasAccount ? "No classes planned this week." : "Your schedule starts here."}</p><Link href={`${base}/calendar`}>{hasAccount ? "Plan this week" : "Set up your calendar"}<Icon name="arrow_forward" size={17}/></Link></div>}
        </section>
        <section className="studio-dashboard-panel" aria-labelledby="studio-coverage-title">
          <h2 id="studio-coverage-title">Coach coverage</h2>
          {classCount > 0 ? <>
            <div className="studio-dashboard-coverage"><strong>{coverage}%</strong><span>{coveredCount} of {classCount} classes assigned</span></div>
            <progress value={coveredCount} max={classCount} aria-label="Classes with an assigned coach" />
            <p>{openShiftCount ? `${openShiftCount} ${openShiftCount === 1 ? "class needs" : "classes need"} a coach this week.` : "Every class has a coach. You're all set!"}</p>
            {openShiftCount > 0 && <Link className="studio-dashboard-text-link" href={`${base}/calendar?show=open&view=week`}>Review open shifts<Icon name="arrow_forward" size={17}/></Link>}
          </> : <p className="studio-dashboard-note">Coverage will appear once you add classes to the calendar.</p>}
        </section>
      </div>

      {registrationPro && <Link className="studio-dashboard-card studio-dashboard-frontdesk" href={`${base}/registrations`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="groups" size={28}/></span><span className="studio-dashboard-card-copy"><strong>Front desk</strong><small>Welcome attendees, share signup QR codes, and check people in.</small></span><Icon name="arrow_forward" size={22}/></Link>}

      {toDo.length > 0 && (
        <section className="studio-dashboard-todo" aria-labelledby="studio-todo-title">
          <div className="studio-dashboard-todo-head">
            <div>
              <h2 id="studio-todo-title">Needs attention</h2>
              <p>Things that need your attention</p>
            </div>
            <span>{toDo.length}</span>
          </div>
          <div className="studio-dashboard-todo-list">
            {toDo.map((request) => (
              <div className="studio-dashboard-todo-row" key={request.id}>
                <span className="studio-dashboard-todo-copy">
                  <strong>
                    {request.kind === "pickup"
                      ? `${request.toName} wants ${request.className}`
                      : request.scope === "standing"
                        ? `${request.fromName ?? "A coach"} wants to make ${request.toName} the regular coach for ${request.className}`
                        : `${request.fromName ?? "A coach"} is handing ${request.className} to ${request.toName}`}
                  </strong>
                  <small>{request.whenLong}</small>
                </span>
                <span className="studio-dashboard-todo-actions">
                  <button disabled={!!answering} onClick={() => void answer(request.id, true)}>Approve</button>
                  <button disabled={!!answering} onClick={() => void answer(request.id, false)}>Deny</button>
                </span>
              </div>
            ))}
          </div>

        </section>
      )}

      {toDo.length === 0 && <section className="studio-dashboard-panel studio-dashboard-all-clear"><Icon name="event_available" size={24}/><div><h2>You’re all caught up</h2><p>No shift requests waiting for approval.</p></div></section>}

      <section className="studio-dashboard-settings">
        <h2>Settings</h2>
        <div className="settingslist">
          <Link className="setrow" href={`/s/${studioSlug}`}><span className="setrow-ic"><Icon name="storefront" size={24} /></span><span className="setrow-txt"><span className="t">View studio profile</span><span className="s">See the public page</span></span><span className="setrow-chev"><Icon name="chevron_right" size={22} /></span></Link>
          <StudioAdminSheet slug={studioSlug} canSchedule={hasAccount} studio={admin.studio} showCoaches={admin.showCoaches} approvalOn={admin.approvalOn} dashboardTrigger />
        </div>
      </section>
      <Toast msg={toastMsg} on={toastOn} />
    </main>
  );
}
