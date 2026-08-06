"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { shareRows, type ShareRow } from "@/app/actions/share";
import { STORY_STYLES, type StoryStyleId } from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StoryPreview } from "@/components/StoryPreview";
import { putImage } from "@/lib/shareimage";
import { Toast, useToast } from "@/components/Toast";

// The composer: a picture of your week, and the three decisions that make it.
//
// Dates, Classes, Style. That is the whole screen, and each one is a row that
// opens a sheet rather than a control sitting open on the page: three open
// pickers above a picture is a form with a thumbnail, and this is a picture
// with three questions under it.
//
// The Coaching/Going segment is gone. It was two hats, deliberately never
// merged, and going marks are gone from the app, so there is one week to draw
// and a control with one option is a control that teaches somebody the screen
// is more complicated than it is.

/** What the picture says at the top. It maps from nothing now: there is one
 *  kind of picture. The composer still sends it explicitly rather than letting
 *  the route fall back to `storyPrefs`, because a coach who typed one into the
 *  old sheet still has it stored and would get it back without asking. */
const HEADLINE = "Come train with me";

/** How far ahead the start-day rail offers. Two weeks: past that you are
 *  making a picture of a week you have not finished planning. */
const START_DAYS = 14;

export function ShareComposer({
  hasPhoto,
  today,
  firstIso,
  studios,
  templates,
  customTypes,
  lastUsed,
}: {
  hasPhoto: boolean;
  today: string;
  /** The first day their week holds something, so the picture opens on a week
   *  rather than on an empty one they have to work out. */
  firstIso: string;
  /** The adder's ingredients. Making the picture and keeping the calendar are
   *  the same act here: a class typed into the classes sheet lands on the
   *  calendar, and when a studio was named it lands in that studio's catalog
   *  too, so the next person to add it gets the details already filled in. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
}) {
  const [toastMsg, toastOn, toast] = useToast();

  const [styleId, setStyleId] = useState<StoryStyleId>("plain");
  // The colourway, by label rather than by index: the route resolves it that
  // way so an old ?theme= link still lands, and a style that reorders its
  // three should not silently repaint everybody's saved pick.
  const [palette, setPalette] = useState<string>(STORY_STYLES.plain.palettes[0].label);
  const [showPhoto, setShowPhoto] = useState(true);

  const [from, setFrom] = useState(firstIso > today ? firstIso : today);
  const [days, setDays] = useState(7);

  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"dates" | "classes" | "style" | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  // Adding a class changes the week without changing a single control, so the
  // picture has no reason of its own to redraw. This is that reason.
  const [bust, setBust] = useState(0);

  const style = STORY_STYLES[styleId];
  // Self-healing the way the route does: a colourway that does not belong to
  // the style in front of you falls back to that style's first, so switching
  // style never leaves the swatch row pointing at nothing.
  const look = style.palettes.find((p) => p.label === palette) ?? style.palettes[0];

  useEffect(() => {
    getStoryPrefs().then((p) => setShowPhoto(p.showPhoto));
  }, []);

  // The rows behind the count and the picker. Never filtered on the client:
  // the picture is drawn from the same loader on the server, and two filters
  // would drift.
  const load = useCallback(() => {
    let live = true;
    setRows(null);
    shareRows({ from, days }).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [from, days, bust]);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => !hidden.has(r.key));
  const bare = rows !== null && shown.length === 0;

  const q = new URLSearchParams({
    style: styleId,
    palette: look.label,
    from,
    days: String(days),
    headline: HEADLINE,
    photo: showPhoto ? "1" : "0",
  });
  const hideList = [...hidden].join(",");
  if (hideList) q.set("hide", hideList);
  if (bust) q.set("v", String(bust));
  const src = `/api/story/compose?${q.toString()}`;
  const fileName = `fittlist-${styleId}-${look.label.toLowerCase()}.png`;

  // Changing the range changes which keys exist, and a key hidden out of one
  // range means nothing in another: carrying them across would silently drop
  // rows from a week nobody had looked at.
  const pickRange = (nextFrom: string, nextDays: number) => {
    setFrom(nextFrom);
    setDays(nextDays);
    setHidden(new Set());
  };

  const togglePhoto = async () => {
    const v = !showPhoto;
    setShowPhoto(v);
    await setStoryPrefs({ showPhoto: v });
  };

  // The system sheet, which is where Save Image lives too: one button,
  // because a second one opening the same sheet was the same act twice.
  const share = async () => {
    if (busy) return;
    setBusy(true);
    if (!(await putImage(src, fileName))) toast("Couldn't share the image");
    setBusy(false);
  };

  const starts = Array.from({ length: START_DAYS }, (_, i) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10),
  );

  return (
    <div className="composer">
      <div className="adderhead">
        <h2>Share your schedule</h2>
        {/* Opened from the calendar there is always something beneath, and
            `anywhere` pops to it; typed cold there is not, and the calendar is
            the honest fallback rather than a dead button. */}
        <BackLink className="iconbtn sheetclose adderclose" href="/calendar" anywhere label="Close">
          <Icon name="close" size={16} />
        </BackLink>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <StoryPreview src={src} alt="Story image of your week" bg={look.bg} />

      {/* The three questions, under the thing they are about. Each is a row
          that says where it stands, so the screen answers most of itself
          without a tap. */}
      <div className="storycustom">
        <button className="comprow" onClick={() => setSheet("dates")}>
          <span className="comprow-t">
            Dates
            <small>{rangeWords(from, days)}</small>
          </span>
          <span className="comprow-a">Edit ›</span>
        </button>

        <button className="comprow" onClick={() => setSheet("classes")}>
          <span className="comprow-t">
            Classes
            <small>
              {rows === null
                ? "Loading"
                : rows.length === 0
                  ? "Nothing in these days"
                  : shown.length === rows.length
                    ? `All ${rows.length} showing`
                    : `${shown.length} of ${rows.length} showing`}
            </small>
          </span>
          <span className="comprow-a">Edit ›</span>
        </button>

        <button className="comprow" onClick={() => setSheet("style")}>
          <span className="comprow-t">
            Style
            <small>
              {style.label} · {look.label}
            </small>
          </span>
          <span className="comprow-sw">
            <span
              className="swd"
              style={{ background: look.bg, borderColor: look.accent }}
              aria-hidden="true"
            />
            <span className="comprow-a">Edit ›</span>
          </span>
        </button>

        {hasPhoto && (
          <button className="storyphoto" onClick={togglePhoto} aria-pressed={showPhoto}>
            <span>Show my photo</span>
            <span className={`switch${showPhoto ? " on" : ""}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>
        )}
      </div>

      <div className="publishwrap">
        {bare ? (
          <button className="btn compwarn" onClick={() => setAdding(true)}>
            Add a class you coach
          </button>
        ) : (
          <button className="btn" disabled={busy || rows === null} onClick={share}>
            {busy ? "Opening…" : "Share image"}
          </button>
        )}
      </div>

      {sheet === "dates" && (
        <Sheet title="Dates" lead={rangeWords(from, days)} onClose={() => setSheet(null)}>
          {/* Which day it starts on, as a rail of the next fortnight. A date
              field would be the same question asked in a way somebody has to
              type, and the answer is nearly always one of the next few days. */}
          <label className="flabel">Starting</label>
          <div className="dayrail">
            {starts.map((iso) => {
              const d = new Date(`${iso}T00:00:00Z`);
              const on = iso === from;
              return (
                <button
                  key={iso}
                  className={`daychip${on ? " sel" : ""}`}
                  aria-pressed={on}
                  onClick={() => pickRange(iso, days)}
                >
                  <span className="daychip-dow">
                    {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                  </span>
                  <span className="daychip-n">{d.getUTCDate()}</span>
                </button>
              );
            })}
          </div>

          {/* One to seven. Seven is the ceiling because the canvas is fixed
              and `planStory` has to fit it; one is the floor because "I'm at
              this tonight" is a real thing to post. */}
          <label className="flabel">How many days</label>
          <div className="dayrail">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                className={`lenchip${n === days ? " sel" : ""}`}
                aria-pressed={n === days}
                onClick={() => pickRange(from, n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="compnote">
            The picture covers these days whatever is on them. A day with nothing on it is left
            off rather than drawn empty.
          </p>
        </Sheet>
      )}

      {sheet === "classes" && (
        <Sheet
          title="Classes on your image"
          lead={rangeWords(from, days)}
          onClose={() => setSheet(null)}
        >
          {rows && rows.length > 0 ? (
            <div className="settingslist">
              {rows.map((r) => {
                const on = !hidden.has(r.key);
                return (
                  <button
                    key={r.key}
                    className="setrow"
                    aria-pressed={on}
                    onClick={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                  >
                    <span className="setrow-txt">
                      <span className="t">
                        {r.when} · {r.name}
                      </span>
                      {r.sub && <span className="s">{r.sub}</span>}
                    </span>
                    <span className={`compcheck${on ? " on" : ""}`} aria-hidden="true">
                      {on && <Icon name="check" size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="lead">Nothing on your calendar in these days yet.</p>
          )}
          {/* The point of the whole screen. Picking what goes on the image and
              keeping your calendar are the same list, so doing one does the
              other: a class typed here lands on the calendar, and when a
              studio was named it lands in that studio's catalog too, which is
              how a studio that isn't here yet arrives with a real class
              already on it. */}
          <button className="compadd" onClick={() => setAdding(true)}>
            + Add a class
          </button>
          <p className="compnote">
            Unchecking hides a class from the image. It stays on your calendar. Anything you add
            here is added to your calendar too.
          </p>
        </Sheet>
      )}

      {sheet === "style" && (
        <Sheet
          title="Style"
          lead="How loud the picture is, then which of its three colours."
          onClose={() => setSheet(null)}
        >
          {/* Loud to quiet, because that is the order somebody scans them in
              and the quiet ones are what most people settle on. */}
          <div className="stylegrid">
            {(Object.entries(STORY_STYLES) as [StoryStyleId, (typeof STORY_STYLES)["plain"]][]).map(
              ([id, s]) => {
                const on = id === styleId;
                const sw = s.palettes.find((p) => p.label === palette) ?? s.palettes[0];
                return (
                  <button
                    key={id}
                    className={`stylecard${on ? " sel" : ""}`}
                    aria-pressed={on}
                    onClick={() => {
                      setStyleId(id);
                      // Keep the colourway if this style is offered in it,
                      // otherwise take its first. Somebody who has found their
                      // colour should be able to try every style without
                      // losing it, and a style that cannot wear it should not
                      // pretend to.
                      setPalette(
                        (s.palettes.find((p) => p.label === palette) ?? s.palettes[0]).label,
                      );
                    }}
                  >
                    <span
                      className="stylecard-sw"
                      style={{ background: sw.bg, color: sw.fg, borderColor: sw.accent }}
                      aria-hidden="true"
                    >
                      <span className="stylecard-bar" style={{ background: sw.accent }} />
                      <span className="stylecard-line" style={{ background: sw.fg }} />
                      <span className="stylecard-line short" style={{ background: sw.faint }} />
                    </span>
                    <span className="stylecard-lbl">{s.label}</span>
                  </button>
                );
              },
            )}
          </div>

          {/* Three, not eight. Colour belongs to the style rather than sitting
              beside it as a free second axis: ten styles times eight palettes
              is eighty posters and most of them are wrong, because the loud
              ones depend on specific pairings a global picker would happily
              break. */}
          <label className="flabel">Colour</label>
          <div className="palrow">
            {style.palettes.map((p) => {
              const on = p.label === look.label;
              return (
                <button
                  key={p.label}
                  className={`palchip${on ? " sel" : ""}`}
                  aria-pressed={on}
                  onClick={() => setPalette(p.label)}
                >
                  <span
                    className="swd"
                    style={{ background: p.bg, borderColor: p.accent }}
                    aria-hidden="true"
                  />
                  {p.label}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {adding && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          onClose={() => setAdding(false)}
          onToast={toast}
          onPublished={(msg) => {
            setAdding(false);
            // The week changed under a picture whose controls did not, so the
            // redraw has to be asked for.
            setBust((n) => n + 1);
            toast(msg);
          }}
          onDeleted={(msg) => {
            setAdding(false);
            setBust((n) => n + 1);
            toast(msg);
          }}
        />
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

/** The one sheet shape all three questions wear. Three sheets that differed by
 *  a heading is three chances for them to stop matching. */
function Sheet({
  title,
  lead,
  onClose,
  children,
}: {
  title: string;
  lead: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2>{title}</h2>
        <p className="lead">{lead}</p>
        {children}
        <div className="publishwrap">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** The days the picture covers, said the way a person would. One day names
 *  itself; anything longer names both ends. */
function rangeWords(from: string, days: number): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  if (days === 1) return fmt(from);
  const last = new Date(Date.parse(`${from}T00:00:00Z`) + (days - 1) * 864e5)
    .toISOString()
    .slice(0, 10);
  return `${fmt(from)} to ${fmt(last)}`;
}
