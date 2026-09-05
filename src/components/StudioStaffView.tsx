"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addExistingStudioCoach,
  inviteStudioCoach,
  searchStudioCoachCandidates,
} from "@/app/actions/gym";
import type { StudioCoachSearchResult, StudioStaffDto } from "@/app/actions/gym";
import type { StudioTeamRole } from "@/app/actions/gym";
import { AgendaAvatar } from "@/components/Agenda";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
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
  studioSlug,
  staff,
}: {
  studioId: string;
  studioSlug: string;
  staff: StudioStaffDto;
}) {
  const people = staff.people;
  const [staffRole, setStaffRole] = useState<StudioTeamRole>("coach");
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
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const addCoach = async () => {
    if (invitingCoach || !coachName.trim() || !coachEmail.trim()) return;
    setInvitingCoach(true);
    const res = await inviteStudioCoach(studioId, coachName, coachEmail, staffRole);
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
      const results = await searchStudioCoachCandidates(studioId, query, staffRole);
      if (request !== searchRequest.current) return;
      setCoachResults(results);
      setCoachSearching(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [coachAddMode, coachSearch, coachSheetOpen, staffRole, studioId]);

  const addExistingCoach = async (coach: StudioCoachSearchResult) => {
    if (addingCoachId) return;
    setAddingCoachId(coach.id);
    const res = await addExistingStudioCoach(studioId, coach.id, staffRole);
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
        <div className="studio-manage-topbar studio-staff-topbar">
          <BackLink
            className="evback studio-manage-back"
            href={`/s/${studioSlug}/manage`}
            label="Back to studio dashboard"
          >
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <h1 className="studio-calendar-title">Staff</h1>
          <div className="studio-staff-header-actions">
            <button
              type="button"
              className="studio-staff-add"
              aria-label="Add staff"
              onClick={() => setCoachSheetOpen(true)}
            >
              <Icon name="add" size={23} />
            </button>
          </div>
        </div>
      </div>

      {people.length > 0 ? (
        <div className="settingslist">
          {people.map((person) => {
            const labels = person.roles.map((role) => role === "front_desk"
              ? "Front desk"
              : role[0].toUpperCase() + role.slice(1));
            const linked = !!person.staffRole;
            const invitePending = person.state === "placeholder" || person.state === "invited";
            const classCopy = `${person.weeklyClassCount} ${person.weeklyClassCount === 1 ? "class" : "classes"} this week`;
            const content = <>
              <AgendaAvatar
                photo={person.photo}
                name={person.name}
                color={person.color ?? "var(--color-text-secondary)"}
                cls="staff-person-avatar"
              />
              <span className="setrow-txt">
                <span className="staff-role-tags">
                  {labels.map((label) => <span className="kindtag kindtag-sm" key={label}>{label}</span>)}
                </span>
                <span className="t">{person.name}</span>
                <span className="s">
                  {invitePending
                    ? "Invite pending"
                    : person.roles.includes("coach")
                      ? classCopy
                      : person.email ?? "Studio team"}
                </span>
              </span>
              {linked && <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>}
            </>;
            return linked ? (
              <Link
                key={person.id}
                className="setrow staffrow staff-person-link"
                href={`/s/${studioSlug}/manage/staff/${person.id}`}
                prefetch={false}
              >
                {content}
              </Link>
            ) : (
              <div className="setrow staffrow" key={person.id}>{content}</div>
            );
          })}
        </div>
      ) : (
        <p className="adminempty">No staff have been added yet.</p>
      )}
      {coachSheetOpen && (
        <div className="sheet-scrim" onClick={(event) => {
          if (event.target === event.currentTarget) setCoachSheetOpen(false);
        }}>
          <div className="sheet staff-coach-add-sheet">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setCoachSheetOpen(false)}>
              <Icon name="close" size={20} />
            </button>
            <h2>Add staff</h2>
            <div className="staff-role-picker" role="radiogroup" aria-label="Staff role">
              <button
                type="button"
                role="radio"
                aria-checked={staffRole === "coach"}
                className={staffRole === "coach" ? "on" : ""}
                onClick={() => setStaffRole("coach")}
              >
                Coach
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={staffRole === "front_desk"}
                className={staffRole === "front_desk" ? "on" : ""}
                onClick={() => setStaffRole("front_desk")}
              >
                Front desk
              </button>
            </div>
            <div className="staff-add-modes" role="tablist" aria-label="How to add staff">
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
                    placeholder={staffRole === "coach" ? "Search coaches" : "Search people"}
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
                    <p>No matching people. You can invite them by email instead.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="staffadd staff-invite-sheet">
                <input
                  id="coachName"
                  value={coachName}
                  placeholder={staffRole === "coach" ? "Coach name" : "Staff name"}
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
                  {invitingCoach ? "Sending…" : `Invite ${staffRole === "coach" ? "coach" : "front desk"}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
