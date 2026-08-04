"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { shareRows, type ShareRow } from "@/app/actions/share";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import type { ShareKind } from "@/lib/shareweek";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The share composer: the picture first, the controls under it, one Share.
//
// Five things about the old editor made it a form rather than a composer, and
// each is answered here. The preview sat below three controls and was cropped
// by the time you scrolled to it, so it is on top and takes every pixel the
// controls don't. Style was a dropdown, so it is swatches. The headline was a
// blank field duplicating a choice already made, so it is derived from the
// segment and edited only if somebody wants to. Save and Share were two
// buttons for one intent, so Share leads and Save is the quiet one under it.
// And an empty week produced an empty image, so it produces an offer instead.

/** What the picture says at the top, per hat. Derived, never a blank field. */
const HEADLINE: Record<ShareKind, string> = {
  coaching: "Come train with me",
  going: "My week",
};

type Fmt = "story" | "square";

export function ShareComposer({
  canCoach,
  hasPhoto,
  hasCity,
  today,
  firstIso,
}: {
  /** A member has one hat, so the segment would be a control with one option.
   *  It is removed rather than disabled, and their model stays as simple as it
   *  should be. */
  canCoach: boolean;
  hasPhoto: boolean;
  hasCity: boolean;
  today: string;
  /** The first day their week holds something, so the composer opens on a
   *  picture rather than on an empty one they have to work out. */
  firstIso: string;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();

  const [kind, setKind] = useState<ShareKind>(canCoach ? "coaching" : "going");
  const [fmt, setFmt] = useState<Fmt>("story");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [from, setFrom] = useState(firstIso);
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState(true);

  // Their own words win from the moment they type any. A coach who writes
  // something personal, switches segments to see how it looks and loses it
  // will not write anything personal again.
  const [headline, setHeadline] = useState(HEADLINE[canCoach ? "coaching" : "going"]);
  const [ownWords, setOwnWords] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const [showPhoto, setShowPhoto] = useState(true);
  const [showStudios, setShowStudios] = useState(true);
  const [showCity, setShowCity] = useState(true);
  const [more, setMore] = useState(false);

  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
    getStoryPrefs().then((p) => {
      if (p.headline) {
        setHeadline(p.headline);
        setOwnWords(true);
      }
      setShowPhoto(p.showPhoto);
    });
  }, []);

  // The rows behind the count and the picker. Reloaded whenever the question
  // changes, never filtered on the client: the picture is drawn from the same
  // loader on the server, and two filters would drift.
  const load = useCallback(() => {
    let live = true;
    setRows(null);
    shareRows({ kind, from, days }).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [kind, from, days]);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => !hidden.has(r.key));
  const bare = rows !== null && shown.length === 0;

  const q = new URLSearchParams({
    kind,
    fmt,
    theme: themeId,
    from,
    days: String(days),
    headline,
    photo: showPhoto ? "1" : "0",
    studios: showStudios ? "1" : "0",
    city: showCity ? "1" : "0",
  });
  const hideList = [...hidden].join(",");
  if (hideList) q.set("hide", hideList);
  const src = `/api/story/compose?${q.toString()}`;
  const fileName = `fittlist-${kind}-${fmt}.png`;

  const pickKind = (k: ShareKind) => {
    setKind(k);
    if (!ownWords) setHeadline(HEADLINE[k]);
    // A hidden class belongs to the list it was hidden from; carrying the
    // keys across would silently drop rows from a week nobody had looked at.
    setHidden(new Set());
  };

  const saveHeadline = async () => {
    const clean = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (!clean) return;
    setHeadline(clean);
    setOwnWords(true);
    await setStoryPrefs({ headline: clean });
  };

  const resetHeadline = async () => {
    setEditing(false);
    setOwnWords(false);
    setHeadline(HEADLINE[kind]);
    await setStoryPrefs({ headline: "" });
  };

  const togglePhoto = async () => {
    const v = !showPhoto;
    setShowPhoto(v);
    await setStoryPrefs({ showPhoto: v });
  };

  const doShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(src);
        if (res.ok) {
          const file = new File([await res.blob()], fileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = src;
      a.download = fileName;
      a.click();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  const save = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = fileName;
    a.click();
  };

  // An empty range is an offer, not a broken picture. A coach with an empty
  // week almost never has an empty week; they have a stale calendar, so the
  // ask is to add one. A member's calendar does not depend on coaches, so
  // theirs leads with their own.
  const emptyCta = kind === "coaching" ? "Add a class you coach" : "Add something to your week";
  const goAdd = () => router.push(kind === "coaching" ? "/app?add=1" : "/week?add=1");

  return (
    <div className="composer">
      <div className="comphead">
        <h1>Share</h1>
        {/* Format is a property of the output rather than of the content, so
            it sits with the title and not in the drawer with the choices
            about what to draw. */}
        <div className="compfmt" role="group" aria-label="Format">
          <button aria-pressed={fmt === "story"} onClick={() => setFmt("story")}>
            Story
          </button>
          <button aria-pressed={fmt === "square"} onClick={() => setFmt("square")}>
            Square
          </button>
        </div>
        {/* Opened from the tab bar there is always something beneath, and
            `anywhere` pops to it; typed cold there is not, and the feed is
            the honest fallback rather than a dead button. */}
        <BackLink className="iconbtn compx" href="/feed" anywhere label="Close">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      <div className={`compstage${open ? "" : " wide"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`compimg${fmt === "square" ? " sq" : ""}`}
          src={src}
          alt={`Preview of your ${fmt === "square" ? "square" : "story"} image`}
        />
      </div>

      <div className={`compdrawer${open ? "" : " shut"}`}>
        {/* The way in and out of the tools is this one tab. There is no pull
            bar above it: two affordances for one act is one too many, and the
            word says what the shape only hints at. */}
        <button
          className="comptab"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "expand_more" : "expand_less"} size={16} />
          {open ? "Done editing" : "Edit"}
        </button>

        <div className="compctls" hidden={!open}>
          {canCoach && (
            <div className="compctl">
              <div className="complbl">What to show</div>
              <div className="compseg" role="group" aria-label="What to show">
                <button
                  aria-pressed={kind === "coaching"}
                  onClick={() => pickKind("coaching")}
                >
                  Coaching
                </button>
                <button aria-pressed={kind === "going"} onClick={() => pickKind("going")}>
                  Going
                </button>
              </div>
            </div>
          )}

          <div className="compctl">
            <div className="complbl">Headline</div>
            <div className="comphl">
              <em>{headline}</em>
              <button
                className="comphl-edit"
                onClick={() => {
                  setDraft(headline);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            </div>
          </div>

          <div className="compctl">
            <div className="compfields">
              <label className="compfield">
                <span className="complbl">Starts</span>
                <input
                  className="editinput"
                  type="date"
                  value={from}
                  min={today}
                  onChange={(e) => setFrom(e.target.value || today)}
                />
              </label>
              <label className="compfield days">
                <span className="complbl">Days</span>
                <select
                  className="editinput"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="comprange">{rangeWords(from, days)}</p>
            <button className="comprow" onClick={() => setPicker(true)}>
              <span className="comprow-t">
                Classes
                <small>
                  {rows === null
                    ? "Loading"
                    : rows.length === 0
                      ? "Nothing in this range"
                      : shown.length === rows.length
                        ? `All ${rows.length} showing`
                        : `${shown.length} of ${rows.length} showing`}
                </small>
              </span>
              <span className="comprow-a">Edit ›</span>
            </button>
          </div>

          <div className="compctl">
            <div className="complbl">Style</div>
            <div className="compsw">
              {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(
                ([id, t]) => (
                  <button
                    key={id}
                    className="compsw-b"
                    aria-pressed={id === themeId}
                    aria-label={t.label}
                    title={t.label}
                    style={{ background: t.bg }}
                    onClick={() => setThemeId(id)}
                  >
                    <span style={{ background: t.accent }} />
                  </button>
                ),
              )}
            </div>
          </div>

          <button className="compmore" onClick={() => setMore((v) => !v)}>
            More options {more ? "▴" : "▾"}
          </button>
          {more && (
            <div className="compctl compmorebox">
              {hasPhoto && (
                <Switch on={showPhoto} onTap={togglePhoto} title="Show my photo" />
              )}
              <Switch
                on={showStudios}
                onTap={() => setShowStudios((v) => !v)}
                title="Show studio names"
                sub="Off keeps a busy week short"
              />
              {hasCity && (
                <Switch on={showCity} onTap={() => setShowCity((v) => !v)} title="Show city" />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="compacts">
        {bare ? (
          <button className="btn compwarn" onClick={goAdd}>
            {emptyCta}
          </button>
        ) : (
          <>
            <button className="btn" disabled={sharing || rows === null} onClick={doShare}>
              {sharing ? "Opening…" : "Share"}
            </button>
            <button className="compsave" onClick={save}>
              Save to photos
            </button>
          </>
        )}
      </div>

      {editing && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setEditing(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Headline</h2>
            <input
              className="editinput"
              type="text"
              maxLength={28}
              autoFocus
              value={draft}
              placeholder={HEADLINE[kind]}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveHeadline();
              }}
            />
            <div className="publishwrap">
              <button className="btn" onClick={saveHeadline}>
                Save
              </button>
              {ownWords && (
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={resetHeadline}>
                  Use the default again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {picker && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPicker(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setPicker(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Classes on your image</h2>
            <p className="lead">{rangeWords(from, days)}</p>
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
              <p className="lead">Nothing in this range yet.</p>
            )}
            {/* Said out loud, because without it people read a checkbox as a
                delete and stop touching the control that makes the picture
                worth sending. */}
            <p className="compnote">
              Unchecking hides a class from the image. It stays on your calendar.
            </p>
            <div className="publishwrap">
              <button className="btn" onClick={() => setPicker(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

function Switch({
  on,
  onTap,
  title,
  sub,
}: {
  on: boolean;
  onTap: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <button className="storyphoto" onClick={onTap} aria-pressed={on}>
      <span>
        {title}
        {sub && <small>{sub}</small>}
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}

/** The range in words, under the two fields: "Mon Aug 3 to Sun Aug 9". Two
 *  compact fields plus one line of confirmation beats a scrolling strip of
 *  dates and a row of number buttons. */
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
