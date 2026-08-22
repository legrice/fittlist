import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { StudioEditProps } from "@/components/StudioOwnerBar";

export function StudioManageDashboard({
  studioName, studioSlug, hasAccount, classCount, openShiftCount, staffCount, requestCount, admin,
}: {
  studioName: string;
  studioSlug: string;
  hasAccount: boolean;
  classCount: number;
  openShiftCount: number;
  staffCount: number;
  requestCount: number;
  admin: { studio: StudioEditProps; showCoaches?: boolean; approvalOn?: boolean };
}) {
  const base = `/s/${studioSlug}/manage`;
  const classSummary = hasAccount
    ? `${classCount} ${classCount === 1 ? "class" : "classes"} this week${openShiftCount ? ` · ${openShiftCount} open` : ""}`
    : "Set up classes and coach coverage";

  return (
    <main className="pad studio-dashboard">
      <div className="studio-manage-top pagetop">
        <div className="studio-manage-topbar">
          <BackLink className="evback studio-manage-back" href="/settings" anywhere notUnder={`/s/${studioSlug}`} label="Back to your account">
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <StudioAdminSheet
            slug={studioSlug}
            canSchedule={hasAccount}
            studio={admin.studio}
            showCoaches={admin.showCoaches}
            approvalOn={admin.approvalOn}
            settingsTrigger
          />
        </div>
        <div>
          <h1>{studioName}</h1>
        </div>
      </div>

      {requestCount > 0 && (
        <Link className="studio-dashboard-alert" href={`${base}/calendar?panel=notifications`}>
          <span className="studio-dashboard-alert-icon"><Icon name="notifications" size={20} /></span>
          <span><strong>{requestCount} shift {requestCount === 1 ? "request" : "requests"}</strong><small>Waiting for your review</small></span>
          <Icon name="chevron_right" size={22} />
        </Link>
      )}

      <div className="studio-dashboard-grid">
        <Link className="studio-dashboard-card primary" href={`${base}/calendar`} prefetch={false}>
          <span className="studio-dashboard-card-icon"><Icon name="calendar_month" size={28} /></span>
          <span className="studio-dashboard-card-copy"><strong>Calendar</strong><small>{classSummary}</small></span>
          <Icon name="arrow_forward" size={22} />
        </Link>
        <Link className="studio-dashboard-card" href={`${base}/staff`} prefetch={false}>
          <span className="studio-dashboard-card-icon"><Icon name="groups" size={28} /></span>
          <span className="studio-dashboard-card-copy"><strong>Staff</strong><small>{staffCount} {staffCount === 1 ? "person" : "people"} on your coaching team</small></span>
          <Icon name="arrow_forward" size={22} />
        </Link>
        <Link className="studio-dashboard-card" href={`${base}/counts`} prefetch={false}>
          <span className="studio-dashboard-card-icon"><Icon name="activity" size={28} /></span>
          <span className="studio-dashboard-card-copy"><strong>Class counts</strong><small>Review coaching totals by month</small></span>
          <Icon name="arrow_forward" size={22} />
        </Link>
      </div>
    </main>
  );
}
