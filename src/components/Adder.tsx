"use client";

import { useMemo, useState, useTransition } from "react";
import { publishClasses, updateClass } from "@/app/actions/classes";
import { createStudio } from "@/app/actions/studios";
import type { BookingLink } from "@/db/schema";
import { DAYS, DUR_PRESETS, LINK_LABELS, TIME_PRESETS, fmtTime, palForSeq } from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Icon } from "@/components/Icon";

export type AdderPrefill = {
  name: string;
  startTime: string;
  durationMin: number;
  studioId: string;
  links: BookingLink[];
  days?: number[]; // preselected (edit); empty for duplicate
  classId?: string; // set = edit this class in place
};

type Stage = "start" | "form" | "pick" | "new";

export function Adder({
  studios: studiosProp,
  templates,
  lastUsed,
  subsCount,
  prefill,
  firstPublish,
  onClose,
  onToast,
  onPublished,
}: {
  studios: StudioDto[];
  templates: TemplateDto[];
  lastUsed: LastUsed;
  subsCount: number;
  prefill?: AdderPrefill;
  firstPublish: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onPublished: (msg: string) => void;
}) {
  const isEdit = Boolean(prefill?.classId);
  const [studios, setStudios] = useState(studiosProp);
  const [stage, setStage] = useState<Stage>(prefill ? "form" : templates.length ? "start" : "form");
  const [heading, setHeading] = useState<{ title: string; lead: string }>(
    isEdit
      ? { title: "Edit class", lead: "Change anything — one save updates your page." }
      : prefill
        ? { title: "Duplicate class", lead: "Same class — pick the new days." }
        : {
            title: "New class",
            lead: "Type it once — fittlist remembers the whole class. Pick days; one publish covers them all.",
          },
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [days, setDays] = useState<Set<number>>(new Set(prefill?.days ?? []));
  const [time, setTime] = useState(prefill?.startTime ?? lastUsed.startTime);
  const [dur, setDur] = useState(prefill?.durationMin ?? lastUsed.durationMin);
  const [studioId, setStudioId] = useState<string | null>(prefill?.studioId ?? lastUsed.studioId);
  const [links, setLinks] = useState<BookingLink[]>(prefill?.links ?? []);
  const [sugOpen, setSugOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [nsName, setNsName] = useState("");
  const [nsAddr, setNsAddr] = useState("");
  const [pending, startTransition] = useTransition();

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const selectedStudio = studioId ? studioById.get(studioId) : undefined;

  const fillFromTemplate = (t: TemplateDto) => {
    setName(t.name);
    setTime(t.startTime);
    setDur(t.durationMin);
    setStudioId(t.studioId);
    setLinks(t.links.map((l) => ({ ...l })));
  };

  const pickSaved = (t: TemplateDto) => {
    fillFromTemplate(t);
    setHeading({ title: `Add ${t.name}`, lead: "Everything is filled — just pick the days." });
    setStage("form");
  };

  const newClass = () => {
    setName("");
    setLinks([]);
    setHeading({ title: "New class", lead: "Type it once — fittlist remembers the whole class." });
    setStage("form");
  };

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return [];
    return templates
      .filter((t) => t.name.toLowerCase().includes(q) && t.name.toLowerCase() !== q)
      .slice(0, 4);
  }, [name, templates]);

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
  const publishLabel =
    n === 0
      ? "Pick at least one day"
      : !selectedStudio
        ? "Pick a studio"
        : `${isEdit ? "Save changes" : `Publish ${n > 1 ? `${n} classes` : ""}`} · ${dayList.join(", ")} · ${fmtTime(time)}` +
          (subsCount ? ` · emails ${subsCount}` : "");

  const publish = () => {
    if (n === 0 || !studioId) return;
    startTransition(async () => {
      const input = {
        name,
        days: [...days],
        startTime: time,
        durationMin: dur,
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

        {stage === "start" && (
          <div>
            <h2>Add to your week</h2>
            <p className="lead">
              Slot in a saved class — everything&rsquo;s already filled — or make a new one.
            </p>
            <div>
              {templates.map((t) => {
                const s = studioById.get(t.studioId);
                const p = palForSeq(s?.seq ?? 1);
                const lk = t.links.length
                  ? ` · ${t.links.length} link${t.links.length > 1 ? "s" : ""}`
                  : "";
                return (
                  <button key={t.name} className="studio-row" onClick={() => pickSaved(t)}>
                    <span className="swd" style={{ background: p.rail }} />
                    <span>
                      <span className="nm">{t.name}</span>
                      <br />
                      <span className="ad">
                        {fmtTime(t.startTime)} · {t.durationMin} min · {s?.name}
                        {lk}
                      </span>
                    </span>
                    <span className="tick"><Icon name="chevron_right" size={18} /></span>
                  </button>
                );
              })}
            </div>
            <button className="btn si" style={{ marginTop: 16 }} onClick={newClass}>
              + New class
            </button>
          </div>
        )}

        {stage === "form" && (
          <div>
            {templates.length > 0 && !prefill && (
              <button className="backbtn" onClick={() => setStage("start")}>
                &larr; Saved classes
              </button>
            )}
            <h2>{heading.title}</h2>
            <p className="lead">{heading.lead}</p>

            <label className="flabel" htmlFor="fName">
              Class name
            </label>
            <input
              type="text"
              id="fName"
              placeholder="Type it once — it's remembered"
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSugOpen(true);
              }}
              onBlur={() => setTimeout(() => setSugOpen(false), 150)}
            />
            {sugOpen && suggestions.length > 0 && (
              <div className="namesug">
                {suggestions.map((t) => (
                  <button
                    key={t.name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      fillFromTemplate(t);
                      setSugOpen(false);
                      onToast("Autofilled from last time");
                    }}
                  >
                    {t.name}
                    <span className="sub">
                      {fmtTime(t.startTime)} · {studioById.get(t.studioId)?.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

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

            <label className="flabel">Start</label>
            <div className="timegrid">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  className={`chip${time === t ? " sel" : ""}`}
                  onClick={() => setTime(t)}
                >
                  {fmtTime(t)}
                </button>
              ))}
              <input
                type="time"
                value={time}
                onChange={(e) => e.target.value && setTime(e.target.value)}
                aria-label="Custom time"
              />
            </div>

            <label className="flabel">Length</label>
            <div className="chips">
              {DUR_PRESETS.map((d) => (
                <button
                  key={d}
                  className={`chip${dur === d ? " sel" : ""}`}
                  onClick={() => setDur(d)}
                >
                  {d} min
                </button>
              ))}
            </div>

            <label className="flabel">Studio</label>
            <button className="studio-sel" onClick={() => setStage("pick")}>
              {selectedStudio ? (
                <>
                  <span
                    className="swd"
                    style={{ background: palForSeq(selectedStudio.seq).rail }}
                  />
                  <span>
                    <span className="nm">{selectedStudio.name}</span>
                    <br />
                    <span className="ad">{selectedStudio.address}</span>
                  </span>
                </>
              ) : (
                <span className="nm">Choose a studio</span>
              )}
              <span className="chev"><Icon name="chevron_right" size={18} /></span>
            </button>

            <label className="flabel">
              Booking links <span>· website, Mindbody, ClassPass…</span>
            </label>
            <div>
              {links.map((l, i) => (
                <div className="linkrow" key={i}>
                  <select
                    value={l.label}
                    aria-label="Link type"
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  >
                    {LINK_LABELS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <input
                    type="url"
                    placeholder="Paste the link"
                    value={l.url}
                    aria-label="Booking URL"
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, url: e.target.value } : x)),
                      )
                    }
                  />
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
              onClick={() =>
                setLinks((prev) => [...prev, { label: prev.length ? "ClassPass" : "Website", url: "" }])
              }
            >
              + Add booking link
            </button>

            <div className="publishwrap">
              <button className="btn si" disabled={n === 0 || pending} onClick={publish}>
                {pending ? "Publishing…" : publishLabel}
              </button>
            </div>
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
                  Nothing named &ldquo;{search.trim()}&rdquo; yet. Add it below — takes ten seconds.
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
