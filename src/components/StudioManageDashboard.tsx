"use client";

import Link from "next/link";
import { useState } from "react";
import { answerShiftRequest, type ShiftRequestDto } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

export function StudioManageDashboard({
  studioName, studioSlug, hasAccount, classCount, openShiftCount, staffCount, requests, admin,
}: {
  studioName: string;
  studioSlug: string;
  hasAccount: boolean;
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
  const classSummary = hasAccount
    ? `${classCount} ${classCount === 1 ? "class" : "classes"} this week`
    : "Set up classes and coach coverage";
  const openShiftSummary = openShiftCount === 0
    ? "No open shifts this week"
    : `${openShiftCount} open ${openShiftCount === 1 ? "shift" : "shifts"} this week`;

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
          <BackLink className="evback studio-manage-back" href="/you" anywhere notUnder={`/s/${studioSlug}`} label="Back to your profile">
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <span className="studio-dashboard-photo">
            {admin.studio.photo ? <img src={admin.studio.photo} alt="" /> : <Icon name="storefront" size={42} />}
          </span>
          <h1>{studioName}</h1>
        </div>
      </div>

      <div className="studio-dashboard-grid">
        <Link className="studio-dashboard-card" href={`${base}/calendar?show=all`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="calendar_month" size={28} /></span><span className="studio-dashboard-card-copy"><strong>Calendar</strong><small>{classSummary}</small></span><Icon name="arrow_forward" size={22} /></Link>
        <Link className="studio-dashboard-card" href={`${base}/calendar?show=open&view=week`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="event_available" size={28} /></span><span className="studio-dashboard-card-copy"><strong>Open shifts</strong><small>{openShiftSummary}</small></span><Icon name="arrow_forward" size={22} /></Link>
        <Link className="studio-dashboard-card" href={`/s/${studioSlug}/shifts?preview=coach`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="visibility" size={28} /></span><span className="studio-dashboard-card-copy"><strong>Coach view</strong><small>See your shifts and open coverage as coaches do</small></span><Icon name="arrow_forward" size={22} /></Link>
        <Link className="studio-dashboard-card" href={`${base}/staff`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="groups" size={28} /></span><span className="studio-dashboard-card-copy"><strong>Staff</strong><small>{staffCount} {staffCount === 1 ? "person" : "people"} on your coaching team</small></span><Icon name="arrow_forward" size={22} /></Link>
        <Link className="studio-dashboard-card" href={`${base}/counts`} prefetch={false}><span className="studio-dashboard-card-icon"><Icon name="activity" size={28} /></span><span className="studio-dashboard-card-copy"><strong>Class counts</strong><small>Review coaching totals by month</small></span><Icon name="arrow_forward" size={22} /></Link>
      </div>

      {toDo.length > 0 && (
        <section className="studio-dashboard-todo" aria-labelledby="studio-todo-title">
          <div className="studio-dashboard-todo-head">
            <div>
              <h2 id="studio-todo-title">To do</h2>
              <p>Things that need your attention</p>
            </div>
            <span>{toDo.length}</span>
          </div>
          <div className="studio-dashboard-todo-list">
            {toDo.slice(0, 3).map((request) => (
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
          {toDo.length > 3 && <p className="studio-dashboard-todo-more">{toDo.length - 3} more waiting</p>}
        </section>
      )}

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
