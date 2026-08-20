"use client";

import { useState, useTransition } from "react";
import {
  addStudioManager,
  inviteStudioCoach,
  removeStudioCoach,
  removeStudioManager,
  setStudioCoachScheduled,
} from "@/app/actions/gym";
import type { StudioStaffDto } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StudioManageNav } from "@/components/StudioManageNav";
import { Toast, useToast } from "@/components/Toast";

// The studio's people, in two views of the same explicit relationship.
//
// People contains only coaches the studio invited, plus the people who run the
// page. Schedule decides which invited coaches may be assigned to shifts. A
// public "I coach here" profile connection never grants staffing permission.
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
}: {
  studioId: string;
  studioName: string;
  studioSlug: string;
  backHref: string;
  staff: StudioStaffDto;
}) {
  const [managers, setManagers] = useState(staff.managers);
  const [coaches, setCoaches] = useState(staff.roster);
  const [view, setView] = useState<"people" | "schedule">("people");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [invitingCoach, setInvitingCoach] = useState(false);
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

  const toggleScheduled = (id: string) => {
    const coach = coaches.find((item) => item.id === id);
    if (!coach) return;
    const next = !coach.onSchedule;
    setCoaches((prev) => prev.map((item) => (item.id === id ? { ...item, onSchedule: next } : item)));
    start(async () => {
      const res = await setStudioCoachScheduled(studioId, id, next);
      if (!res.ok) {
        setCoaches((prev) => prev.map((item) => (item.id === id ? { ...item, onSchedule: !next } : item)));
        toast(res.error ?? "Couldn't do that");
        return;
      }
      toast(next ? "They can be scheduled" : "Removed from the schedule");
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
    toast(res.invited ? "Invite sent" : "Added to your people");
    start(() => window.location.reload());
  };

  const removeCoach = (id: string) => {
    start(async () => {
      const res = await removeStudioCoach(studioId, id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't remove them");
        return;
      }
      setCoaches((prev) => prev.filter((coach) => coach.id !== id));
      toast("Removed from your people");
    });
  };

  return (
    <div className="pad studio-staff-pad">
      <div className="studio-manage-top pagetop">
        <BackLink
          className="evback studio-manage-back"
          href="/settings"
          anywhere
          notUnder={`/s/${studioSlug}`}
          label="Back to your account"
        >
          <Icon name="arrow_back" size={23} />
        </BackLink>
        <div>
          <h1>{studioName}</h1>
          <p className="adminsub">Manage your team</p>
        </div>
      </div>

      <StudioManageNav slug={studioSlug} active="staff" />

      <div className="staff-view-switch" role="group" aria-label="Staff view">
        <button
          type="button"
          className={view === "people" ? "on" : ""}
          aria-pressed={view === "people"}
          onClick={() => setView("people")}
        >
          People
        </button>
        <button
          type="button"
          className={view === "schedule" ? "on" : ""}
          aria-pressed={view === "schedule"}
          onClick={() => setView("schedule")}
        >
          On schedule
        </button>
      </div>

      {view === "people" ? (
        <>
          <h3 className="setgroup-h">Coaches</h3>
          <p className="staffnote">
            Invite the people who work with this studio. Public profile connections do not
            add anyone to your staff.
          </p>
          {coaches.length > 0 ? (
            <div className="settingslist">
              {coaches.map((coach) => (
                <div key={coach.id} className="setrow staffrow">
                  <span className="setrow-txt">
                    <span className="t">{coach.name}</span>
                    <span className="s">
                      {coach.state === "placeholder" || coach.state === "invited"
                        ? coach.email
                          ? `Invite pending · ${coach.email}`
                          : "Invite pending"
                        : coach.email ?? "Coach account"}
                    </span>
                  </span>
                  <button className="tertiary staffx" onClick={() => removeCoach(coach.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="adminempty">No coaches have been invited yet.</p>
          )}
          <div className="staffadd staff-invite">
            <input
              id="coachName"
              value={coachName}
              placeholder="Coach name"
              onChange={(e) => setCoachName(e.target.value)}
            />
            <input
              id="coachEmail"
              type="email"
              value={coachEmail}
              placeholder="Email"
              required
              onChange={(e) => setCoachEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCoach();
              }}
            />
            <button
              className="btn si staffaddbtn"
              disabled={invitingCoach || !coachName.trim() || !coachEmail.trim()}
              onClick={addCoach}
            >
              Invite coach
            </button>
          </div>

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
        </>
      ) : (
        <>
          <h3 className="setgroup-h">Who can be scheduled</h3>
          <p className="staffnote">
            Only invited coaches can be put on classes or pick up open shifts. Turn someone
            off after their future classes are reassigned in Calendar.
          </p>
          {!staff.hasSchedule ? (
            <p className="adminempty">Turn on the studio calendar before assigning coaches.</p>
          ) : coaches.length === 0 ? (
            <p className="adminempty">Invite a coach under People first.</p>
          ) : (
            <div className="settingslist">
              {coaches.map((coach) => (
                <button
                  key={coach.id}
                  className="setrow"
                  role="switch"
                  aria-checked={coach.onSchedule}
                  onClick={() => toggleScheduled(coach.id)}
                >
                  <span className="setrow-txt">
                    <span className="t">{coach.name}</span>
                    <span className="s">
                      {coach.onSchedule ? "On the schedule" : "Not on the schedule"}
                    </span>
                  </span>
                  <span className={`switch${coach.onSchedule ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
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
