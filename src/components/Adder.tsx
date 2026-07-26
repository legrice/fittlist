"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteClass,
  getStudioCatalog,
  publishClasses,
  updateClass,
} from "@/app/actions/classes";
import { createStudio } from "@/app/actions/studios";
import type { BookingLink } from "@/db/schema";
import {
  CLASS_TYPES,
  DAYS,
  detectProvider,
  fmtDate,
  fmtTime,
  minutesToTime,
  palForSeq,
  timeToMinutes,
} from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Icon } from "@/components/Icon";

export type AdderPrefill = {
  name: string;
  classType?: string | null;
  description?: string | null;
  startTime: string;
  durationMin: number;
  studioId: string;
  links: BookingLink[];
  days?: number[]; // preselected (edit); empty for duplicate
  specificDate?: string | null; // set = editing a one-off pinned to this date
  classId?: string; // set = edit this class in place
};

type Stage = "start" | "form" | "pick" | "new";

export function Adder({
  studios: studiosProp,
  templates,
  customTypes,
  lastUsed,
  subsCount,
  prefill,
  firstPublish,
  onClose,
  onToast,
  onPublished,
  onDeleted,
}: {
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
  prefill?: AdderPrefill;
  firstPublish: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onPublished: (msg: string) => void;
  onDeleted: (msg: string) => void;
}) {
  const isEdit = Boolean(prefill?.classId);
  const [studios, setStudios] = useState(studiosProp);
  // Add always opens straight to the new-class form; saved classes are reused
  // via the class-name field's autocomplete rather than a separate stage.
  const [stage, setStage] = useState<Stage>("form");
  const [heading, setHeading] = useState<{ title: string; lead: string }>(
    isEdit
      ? { title: "Edit class", lead: "Change anything. One save updates your page." }
      : prefill
        ? { title: "Duplicate class", lead: "Same class. Pick the new days." }
        : {
            title: "New class",
            lead: "Type it once and fittlist remembers the whole class. Pick days; one publish covers them all.",
          },
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [classType, setClassType] = useState<string | null>(prefill?.classType ?? null);
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [days, setDays] = useState<Set<number>>(new Set(prefill?.days ?? []));
  const [mode, setMode] = useState<"weekly" | "date">(prefill?.specificDate ? "date" : "weekly");
  const [date, setDate] = useState(prefill?.specificDate ?? "");
  const initStart = prefill?.startTime ?? lastUsed.startTime;
  const initDur = prefill?.durationMin ?? lastUsed.durationMin;
  const [time, setTime] = useState(initStart);
  const [end, setEnd] = useState(minutesToTime(timeToMinutes(initStart) + initDur));
  // No studio prefill on a brand-new class: an already-filled gym reads as a
  // mistake. Editing/duplicating still carries the class's studio.
  const [studioId, setStudioId] = useState<string | null>(prefill?.studioId ?? null);
  const [links, setLinks] = useState<BookingLink[]>(prefill?.links ?? []);
  const [sugOpen, setSugOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [nsName, setNsName] = useState("");
  const [nsAddr, setNsAddr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // Studio-first: the class list is scoped to the chosen studio's catalog.
  const [catalog, setCatalog] = useState<
    { name: string; classType: string | null; description: string | null }[]
  >([]);
  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const selectedStudio = studioId ? studioById.get(studioId) : undefined;

  // Load the studio's shared class catalog whenever the studio changes.
  useEffect(() => {
    if (!studioId) {
      setCatalog([]);
      return;
    }
    let live = true;
    getStudioCatalog(studioId).then((rows) => {
      if (live) setCatalog(rows);
    });
    return () => {
      live = false;
    };
  }, [studioId]);

  // Reuse a class already logged at this studio: fills the name, type, and
  // description, leaving the coach to set their own time, days, and links.
  const fillFromCatalog = (c: { name: string; classType: string | null; description: string | null }) => {
    setName(c.name);
    setClassType(c.classType ?? null);
    setDescription(c.description ?? "");
  };

  // The Type dropdown: curated categories, any types already saved for this
  // coach, plus the class's own type if it isn't in either list yet (e.g.
  // editing an older class).
  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...CLASS_TYPES, ...customTypes, ...(classType ? [classType] : [])]) {
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  }, [customTypes, classType]);

  // Length is the gap between start and end; changing the start slides the end
  // to keep the same length (like a calendar event), changing the end sets it.
  const durationMin = timeToMinutes(end) - timeToMinutes(time);
  const durValid = durationMin > 0;
  const changeStart = (v: string) => {
    if (!v) return;
    if (durValid) setEnd(minutesToTime(timeToMinutes(v) + durationMin));
    setTime(v);
  };

  // Classes already run at the chosen studio, offered in the name field: all of
  // them when the field is empty, filtered as you type.
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    const pool = q
      ? catalog.filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
      : catalog;
    return pool.slice(0, 8);
  }, [name, catalog]);

  const toggleDay = (i: number) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const dayList = DAYS.filter((_, i) => days.has(i));
  const n = days.size;
  const oneTime = mode === "date";
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const whenChosen = oneTime ? dateValid : n > 0;
  const emailSuffix = subsCount ? ` · emails ${subsCount}` : "";
  const publishLabel = !whenChosen
    ? oneTime
      ? "Pick a date"
      : "Pick at least one day"
    : !selectedStudio
      ? "Pick a studio"
      : !durValid
        ? "End time must be after start"
        : oneTime
          ? `${isEdit ? "Save changes" : "Publish"} · ${fmtDate(date)} · ${fmtTime(time)}${emailSuffix}`
          : `${isEdit ? "Save changes" : `Publish ${n > 1 ? `${n} classes` : ""}`} · ${dayList.join(", ")} · ${fmtTime(time)}${emailSuffix}`;

  const publish = () => {
    if (!whenChosen || !studioId || !durValid) return;
    startTransition(async () => {
      const input = {
        name,
        classType,
        description,
        days: [...days],
        specificDate: oneTime ? date : null,
        startTime: time,
        durationMin,
        studioId,
        links,
      };
      const res = isEdit
        ? await updateClass(prefill!.classId!, input)
        : await publishClasses(input);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      const emailed = res.notified ?? 0;
      const emailedSuffix = emailed
        ? ` · emailed ${emailed} ${emailed === 1 ? "person" : "people"}`
        : "";
      onPublished(
        isEdit
          ? `Saved${emailedSuffix}`
          : firstPublish
            ? "Your page is live"
            : emailed
              ? `Published${emailedSuffix}`
              : `Published${n > 1 ? ` ${n} classes` : ""}`,
      );
    });
  };

  const doDelete = () => {
    if (!prefill?.classId) return;
    startTransition(async () => {
      const res = await deleteClass(prefill.classId!);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      const emailed = res.notified ?? 0;
      onDeleted(
        emailed
          ? `Deleted · emailed ${emailed} ${emailed === 1 ? "person" : "people"}`
          : "Deleted",
      );
    });
  };

  const addStudio = () => {
    startTransition(async () => {
      const res = await createStudio(nsName, nsAddr);
      if (!res.ok || !res.studio) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      setStudios((prev) => [...prev, res.studio!]);
      setStudioId(res.studio.id);
      setStage("form");
      onToast("Added to the studio directory");
    });
  };

  const filteredStudios = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studios.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
    );
  }, [studios, search]);

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet adder">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>


        {stage === "form" && (
          <div>
            <h2>{heading.title}</h2>

            {/* Studio first — the class list below is scoped to it. */}
            <div className="adder-card">
            <label className="flabel">Studio</label>
            <button className="studio-sel" onClick={() => setStage("pick")}>
              {selectedStudio ? (
                <span className="studio-sel-txt">
                  <span className="nm">{selectedStudio.name}</span>
                  <span className="ad">{selectedStudio.address}</span>
                </span>
              ) : (
                <span className="nm placeholder">Select or start typing a studio</span>
              )}
              <span className="chev"><Icon name="chevron_right" size={18} /></span>
            </button>
            </div>

            <div className="adder-card">
            <label className="flabel" htmlFor="fName">
              Class name
              {selectedStudio && catalog.length > 0 && !isEdit && (
                <span> · type new or pick one from this studio</span>
              )}
            </label>
            <div className="namefield">
              <input
                type="text"
                id="fName"
                placeholder="e.g. Barbell Strength"
                autoComplete="off"
                value={name}
                onFocus={() => setSugOpen(true)}
                onChange={(e) => {
                  setName(e.target.value);
                  setSugOpen(true);
                }}
                onBlur={() => setTimeout(() => setSugOpen(false), 150)}
              />
              {sugOpen && suggestions.length > 0 && (
                <div className="namesug">
                  {suggestions.map((c) => (
                    <button
                      key={c.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        fillFromCatalog(c);
                        setSugOpen(false);
                        onToast("Filled from this studio");
                      }}
                    >
                      <span className="namesug-nm">{c.name}</span>
                      {c.classType && <span className="sub">{c.classType}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!selectedStudio && (
              <p className="durnote" style={{ marginTop: 8 }}>
                Pick a studio to see its classes.
              </p>
            )}

            <label className="flabel" htmlFor="fType">
              Type <span>· optional</span>
            </label>
            <select
              id="fType"
              className="typeselect"
              value={classType ?? ""}
              onChange={(e) => setClassType(e.target.value || null)}
            >
              <option value="">No type</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label className="flabel" htmlFor="fDesc">
              Description <span>· optional, shown on the class page</span>
            </label>
            <textarea
              id="fDesc"
              className="abouttext"
              value={description}
              maxLength={500}
              rows={3}
              placeholder="What to expect, what to bring, who it's for…"
              onChange={(e) => setDescription(e.target.value)}
            />
            </div>

            <div className="adder-card">
            <label className="flabel">When</label>
            <div className="modetoggle">
              <button
                className={!oneTime ? "sel" : ""}
                onClick={() => setMode("weekly")}
                type="button"
              >
                Repeats weekly
              </button>
              <button
                className={oneTime ? "sel" : ""}
                onClick={() => setMode("date")}
                type="button"
              >
                One-time
              </button>
            </div>

            {oneTime ? (
              <>
                <label className="flabel">Date</label>
                <div className="timegrid">
                  <input
                    type="date"
                    className="timeinput"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Class date"
                  />
                </div>
              </>
            ) : (
              <>
                <label className="flabel">
                  Days <span>· tap all that apply</span>
                </label>
                <div className="daypick">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      className={days.has(i) ? "sel" : ""}
                      onClick={() => toggleDay(i)}
                    >
                      {d[0]}
                      {d[1].toLowerCase()}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="timegrid two">
              <div>
                <label className="flabel" htmlFor="fStart">Start</label>
                <input
                  id="fStart"
                  type="time"
                  className="timeinput"
                  value={time}
                  onChange={(e) => changeStart(e.target.value)}
                  aria-label="Start time"
                />
              </div>
              <div>
                <label className="flabel" htmlFor="fEnd">End</label>
                <input
                  id="fEnd"
                  type="time"
                  className={`timeinput${durValid ? "" : " invalid"}`}
                  value={end}
                  onChange={(e) => e.target.value && setEnd(e.target.value)}
                  aria-label="End time"
                />
              </div>
            </div>
            <div className="durnote">
              {durValid ? `${durationMin} min` : "End time must be after start"}
            </div>
            </div>

            <div className="adder-card">
            <label className="flabel">
              Booking &amp; profile links <span>· paste any link, we tag it</span>
            </label>
            <div>
              {links.map((l, i) => (
                <div className="linkrow" key={i}>
                  <div className="linkfield">
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="Paste a link"
                      value={l.url}
                      aria-label="Link"
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(e) =>
                        setLinks((prev) =>
                          prev.map((x, xi) =>
                            xi === i ? { url: e.target.value, label: detectProvider(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    {l.url.trim() && (
                      <span className="linktag">
                        <Icon name="check" size={13} /> {detectProvider(l.url)}
                      </span>
                    )}
                  </div>
                  <button
                    className="iconbtn"
                    aria-label="Remove link"
                    onClick={() => setLinks((prev) => prev.filter((_, xi) => xi !== i))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="linktoggle"
              onClick={() => setLinks((prev) => [...prev, { label: "Website", url: "" }])}
            >
              + Add link
            </button>
            </div>

            <div className="publishwrap">
              <button className="btn si" disabled={!whenChosen || pending} onClick={publish}>
                {pending ? (isEdit ? "Saving…" : "Publishing…") : publishLabel}
              </button>
            </div>

            {isEdit && (
              <div className="dangerzone">
                {confirmDelete ? (
                  <>
                    <p className="lead" style={{ marginBottom: 12 }}>
                      Delete this class? It disappears from your public page and your list gets
                      notified. This can&rsquo;t be undone.
                    </p>
                    <button className="btn si" disabled={pending} onClick={doDelete}>
                      {pending ? "Deleting…" : "Yes, delete it"}
                    </button>
                    <button className="keep" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button className="deletelink" onClick={() => setConfirmDelete(true)}>
                    Delete this class
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {stage === "pick" && (
          <div>
            <button className="backbtn" onClick={() => setStage("form")}>
              &larr; Back
            </button>
            <h2>Choose a studio</h2>
            <div className="searchbox">
              <span className="mag"><Icon name="search" size={17} /></span>
              <input
                type="text"
                placeholder="Name or street"
                autoComplete="off"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              {filteredStudios.length ? (
                filteredStudios.map((s) => {
                  const p = palForSeq(s.seq);
                  return (
                    <button
                      key={s.id}
                      className="studio-row"
                      onClick={() => {
                        setStudioId(s.id);
                        setStage("form");
                      }}
                    >
                      <span className="swd" style={{ background: p.rail }} />
                      <span>
                        <span className="nm">{s.name}</span>
                        <br />
                        <span className="ad">{s.address}</span>
                      </span>
                      {studioId === s.id && <span className="tick"><Icon name="check" size={16} /></span>}
                    </button>
                  );
                })
              ) : (
                <p className="empty">
                  Nothing named &ldquo;{search.trim()}&rdquo; yet. Add it below. Takes ten seconds.
                </p>
              )}
            </div>
            <button className="addnew" onClick={() => setStage("new")}>
              + New studio
            </button>
            <div className="dirnote">Studios are shared. Add one once and every trainer can use it.</div>
          </div>
        )}

        {stage === "new" && (
          <div>
            <button className="backbtn" onClick={() => setStage("pick")}>
              &larr; Back
            </button>
            <h2>New studio</h2>
            <p className="lead">Name and address. That&rsquo;s the whole listing.</p>
            <label className="flabel" htmlFor="nsName">
              Studio name
            </label>
            <input
              type="text"
              id="nsName"
              placeholder="e.g. Palisade Barbell"
              autoComplete="off"
              autoFocus
              value={nsName}
              onChange={(e) => setNsName(e.target.value)}
            />
            <label className="flabel" htmlFor="nsAddr">
              Address
            </label>
            <input
              type="text"
              id="nsAddr"
              placeholder="e.g. 501 Palisade Ave, Jersey City"
              autoComplete="off"
              value={nsAddr}
              onChange={(e) => setNsAddr(e.target.value)}
            />
            <div className="publishwrap">
              <button
                className="btn si"
                disabled={pending || !nsName.trim() || !nsAddr.trim()}
                onClick={addStudio}
              >
                {pending ? "Adding…" : "Add studio"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
