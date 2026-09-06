"use client";

import { LoadingDots } from "@/components/LoadingDots";


import { useEffect, useMemo, useState, useTransition } from "react";
import { peopleForSharing, type SharePerson } from "@/app/actions/share";
import { sendInquiry } from "@/app/actions/inquiries";
import { Icon } from "@/components/Icon";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

const SHARE_PEOPLE_MEMORY_KEY = "sheet:share:people";

export function InAppShare({
  title,
  url,
  onToast,
}: {
  title: string;
  url: string;
  onToast: (message: string) => void;
}) {
  const [initialPeople] = useState<SharePerson[] | null>(() =>
    readClientMemory<SharePerson[]>(SHARE_PEOPLE_MEMORY_KEY),
  );
  const [people, setPeople] = useState<SharePerson[]>(initialPeople ?? []);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(initialPeople === null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    void loadClientMemory(SHARE_PEOPLE_MEMORY_KEY, peopleForSharing)
      .then((rows) => {
        if (live && rows !== null) {
          setPeople(rows);
          setFailed(false);
        }
      })
      .catch(() => {
        // Keep cached people on screen; an error is not an empty response.
        if (live && initialPeople === null) setFailed(true);
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? people.filter((person) => `${person.name} ${person.handle}`.toLowerCase().includes(needle))
      : people;
  }, [people, query]);

  const send = (person: SharePerson) => {
    if (sent[person.id]) return;
    start(async () => {
      const result = await sendInquiry(person.handle, "", "", `${title}\n${url}`);
      if (!result.ok) {
        onToast(result.error ?? "Couldn’t send that");
        return;
      }
      setSent((current) => ({ ...current, [person.id]: true }));
      onToast(`Sent to ${person.name.split(/\s+/)[0]}`);
    });
  };

  return (
    <section className="inappshare" aria-label="Share in FittList">
      <h3>Send in FittList</h3>
      <label className="inappshare-search">
        <Icon name="search" size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
      </label>
      <div className="inappshare-people">
        {shown.map((person) => (
          <button key={person.id} disabled={pending || sent[person.id]} onClick={() => send(person)}>
            <span style={{ background: person.color }}>
              {person.photo
                ? <img src={person.photo} alt="" />
                : (person.name.charAt(0) || "?").toUpperCase()}
              {sent[person.id] && <i><Icon name="check" size={14} /></i>}
            </span>
            <b>{sent[person.id] ? "Sent" : person.name}</b>
          </button>
        ))}
        {!loading && failed && <p>Couldn&rsquo;t load people right now.</p>}
        {!loading && !failed && shown.length === 0 && <p>No people match that.</p>}
        {loading && <p><LoadingDots label="Finding people…"/></p>}
      </div>
    </section>
  );
}

export function FittlistShareSheet({
  title,
  url,
  onShareImage,
  onClose,
  onToast,
}: {
  title: string;
  url: string;
  onShareImage?: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    onToast("Link copied");
  };
  const more = async () => {
    try {
      if (typeof navigator.share === "function") await navigator.share({ title, url });
      else await copy();
    } catch {
      // Closing the system share sheet needs no error state.
    }
  };

  return (
    <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sheet inappshare-sheet" role="dialog" aria-modal="true" aria-labelledby="inappshare-title">
        <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        <h2 id="inappshare-title">Share</h2>
        <InAppShare title={title} url={url} onToast={onToast} />
        <div className={`inappshare-actions${onShareImage ? " has-image" : ""}`}>
          {onShareImage && (
            <button className="inappshare-image" onClick={onShareImage}>
              <Icon name="image" size={21} /><span>Share as an image</span>
            </button>
          )}
          <button onClick={copy}><Icon name="link" size={21} /><span>Copy link</span></button>
          <button onClick={more}><Icon name="reply" className="share-arrow-forward" size={21} /><span>Share elsewhere</span></button>
        </div>
      </div>
    </div>
  );
}
