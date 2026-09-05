"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStudioManager,
  removeStudioManager,
  saveStandardWeek,
  setStudioShiftApproval,
  searchStudioManagerCandidates,
  studioManagersForSettings,
  studioPageViews,
  transferStudioOwnership,
  type StaffPerson,
  type StudioManagerCandidate,
} from "@/app/actions/gym";
import { setStudioShowCoaches } from "@/app/actions/studios";
import { Icon } from "@/components/Icon";
import { StudioOwnerBar, type StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

// Everything about running a studio that isn't already a control on the
// shifts screen. It used to float on the studio's public page, which put a
// manager's tools on the page strangers read; the way in is the You tab now,
// and this is the overflow beside the two buttons there, holding what those
// buttons don't: the counts, the editor, the share, and the page's views.
export function StudioAdminSheet({
  slug,
  canSchedule,
  pageViews,
  studio,
  showCoaches = true,
  approvalOn = true,
  settingsTrigger = false,
  dashboardTrigger = false,
}: {
  slug: string;
  /** The gym account is on, so the rota and the counts exist to link to. */
  canSchedule: boolean;
  /** All-time page views, tracked against the gym's account. Null when there
   *  is no account to track against yet. */
  pageViews?: number | null;
  studio: StudioEditProps;
  /** Whether the public schedule names who is coaching. On by default for a
   *  verified studio; the switch below is the way off. */
  showCoaches?: boolean;
  /** Whether coach-initiated covers and permanent transfers wait for a manager. */
  approvalOn?: boolean;
  /** Use the settings control shown in the studio-management header. */
  settingsTrigger?: boolean;
  dashboardTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [names, setNames] = useState(showCoaches);
  const [approvals, setApprovals] = useState(approvalOn);
  const [views, setViews] = useState<number | null | undefined>(pageViews);
  const [adminsOpen, setAdminsOpen] = useState(false);
  const [standardOpen, setStandardOpen] = useState(false);
  const [standardDate, setStandardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [admins, setAdmins] = useState<StaffPerson[] | null>(null);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [managerSearch, setManagerSearch] = useState("");
  const [managerCandidates, setManagerCandidates] = useState<StudioManagerCandidate[]>([]);
  const [managerSearchPending, startManagerSearch] = useTransition();
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminConfirm, setAdminConfirm] = useState<{
    person: StaffPerson;
    action: "remove" | "transfer";
  } | null>(null);
  const [viewsPending, startViews] = useTransition();
  const [adminsPending, startAdmins] = useTransition();
  const [standardPending, startStandard] = useTransition();
  const [, startNames] = useTransition();
  const [, startApprovals] = useTransition();
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (!adminsOpen || !canManageAdmins || managerSearch.trim().length < 2) {
      setManagerCandidates([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      startManagerSearch(async () => {
        const candidates = await searchStudioManagerCandidates(studio.id, managerSearch);
        if (!cancelled) setManagerCandidates(candidates);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adminsOpen, canManageAdmins, managerSearch, studio.id]);

  const toggleNames = () => {
    const next = !names;
    setNames(next);
    startNames(async () => {
      const res = await setStudioShowCoaches(studio.id, next);
      if (!res.ok) {
        setNames(!next);
        toast(res.error ?? "Couldn't save that");
        return;
      }
      router.refresh();
    });
  };

  const toggleApprovals = () => {
    const next = !approvals;
    setApprovals(next);
    startApprovals(async () => {
      const res = await setStudioShiftApproval(studio.id, next);
      if (!res.ok) {
        setApprovals(!next);
        toast(res.error ?? "Couldn't save that");
        return;
      }
      router.refresh();
    });
  };

  const openAdmin = () => {
    setOpen(true);
    if (!canSchedule || views !== undefined || viewsPending) return;
    startViews(async () => {
      const result = await studioPageViews(studio.id);
      if (!result.ok) {
        setViews(null);
        return;
      }
      setViews(result.pageViews);
    });
  };

  const closeAdminSheet = () => {
    setOpen(false);
    setAdminsOpen(false);
    setStandardOpen(false);
    setAdminConfirm(null);
  };

  const openAdmins = () => {
    setAdminsOpen(true);
    if (admins !== null || adminsPending) return;
    startAdmins(async () => {
      const result = await studioManagersForSettings(studio.id);
      setAdmins(result.people);
      setCanManageAdmins(result.canManage);
    });
  };

  const saveStandard = () => {
    if (standardPending || !standardDate) return;
    startStandard(async () => {
      const result = await saveStandardWeek(studio.id, standardDate);
      if (!result.ok) {
        toast(result.error ?? "Couldn't save the standard week");
        return;
      }
      toast(`Standard week saved · ${result.count ?? 0} classes`);
      setStandardOpen(false);
      router.refresh();
    });
  };

  const addAdmin = async () => {
    if (addingAdmin || !adminEmail.trim()) return;
    setAddingAdmin(true);
    const result = await addStudioManager(studio.id, adminEmail);
    setAddingAdmin(false);
    if (!result.ok) {
      toast(result.error ?? "Couldn't add them");
      return;
    }
    setAdminEmail("");
    const refreshed = await studioManagersForSettings(studio.id);
    setAdmins(refreshed.people);
    setCanManageAdmins(refreshed.canManage);
    toast("Manager added");
  };

  const addExistingAdmin = async (person: StudioManagerCandidate) => {
    if (addingAdmin) return;
    setAddingAdmin(true);
    const result = await addStudioManager(studio.id, person.email);
    setAddingAdmin(false);
    if (!result.ok) {
      toast(result.error ?? "Couldn't add them");
      return;
    }
    setManagerSearch("");
    setManagerCandidates([]);
    const refreshed = await studioManagersForSettings(studio.id);
    setAdmins(refreshed.people);
    setCanManageAdmins(refreshed.canManage);
    toast(`${person.name} is now a manager`);
  };

  const removeAdmin = async (person: StaffPerson) => {
    const result = await removeStudioManager(studio.id, person.id);
    setAdminConfirm(null);
    if (!result.ok) {
      toast(result.error ?? "Couldn't remove them");
      return;
    }
    if (person.isYou) {
      closeAdminSheet();
      window.location.href = "/you";
      return;
    }
    setAdmins((current) => current?.filter((admin) => admin.id !== person.id) ?? null);
    toast("Manager removed");
  };

  const transferOwnership = async (person: StaffPerson) => {
    const result = await transferStudioOwnership(studio.id, person.id);
    setAdminConfirm(null);
    if (!result.ok) {
      toast(result.error ?? "Couldn't transfer ownership");
      return;
    }
    const refreshed = await studioManagersForSettings(studio.id);
    setAdmins(refreshed.people);
    setCanManageAdmins(refreshed.canManage);
    toast(`${person.name} is now the owner`);
  };

  return (
    <>
      <button
        className={dashboardTrigger ? "setrow studio-dashboard-settings-row" : settingsTrigger ? "iconbtn studio-manage-settings" : "btn ghost staffbar-b staffmore"}
        aria-label="Studio settings"
        onClick={openAdmin}
      >
        {dashboardTrigger ? <>
          <span className="setrow-ic"><Icon name="settings" size={24} /></span>
          <span className="setrow-txt"><span className="t">Studio settings</span><span className="s">Details, standard week, managers, and schedule rules</span></span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </> : <Icon name={settingsTrigger ? "settings" : "more_horiz"} size={settingsTrigger ? 22 : 20} />}
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAdminSheet();
          }}
        >
          <div className="sheet studio-admin-sheet">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={closeAdminSheet}>
              <Icon name="close" size={20} />
            </button>
            {adminConfirm ? (
              <div className="studio-admin-confirm">
                <h2>
                  {adminConfirm.action === "transfer"
                    ? `Make ${adminConfirm.person.name} the owner?`
                    : `Remove ${adminConfirm.person.name}?`}
                </h2>
                <p className="lead">
                  {adminConfirm.action === "transfer"
                    ? "They will hold the master role and choose who can manage the studio. You will remain a manager."
                    : "They will no longer be able to edit the studio, manage its calendar, or invite people."}
                </p>
                <div className="publishwrap nostick">
                  <button
                    className="btn si"
                    onClick={() => adminConfirm.action === "transfer"
                      ? transferOwnership(adminConfirm.person)
                      : removeAdmin(adminConfirm.person)}
                  >
                    {adminConfirm.action === "transfer"
                      ? "Transfer ownership"
                      : `Remove ${adminConfirm.person.name}`}
                  </button>
                  <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setAdminConfirm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : standardOpen ? (
              <div className="studio-admin-access">
                <button className="studio-admin-view-back" onClick={() => setStandardOpen(false)}>
                  <Icon name="arrow_back" size={20} />
                  Studio settings
                </button>
                <h2>Standard week</h2>
                <p className="lead">
                  Choose any date in a representative week. Its Monday through Sunday classes become the standard. Coach assignments stay separate.
                </p>
                <label className="flabel" htmlFor="standardWeekDate">A date in the standard week</label>
                <input
                  id="standardWeekDate"
                  className="editinput"
                  type="date"
                  value={standardDate}
                  onChange={(event) => setStandardDate(event.target.value)}
                />
                <div className="publishwrap nostick">
                  <button className="btn si" disabled={standardPending || !standardDate} onClick={saveStandard}>
                    {standardPending ? "Saving…" : "Save standard week"}
                  </button>
                </div>
              </div>
            ) : adminsOpen ? (
              <div className="studio-admin-access">
                <button className="studio-admin-view-back" onClick={() => setAdminsOpen(false)}>
                  <Icon name="arrow_back" size={20} />
                  Studio settings
                </button>
                <h2>Owner and managers</h2>
                <p className="lead">
                  One owner holds the master role. Managers can run the studio without changing ownership.
                </p>
                {admins === null ? (
                  <p className="adminempty">Loading admins…</p>
                ) : (
                  <div className="settingslist studio-admin-list">
                    {admins.map((admin) => (
                      <div className="setrow staffrow" key={admin.id}>
                        <span className="setrow-txt">
                          <span className="t">
                            {admin.name}
                            {admin.isYou && <span className="staffyou">You</span>}
                          </span>
                          <span className="s">{admin.isOwner ? "Owner" : "Manager"} · {admin.email}</span>
                        </span>
                        {canManageAdmins && !admin.isOwner && (
                          <span className="studio-admin-actions">
                            <button
                              className="tertiary"
                              onClick={() => setAdminConfirm({ person: admin, action: "transfer" })}
                            >
                              Make owner
                            </button>
                            <button
                              className="tertiary"
                              onClick={() => setAdminConfirm({ person: admin, action: "remove" })}
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canManageAdmins && <div className="studio-manager-add-panel">
                  <label className="studio-manager-search">
                    <span>Add someone on FittList</span>
                    <span><Icon name="search" size={19} /><input type="search" value={managerSearch} placeholder="Search name or username" onChange={(event) => setManagerSearch(event.target.value)} /></span>
                  </label>
                  {managerSearch.trim().length >= 2 && (
                    <div className="studio-manager-results" aria-live="polite">
                      {managerSearchPending ? <p>Searching…</p> : managerCandidates.length ? managerCandidates.map((person) => (
                        <button key={person.id} disabled={addingAdmin} onClick={() => void addExistingAdmin(person)}>
                          {person.photo ? <img src={person.photo} alt="" loading="lazy" decoding="async" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}
                          <span><strong>{person.name}</strong><small>{person.handle ? `@${person.handle}` : person.email}</small></span>
                          <Icon name="add_circle" size={22} />
                        </button>
                      )) : <p>No matching accounts.</p>}
                    </div>
                  )}
                  <div className="studio-manager-email-label"><span>Or use their account email</span></div>
                  <div className="staffadd studio-admin-add">
                    <input
                      type="email"
                      aria-label="Manager email"
                      value={adminEmail}
                      placeholder="their@email.com"
                      onChange={(event) => setAdminEmail(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addAdmin();
                      }}
                    />
                    <button className="btn si staffaddbtn" disabled={addingAdmin || !adminEmail.trim()} onClick={addAdmin}>
                      {addingAdmin ? "Adding…" : "Add manager"}
                    </button>
                  </div>
                </div>}
              </div>
            ) : (
              <>
            <h2>Studio settings</h2>
            {/* The number a studio actually asks about first: is anyone
                looking. A stat is a row you read, not a door, so no chevron. */}
            {canSchedule && views === undefined && (
              <div className="statgrid" aria-label="Loading page views">
                <div className="stat">
                  <div className="n">&ndash;</div>
                  <div className="l">Page views</div>
                </div>
              </div>
            )}
            {views !== null && views !== undefined && (
              <div className="statgrid">
                <div className="stat">
                  <div className="n">{views}</div>
                  <div className="l">Page views</div>
                </div>
              </div>
            )}
            <div className="settingslist ownermenu">
              {canSchedule && (
                <Link className="setrow" href={`/s/${slug}/manage/counts`}>
                  <span className="setrow-ic"><Icon name="event_available" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Shift counter</span>
                    <span className="s">Counted from the schedule, split for a pay run</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </Link>
              )}
              {canSchedule && (
                <Link className="setrow" href={`/s/${slug}/manage/standard`}>
                  <span className="setrow-ic"><Icon name="calendar_month" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Standard calendar</span>
                    <span className="s">Edit the class-only weekly source of truth</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </Link>
              )}
              <button
                className="setrow"
                onClick={() => {
                  setOpen(false);
                  setEditOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="edit" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Edit studio info</span>
                  <span className="s">Photo, address, what it offers, contact</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={openAdmins}>
                <span className="setrow-ic"><Icon name="admin_panel_settings" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Owner and managers</span>
                  <span className="s">Manage roles and studio ownership</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {/* Whether the public week is a roster: some gyms publish a
                  schedule without naming anybody, and that is theirs to
                  decide. Only meaningful once the gym runs its schedule. */}
              {canSchedule && (
                <button className="setrow" onClick={toggleApprovals} aria-pressed={approvals}>
                  <span className="setrow-ic"><Icon name="verified" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Approve shift changes</span>
                    <span className="s">
                      {approvals
                        ? "Covers and permanent transfers wait for a manager"
                        : "Coaches can make covers and permanent transfers directly"}
                    </span>
                  </span>
                  <span className={`switch${approvals ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              )}
              {canSchedule && (
                <button className="setrow" onClick={toggleNames} aria-pressed={names}>
                  <span className="setrow-ic"><Icon name="groups" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Show who&rsquo;s teaching</span>
                    <span className="s">
                      {names
                        ? "Coach names appear on the public schedule"
                        : "The schedule lists classes without names"}
                    </span>
                  </span>
                  <span className={`switch${names ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      <StudioOwnerBar open={editOpen} onClose={() => setEditOpen(false)} {...studio} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
