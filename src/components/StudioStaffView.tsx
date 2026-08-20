"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addExistingStudioCoach,
  addStudioManager,
  inviteStudioCoach,
  removeStudioManager,
  searchStudioCoachCandidates,
} from "@/app/actions/gym";
import type { StudioCoachSearchResult, StudioStaffDto } from "@/app/actions/gym";
import { AgendaAvatar } from "@/components/Agenda";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import { StudioManageNav } from "@/components/StudioManageNav";
import type { StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

// The studio's invited people. Scheduling access is part of each coach rather
// than a second copy of the same roster; tapping a person opens their settings.
//
// Adding a manager used to be ours to do. A gym wanting its own second manager
// had to write in and ask, which is a strange thing to need a support ticket
// for when studio_managers is a join table precisely because a place of work
// has more than one person running it.
export function StudioStaffView({
  studioId,
  studioName,
  studioSlug,
  backHref,
  staff,
  admin,
}: {
  studioId: string;
  studioName: string;
  studioSlug: string;
  backHref: string;
  staff: StudioStaffDto;
  admin: {
    studio: StudioEditProps;
    showCoaches?: boolean;
    approvalOn?: boolean;
  };
}) {
  const [managers, setManagers] = useState(staff.managers);
  const coaches = staff.roster;
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [invitingCoach, setInvitingCoach] = useState(false);
  const [coachSheetOpen, setCoachSheetOpen] = useState(false);
  const [coachAddMode, setCoachAddMode] = useState<"search" | "email">("search");
  const [coachSearch, setCoachSearch] = useState("");
  const [coachResults, setCoachResults] = useState<StudioCoachSearchResult[]>([]);
  const [coachSearching, setCoachSearching] = useState(false);
  const [addingCoachId, setAddingCoachId] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const [confirm, setConfirm] = useState<{ id: string; name: string; isYou: boolean } | null>(null);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const add = async () => {
    if (adding || !email.trim()) return;
    setAdding(true);
    const res = await addStudioManager(studioId, email);
    setAdding(false);
    if (!res.ok) {
      toast(res.error ?? "Couldn't add them");
      return;
    }
    setEmail("");
    // The row needs a name and the action knows it; rather than return one and
    // have two sources for the same list, ask the server for the page again.
    toast("They run this page now");
    start(() => {
      window.location.reload();
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const res = await removeStudioManager(studioId, id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      // Removing yourself takes the page away with it, so leave rather than
      // sit on a screen that is no longer yours.
      if (managers.find((m) => m.id === id)?.isYou) {
        window.location.href = backHref;
        return;
      }
      setManagers((prev) => prev.filter((m) => m.id !== id));
      toast("They no longer run this page");
    });
  };

  const addCoach = async () => {
    if (invitingCoach || !coachName.trim() || !coachEmail.trim()) return;
    setInvitingCoach(true);
    const res = await inviteStudioCoach(studioId, coachName, coachEmail);
    setInvitingCoach(false);
    if (!res.ok) {
      toast(res.error ?? "Couldn't add them");
      return;
    }
    setCoachName("");
    setCoachEmail("");
    setCoachSheetOpen(false);
    toast(res.invited ? "Invite sent" : "Added to your people");
    start(() => window.location.reload());
  };

  useEffect(() => {
    const query = coachSearch.trim();
    if (!coachSheetOpen || coachAddMode !== "search" || query.length < 2) {
      setCoachResults([]);
      setCoachSearching(false);
      return;
    }
    const request = ++searchRequest.current;
    setCoachSearching(true);
    const timer = window.setTimeout(async () => {
      const results = await searchStudioCoachCandidates(studioId, query);
      if (request !== searchRequest.current) return;
      setCoachResults(results);
      setCoachSearching(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [coachAddMode, coachSearch, coachSheetOpen, studioId]);

  const addExistingCoach = async (coach: StudioCoachSearchResult) => {
    if (addingCoachId) return;
    setAddingCoachId(coach.id);
    const res = await addExistingStudioCoach(studioId, coach.id);
    setAddingCoachId(null);
    if (!res.ok) {
      toast(res.error ?? "Couldn't add them");
      return;
    }
    setCoachSheetOpen(false);
    toast(`${coach.name} added`);
    start(() => window.location.reload());
  };

  return (
    <div className="pad studio-staff-pad">
      <div className="studio-manage-top pagetop">
        <div className="studio-manage-topbar">
          <BackLink
            className="evback studio-manage-back"
            href="/settings"
            anywhere
            notUnder={`/s/${studioSlug}`}
            label="Back to your account"
          >
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <StudioAdminSheet
            slug={studioSlug}
            canSchedule={staff.hasSchedule}
            studio={admin.studio}
            showCoaches={admin.showCoaches}
            approvalOn={admin.approvalOn}
            settingsTrigger
          />
        </div>
        <div>
          <h1>{studioName}</h1>
          <p className="adminsub">Manage your team</p>
        </div>
      </div>

      <StudioManageNav slug={studioSlug} active="staff" />

      <h3 className="setgroup-h">Coaches</h3>
      <p className="staffnote">
        Invite the people who work with this studio. Tap a coach to manage their schedule access
        and see their shifts.
      </p>
      {coaches.length > 0 ? (
        <div className="settingslist">
          {coaches.map((coach) => (
            <Link
              key={coach.id}
              className="setrow staffrow staff-person-link"
              href={`/s/${studioSlug}/manage/staff/${coach.id}`}
              prefetch={false}
            >
              <AgendaAvatar
                photo={coach.photo}
                name={coach.name}
                color={coach.color ?? "var(--color-text-secondary)"}
                cls="staff-person-avatar"
              />
              <span className="setrow-txt">
                <span className="t">{coach.name}</span>
                <span className="s">
                  {coach.state === "placeholder" || coach.state === "invited"
                    ? "Invite pending"
                    : coach.onSchedule
                      ? "On the schedule"
                      : "Not on the schedule"}
                </span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="adminempty">No coaches have been invited yet.</p>
      )}
      <button className="btn si staff-add-coach-button" onClick={() => setCoachSheetOpen(true)}>
        <Icon name="add" size={21} />
        Add a coach
      </button>

          <h3 className="setgroup-h">Admin access</h3>
          <p className="staffnote">
            Admins can edit studio details, manage the calendar, and invite other people.
          </p>
          <div className="settingslist">
            {managers.map((m) => (
              <div key={m.id} className="setrow staffrow">
                <span className="setrow-txt">
                  <span className="t">
                    {m.name}
                    {m.isYou && <span className="staffyou">You</span>}
                  </span>
                  <span className="s">{m.email}</span>
                </span>
                <button
                  className="tertiary staffx"
                  onClick={() => setConfirm({ id: m.id, name: m.name, isYou: m.isYou })}
                >
                  {m.isYou ? "Leave" : "Remove"}
                </button>
              </div>
            ))}
          </div>
          <div className="staffadd">
            <input
              id="staffEmail"
              type="email"
              value={email}
              placeholder="their@email.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button className="btn si staffaddbtn" disabled={adding || !email.trim()} onClick={add}>
              Add admin
            </button>
          </div>

      {coachSheetOpen && (
        <div className="sheet-scrim" onClick={(event) => {
          if (event.target === event.currentTarget) setCoachSheetOpen(false);
        }}>
          <div className="sheet staff-coach-add-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setCoachSheetOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Add a coach</h2>
            <div className="staff-add-modes" role="tablist" aria-label="How to add a coach">
              <button
                type="button"
                role="tab"
                aria-selected={coachAddMode === "search"}
                className={coachAddMode === "search" ? "on" : ""}
                onClick={() => setCoachAddMode("search")}
              >
                Search FittList
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={coachAddMode === "email"}
                className={coachAddMode === "email" ? "on" : ""}
                onClick={() => setCoachAddMode("email")}
              >
                Invite by email
              </button>
            </div>

            {coachAddMode === "search" ? (
              <div className="staff-coach-search-panel">
                <label className="staff-coach-search">
                  <Icon name="search" size={20} />
                  <input
                    autoFocus
                    type="search"
                    value={coachSearch}
                    placeholder="Search coaches"
                    onChange={(event) => setCoachSearch(event.target.value)}
                  />
                </label>
                <div className="staff-coach-results">
                  {coachSearching ? (
                    <p>Searching…</p>
                  ) : coachSearch.trim().length < 2 ? (
                    <p>Search by name or username.</p>
                  ) : coachResults.length ? (
                    coachResults.map((coach) => (
                      <button
                        type="button"
                        className="staff-coach-result"
                        key={coach.id}
                        disabled={!!addingCoachId}
                        onClick={() => addExistingCoach(coach)}
                      >
                        <AgendaAvatar
                          photo={coach.photo}
                          name={coach.name}
                          color={coach.color ?? "var(--color-text-secondary)"}
                          cls="staff-person-avatar"
                        />
                        <span>
                          <strong>{coach.name}</strong>
                          {coach.handle && <small>@{coach.handle}</small>}
                        </span>
                        <span className="staff-coach-result-action">
                          {addingCoachId === coach.id ? "Adding…" : "Add"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>No matching coaches. You can invite them by email instead.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="staffadd staff-invite-sheet">
                <input
                  id="coachName"
                  value={coachName}
                  placeholder="Coach name"
                  onChange={(event) => setCoachName(event.target.value)}
                />
                <input
                  id="coachEmail"
                  type="email"
                  value={coachEmail}
                  placeholder="Email"
                  required
                  onChange={(event) => setCoachEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addCoach();
                  }}
                />
                <button
                  className="btn si staffaddbtn"
                  disabled={invitingCoach || !coachName.trim() || !coachEmail.trim()}
                  onClick={addCoach}
                >
                  {invitingCoach ? "Sending…" : "Invite coach"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Handing the keys back is not a thing to do by mistyping a tap, so it
          asks first, the same shape removing a plan asks with. */}
      {confirm && (
        <div className="sheet-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) setConfirm(null);
        }}>
          <div className="sheet confirmsheet">
            <h2>{confirm.isYou ? "Leave this page?" : `Remove ${confirm.name}?`}</h2>
            <p className="lead">
              {confirm.isYou
                ? "You will not be able to edit the studio or its shifts, and you would need one of the others to add you back."
                : "They will not be able to edit the studio or its shifts. Nothing tells them."}
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const id = confirm.id;
                  setConfirm(null);
                  remove(id);
                }}
              >
                {confirm.isYou ? "Leave" : `Remove ${confirm.name}`}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                onClick={() => setConfirm(null)}
              >
                {confirm.isYou ? "Stay" : "Keep them"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
