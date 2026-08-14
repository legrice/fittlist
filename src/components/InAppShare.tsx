"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { peopleForSharing, type SharePerson } from "@/app/actions/share";
import { sendInquiry } from "@/app/actions/inquiries";
import { Icon } from "@/components/Icon";

export function InAppShare({
  title,
  url,
  onToast,
}: {
  title: string;
  url: string;
  onToast: (message: string) => void;
}) {
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    peopleForSharing()
      .then((rows) => live && setPeople(rows))
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
        {!loading && shown.length === 0 && <p>No people match that.</p>}
        {loading && <p>Finding people…</p>}
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
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
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
          <button onClick={more}><Icon name="ios_share" size={21} /><span>Share elsewhere</span></button>
        </div>
      </div>
    </div>
  );
}
