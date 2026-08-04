"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { shareRows, type ShareRow } from "@/app/actions/share";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import type { ShareKind } from "@/lib/shareweek";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder } from "@/components/Adder";
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

/**
 * What the picture says at the top, and the whole of what it can say.
 *
 * It was a line with an Edit beside it, which was already the small version of
 * a blank field; both are gone. The headline is a function of the segment, so
 * there is nothing here to get wrong, nothing to leave half-typed, and no
 * saved words to quietly override the hat you are standing on. The composer
 * sends it explicitly for that last reason: a coach who typed one into the old
 * sheet has it on `storyPrefs`, and falling back to that would put their
 * Coaching words over a Going picture.
 */
const HEADLINE: Record<ShareKind, string> = {
  coaching: "Come train with me",
  going: "My week",
};

export function ShareComposer({
  canCoach,
  hasPhoto,
  hasCity,
  today,
  firstIso,
  studios,
  templates,
  customTypes,
  lastUsed,
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
  /** The adder's ingredients. Making the picture and keeping the calendar are
   *  the same act here: a class typed into the classes sheet lands on the
   *  calendar, and when a studio was named it lands in that studio's catalog
   *  too, so the next person to add it gets the details already filled in. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();

  const [kind, setKind] = useState<ShareKind>(canCoach ? "coaching" : "going");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [from, setFrom] = useState(firstIso);
  const [days, setDays] = useState(7);
  // Shut on arrival: you open this screen to see the picture, not to fill in
  // a form, and the whole point of the drawer is that the picture gets the
  // room when the tools are not in use. Everything is already answered when
  // you land (the hat, the range, the style), so the first thing on screen is
  // a result rather than a set of questions about one.
  const [open, setOpen] = useState(false);

  const headline = HEADLINE[kind];

  const [showPhoto, setShowPhoto] = useState(true);
  const [showStudios, setShowStudios] = useState(true);
  const [showCity, setShowCity] = useState(true);
  const [more, setMore] = useState(false);

  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  // Adding a class changes the week without changing a single control, so the
  // picture has no reason of its own to redraw. This is that reason.
  const [bust, setBust] = useState(0);

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
    getStoryPrefs().then((p) => setShowPhoto(p.showPhoto));
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
  }, [kind, from, days, bust]);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => !hidden.has(r.key));
  const bare = rows !== null && shown.length === 0;

  const q = new URLSearchParams({
    kind,
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
  if (bust) q.set("v", String(bust));
  const src = `/api/story/compose?${q.toString()}`;
  const fileName = `fittlist-${kind}.png`;

  const pickKind = (k: ShareKind) => {
    setKind(k);
    // A hidden class belongs to the list it was hidden from; carrying the
    // keys across would silently drop rows from a week nobody had looked at.
    setHidden(new Set());
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
        {/* Opened from the tab bar there is always something beneath, and
            `anywhere` pops to it; typed cold there is not, and the feed is
            the honest fallback rather than a dead button. */}
        <BackLink className="iconbtn compx" href="/feed" anywhere label="Close">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      <div className="compstage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="compimg" src={src} alt="Preview of your story image" />
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
            {/* The point of the whole screen. Picking what goes on the
                image and keeping your calendar are the same list, so doing
                one does the other: a class typed here lands on the calendar,
                and when a studio was named it lands in that studio's catalog
                too, which is how a studio that isn't here yet arrives with a
                real class already on it. */}
            <button className="compadd" onClick={() => setAdding(true)}>
              + Add a class
            </button>
            <p className="compnote">
              Unchecking hides a class from the image. It stays on your calendar.
              Anything you add here is added to your calendar too.
            </p>
            <div className="publishwrap">
              <button className="btn" onClick={() => setPicker(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          // Which hat you are wearing decides which form you get: the
          // Coaching picture is made of classes you publish, the Going one of
          // classes you attend. Asking again here would be asking a question
          // the segment above has already answered.
          personal={kind === "going" ? { canCoach: false } : undefined}
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
