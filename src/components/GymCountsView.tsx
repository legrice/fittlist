"use client";

import Link from "next/link";
import type { GymCounts } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

/** The month before and after this one, as "2026-08". */
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// The shift counter, counted from the schedule rather than tallied by hand.
//
// This is a count and an export. It models no rates and no pay periods and
// produces nothing that is itself a pay record: the number goes to whatever
// actually pays people. What it does do is be right, because it is derived
// from the rota instead of from formulas over a grid, and because every coach
// can see their own, which puts fifteen people on checking it.
export function GymCountsView({
  studioName,
  backHref,
  countsBase,
  counts,
}: {
  studioName: string;
  backHref: string;
  countsBase: string;
  counts: GymCounts | null;
}) {
  const [toastMsg, toastOn, toast] = useToast();
  if (!counts) return null;

  const copy = async () => {
    const lines = [
      `${studioName} · ${counts.label}`,
      ["Coach", counts.firstLabel, counts.secondLabel, "Total"].join("\t"),
      ...counts.rows.map((r) => [r.name, r.first, r.second, r.total].join("\t")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      toast("Copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  return (
    <div className="pad">
      <div className="admintop pagetop">
        <div>
          <h1>Shift counter</h1>
          <p className="adminsub">{studioName}</p>
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the schedule">
          <Icon name="close" size={20} />
        </BackLink>
      </div>

      <div className="rotaweek">
        <Link className="rotanav" href={`${countsBase}?m=${shift(counts.month, -1)}`}>
          <Icon name="chevron_left" size={20} />
        </Link>
        <span className="rotaweek-lbl">{counts.label}</span>
        <Link className="rotanav" href={`${countsBase}?m=${shift(counts.month, 1)}`}>
          <Icon name="chevron_right" size={20} />
        </Link>
      </div>

      {counts.rows.length === 0 ? (
        <p className="adminempty" style={{ marginTop: 24 }}>
          Nobody was on a class this month.
        </p>
      ) : (
        <>
          <div className="counttable">
            <div className="countrow counthead">
              <span className="countnm">Coach</span>
              <span>{counts.firstLabel}</span>
              <span>{counts.secondLabel}</span>
              <span className="counttot">Total</span>
            </div>
            {counts.rows.map((r) => (
              <div key={r.coachUserId} className="countrow">
                <span className="countnm">{r.name}</span>
                <span>{r.first}</span>
                <span>{r.second}</span>
                <span className="counttot">{r.total}</span>
              </div>
            ))}
          </div>
          <p className="rotahint">
            Counted from the schedule, including swaps. It goes to whoever pays people;
            fittlist doesn&rsquo;t do payroll.
          </p>
          {counts.openSlots > 0 && (
            <p className="rotahint">
              {counts.openSlots} {counts.openSlots === 1 ? "class" : "classes"} this month had
              nobody on. Those are on the schedule, not on anybody&rsquo;s count.
            </p>
          )}
          <div className="publishwrap nostick">
            <button className="btn ghost" onClick={copy}>
              <Icon name="ios_share" size={19} /> Copy the table
            </button>
          </div>
        </>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
