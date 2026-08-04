"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { answerShiftRequest, claimShift, giveUpShift, type StaffView } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { StudioEditProps } from "@/components/StudioOwnerBar";
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
}: {
  view: StaffView;
  /** The studio's own settings, behind the overflow. Null for a staff coach:
   *  the sheet is the manager's, and so is everything in it. */
  pageViews: number | null;
  studio: StudioEditProps | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; name: string } | null>(null);

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
    { key: "mine", label: "My shifts", n: view.mine.length },
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
        <BackLink className="iconbtn acctclose" href={`/s/${view.slug}`} label="Back to the studio">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      {/* The admin's extra doors, named rather than hidden behind a gear: the
          roster is a weekly-use tool for a manager, not a configure-once
          screen, and a gear reads as app settings. A staff coach sees none of
          this bar. */}
      {view.isManager && (
        <div className="staffbar">
          <Link className="btn ghost staffbar-b" href={`/s/${view.slug}/manage`}>
            <Icon name="calendar_month" size={16} /> All shifts
          </Link>
          <Link className="btn ghost staffbar-b" href={`/s/${view.slug}/manage/staff`}>
            <Icon name="groups" size={16} /> Coaches
          </Link>
          {/* Everything running a studio needs that isn't one of those two.
              It used to float on the studio's public page; this is the only
              way in now, which is the point: a manager's tools do not belong
              on the page strangers read. */}
          {studio && (
            <StudioAdminSheet
              slug={view.slug}
              canSchedule
              pageViews={pageViews}
              studio={studio}
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
          {tab === "mine"
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
              {/* One action per row, and it is the one that fits the row: your
                  own shift can be given up, an open one can be taken. */}
              {s.mine ? (
                <button
                  className="tertiary staffx"
                  disabled={pending}
                  onClick={() => setConfirm({ classId: s.classId, iso: s.iso, name: s.name })}
                >
                  Give up
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
