"use client";

import Link from "next/link";
import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  if (!counts) return null;

  const tableRows: (string | number)[][] = [
    ["Coach", counts.firstLabel, counts.secondLabel, "Total"],
    ...counts.rows.map((row) => [row.name, row.first, row.second, row.total]),
  ];
  const copy = async () => {
    const lines = [
      `${studioName} · ${counts.label}`,
      ...tableRows.map((row) => row.join("\t")),
    ].join("\n");
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(lines);
      toast("Copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  const downloadCsv = () => {
    const csvCell = (value: string | number) => {
      let text = String(value);
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = [
      [studioName, counts.label],
      ...tableRows,
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "studio"}-${counts.month}-shift-counts.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
    toast("CSV downloaded");
  };

  return (
    <div className="pad">
      <div className="studio-manage-top pagetop">
        <div className="studio-manage-topbar">
        <BackLink className="evback studio-manage-back" href={backHref} label="Back to studio dashboard">
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <h1 className="studio-calendar-title">Shift counter</h1>
          <div className="counts-menu-wrap">
            <button
              type="button"
              className="counts-menu-trigger"
              aria-label="Shift counter actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="more_horiz" size={22} />
            </button>
            {menuOpen && (
              <div className="counts-menu">
                <button type="button" onClick={() => void copy()}><Icon name="content_copy" size={18} />Copy table</button>
                <button type="button" onClick={downloadCsv}><Icon name="ios_share" size={18} />Download CSV</button>
              </div>
            )}
          </div>
        </div>
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
              {counts.openSlots} {counts.openSlots === 1 ? "class was" : "classes were"} open this month.
              Open classes stay on the schedule but do not count toward a coach&rsquo;s total.
            </p>
          )}
        </>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
