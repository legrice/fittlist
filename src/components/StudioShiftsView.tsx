"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  answerShiftRequest,
  claimShift,
  giveUpShift,
  sendShiftTo,
  type StaffView,
} from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { StudioEditProps } from "@/components/StudioOwnerBar";
import { AgendaAvatar } from "@/components/Agenda";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

type Tab = "mine" | "open" | "all" | "requests";

// The studio's shifts, for whoever works here.
//
// The arrangement the spec insists on: My shifts is the default tab for
// everyone, admin or not. A manager is almost always also a coach, and a
// manager-only mode that hides their own shifts is the thing to avoid; their
// extra powers are extra tabs, not a different screen.
//
// All shifts is deliberately a link to the rota rather than a fourth list
// here. The rota is already a real dated week with adding, editing and
// assigning on it, and a second calendar would drift from it the way the
// class row drifted into six copies.
export function StudioShiftsView({
  view,
  pageViews,
  studio,
  showCoaches = true,
  canSchedule,
}: {
  view: StaffView;
  /** The studio's own settings, behind the overflow. Null for a staff coach:
   *  the sheet is the manager's, and so is everything in it. */
  pageViews: number | null;
  studio: StudioEditProps | null;
  /** Whether the public schedule names who is coaching; the overflow's switch. */
  showCoaches?: boolean;
  /** The gym account exists, so there is a rota to count and to link to. A
   *  studio without one still renders this screen (it is the only door to the
   *  editor), it just has no shifts on it. */
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; name: string } | null>(null);
  // The row's own dot: what you can do with a shift of yours, said in full.
  const [manage, setManage] = useState<{ classId: string; iso: string; name: string } | null>(null);
  // Handing a date to a named coach. Two steps, like the class sheet's: the
  // list of names first, because eight names under one verb read as eight
  // options, then the confirm, because the notice goes out the moment it runs
  // and a single tap was texting somebody a shift.
  const [transfer, setTransfer] = useState<{ classId: string; iso: string; name: string } | null>(
    null,
  );
  const [sendTo, setSendTo] = useState<
    { classId: string; iso: string; name: string; toId: string; toName: string } | null
  >(null);

  const act = (
    fn: () => Promise<{ ok: boolean; error?: string; pending?: boolean }>,
    good: string,
    asked?: string,
  ) => {
    if (pending) return;
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      // The action says whether it landed or is waiting; the screen does not
      // guess from the studio's setting, which can change under it.
      toast(res.pending ? (asked ?? "Asked the studio") : good);
      router.refresh();
    });
  };

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "mine", label: "Your shifts", n: view.mine.length },
    { key: "open", label: "Open", n: view.open.length },
    ...(view.isManager
      ? ([{ key: "requests", label: "Requests", n: view.requests.length }] as const)
      : []),
  ];

  const rows = tab === "mine" ? view.mine : tab === "open" ? view.open : view.all;

  return (
    <div className="pad">
      <div className="admintop pagetop">
        <div>
          <h1>{view.studioName}</h1>
          <p className="adminsub">
            {view.isManager ? "You run this studio" : "You coach here"} ·{" "}
            {view.coachCount} {view.coachCount === 1 ? "coach" : "coaches"}
          </p>
        </div>
        {/* Your studios on the You tab is the only way in here, so it is the
            only way out: closing onto the studio's public page dropped a
            manager somewhere they never came from, with no route back to the
            screen they were working on. BackLink pops when You is genuinely
            beneath and pushes for a shifts URL opened cold. */}
        <BackLink className="iconbtn acctclose" href="/settings" label="Back to settings">
          <Icon name="close" size={20} />
        </BackLink>
      </div>

      {/* The admin's extra doors, named rather than hidden behind a gear: the
          roster is a weekly-use tool for a manager, not a configure-once
          screen, and a gear reads as app settings. A staff coach sees none of
          this bar. */}
      {view.isManager && (
        <div className="staffbar">
          <Link className="btn ghost staffbar-b" href={`/s/${view.slug}/manage`}>
            <Icon name="calendar_month" size={18} /> All shifts
          </Link>
          <Link className="btn ghost staffbar-b" href={`/s/${view.slug}/manage/staff`}>
            <Icon name="groups" size={18} /> Staff
          </Link>
          {/* Everything running a studio needs that isn't one of those two.
              It used to float on the studio's public page; this is the only
              way in now, which is the point: a manager's tools do not belong
              on the page strangers read. */}
          {studio && (
            <StudioAdminSheet
              slug={view.slug}
              canSchedule={canSchedule}
              pageViews={pageViews}
              studio={studio}
              showCoaches={showCoaches}
            />
          )}
        </div>
      )}

      <div className="pubtabs distabs" aria-label="Shifts">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`pubtab${tab === t.key ? " sel" : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="pubtab-cnt">{t.n ?? 0}</span>
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        view.requests.length === 0 ? (
          <p className="adminempty">
            {view.approvalOn
              ? "Nothing waiting. Pickups and hand-overs land here for you to answer."
              : "This studio takes changes as they are made, so nothing waits here."}
          </p>
        ) : (
          <div className="settingslist">
            {view.requests.map((r) => (
              <div key={r.id} className="setrow staffrow">
                <span className="setrow-txt">
                  <span className="t">
                    {r.kind === "pickup"
                      ? `${r.toName} wants ${r.className}`
                      : `${r.fromName ?? "A coach"} is handing ${r.className} to ${r.toName}`}
                  </span>
                  <span className="s">{r.whenLong}</span>
                </span>
                <span className="staffreq-acts">
                  <button
                    className="btn si staffreq-yes"
                    disabled={pending}
                    onClick={() => act(() => answerShiftRequest(r.id, true), "Approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="tertiary"
                    disabled={pending}
                    onClick={() => act(() => answerShiftRequest(r.id, false), "Declined")}
                  >
                    Decline
                  </button>
                </span>
              </div>
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="adminempty">
          {/* No gym account means there is no rota at all, which is a
              different thing from a rota you happen not to be on. */}
          {!canSchedule
            ? "This studio isn't running its schedule here yet. Write to us and we'll turn it on."
            : tab === "mine"
              ? "You aren't on anything here in the next fortnight."
              : "Every shift has somebody on it."}
        </p>
      ) : (
        <div className="settingslist">
          {rows.map((s) => (
            <div key={`${s.classId}-${s.iso}`} className="setrow staffrow">
              <span className="setrow-txt">
                <span className="t">{s.name}</span>
                <span className="s">
                  {s.timeLabel} · {s.durationMin} min
                  {s.where ? ` · ${s.where}` : ""}
                  {tab !== "mine" && s.onName ? ` · ${s.onName}` : ""}
                </span>
                {s.pending && <span className="staffpend">{s.pending}</span>}
              </span>
              {/* One control on the row, and the verbs behind it. Two words
                  across from a class name is two things to read and a date
                  that has to truncate to make room for them; a dot opens a
                  sheet that can say each act in full. An open shift keeps its
                  own button, because taking one is a single act rather than a
                  choice between two. */}
              {s.mine ? (
                <button
                  className="iconbtn staffmenu"
                  aria-label={`Manage ${s.name}, ${s.timeLabel}`}
                  disabled={pending}
                  onClick={() => setManage({ classId: s.classId, iso: s.iso, name: s.name })}
                >
                  <Icon name="more_horiz" size={20} />
                </button>
              ) : s.open ? (
                <button
                  className="btn si staffreq-yes"
                  disabled={pending || !!s.pending}
                  onClick={() =>
                    act(() => claimShift(s.classId, s.iso), "It's yours", "Asked the studio")
                  }
                >
                  {s.pending ? "Asked" : "Pick up"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Giving a date back opens it and tells the gym, so it asks first. */}
      {/* What you can do with a shift of yours. Transfer only appears when the
          managers have named somebody it could go to; without a list it would
          be a row that opens an empty sheet. */}
      {manage && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManage(null);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setManage(null)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>{manage.name}</h2>
            <div className="settingslist ownermenu">
              {view.sendable.length > 0 && (
                <button
                  className="setrow"
                  onClick={() => {
                    setTransfer(manage);
                    setManage(null);
                  }}
                >
                  <span className="setrow-ic"><Icon name="person_add" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Transfer shift</span>
                    <span className="s">Hand this date to another coach here</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              )}
              <button
                className="setrow"
                onClick={() => {
                  setConfirm(manage);
                  setManage(null);
                }}
              >
                <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Give up this shift</span>
                  <span className="s">It opens up and everyone who could cover it hears</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Who takes it. The gym's shift list, not the directory's: anyone may
          say they coach here, and `sendShiftTo` refuses anybody not on it. */}
      {transfer && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransfer(null);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setTransfer(null)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>Transfer shift</h2>
            <p className="lead">
              Who takes {transfer.name}? They and the studio are told; the rest of the week is
              unchanged.
            </p>
            <div className="settingslist ownermenu">
              {view.sendable.map((p) => (
                <button
                  key={p.id}
                  className="setrow"
                  disabled={pending}
                  onClick={() => {
                    setSendTo({ ...transfer, toId: p.id, toName: p.name });
                    setTransfer(null);
                  }}
                >
                  <span className="setrow-ic">
                    {/* The face, not a glyph. This is the moment somebody
                        picks who to hand a class to, and a column of
                        identical outlines makes colleagues into text to
                        parse. */}
                    <AgendaAvatar photo={p.photo} name={p.name} color={p.color} cls="sendav" />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">{p.name}</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The doing step. It confirms for the same reason giving up does: the
          notice goes out the moment it runs, and where the studio approves
          changes this is an ask rather than a done thing, which is why the
          toast reads off `pending` rather than off the setting. */}
      {sendTo && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSendTo(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Give {sendTo.name} to {sendTo.toName}?</h2>
            <p className="lead">
              {view.approvalOn
                ? "The studio is asked first. Nothing moves on anybody's calendar until they answer."
                : "They are put on it and told, and so is the studio."}
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const t = sendTo;
                  setSendTo(null);
                  act(
                    () => sendShiftTo(t.classId, t.iso, t.toId),
                    `Transferred to ${t.toName}`,
                    `Asked the studio to send it to ${t.toName}`,
                  );
                }}
              >
                {view.approvalOn ? "Ask the studio" : "Transfer it"}
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setSendTo(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Give up {confirm.name}?</h2>
            <p className="lead">
              It opens up, and the studio and every coach who could cover it are told. If nobody
              takes it, you can claim it back.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  act(() => giveUpShift(c.classId, c.iso), "Handed back");
                }}
              >
                Give it up
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirm(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
