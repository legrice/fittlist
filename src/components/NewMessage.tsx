"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MessageComposer } from "@/components/MessageComposer";

export type MessagePerson = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
};

/** Start a conversation from Messages itself, rather than making somebody
 * find the person's profile first. The existing profile composer remains the
 * one form and one server action behind both doors. */
export function NewMessage({ people, empty = false }: { people: MessagePerson[]; empty?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<MessagePerson | null>(null);
  const [sent, setSent] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => `${p.name} ${p.handle}`.toLowerCase().includes(q)) : people;
  }, [people, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setPerson(null);
    setSent(false);
    if (sent) router.refresh();
  };

  return (
    <>
      <button
        className={empty ? "btn si inbox-start-empty" : "iconbtn"}
        aria-label="Start a message"
        onClick={() => setOpen(true)}
      >
        {!empty && <Icon name="edit" size={21} />}
        {empty && "Start a message"}
      </button>
      {open && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="sheet newmessage-sheet" role="dialog" aria-modal="true" aria-labelledby="newmessage-title">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={close}>
              <Icon name="close" size={18} />
            </button>
            <h2 id="newmessage-title">{person ? `Message ${person.name.split(/\s+/)[0]}` : "New message"}</h2>
            {person ? (
              <>
                <button className="newmessage-to" onClick={() => { setPerson(null); setSent(false); }}>
                  <span className="inboxrow-av" style={{ background: person.color }}>
                    {person.photo ? <img src={person.photo} alt="" loading="lazy" decoding="async" /> : (person.name.charAt(0) || "?").toUpperCase()}
                  </span>
                  <span><strong>{person.name}</strong><small>@{person.handle}</small></span>
                  <Icon name="chevron_left" size={20} />
                </button>
                <MessageComposer
                  handle={person.handle}
                  coachName={person.name}
                  signedIn
                  onDone={() => setSent(true)}
                />
                {sent && <button className="btn si" onClick={close}>Done</button>}
              </>
            ) : (
              <>
                <label className="newmessage-search">
                  <Icon name="search" size={21} />
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" />
                </label>
                <div className="newmessage-people">
                  {shown.map((p) => (
                    <button key={p.id} className="inboxrow" onClick={() => setPerson(p)}>
                      <span className="inboxrow-av" style={{ background: p.color }}>
                        {p.photo ? <img src={p.photo} alt="" loading="lazy" decoding="async" /> : (p.name.charAt(0) || "?").toUpperCase()}
                      </span>
                      <span className="inboxrow-main"><span className="inboxrow-top"><span className="nm">{p.name}</span></span><span className="inboxrow-preview">@{p.handle}</span></span>
                      <Icon name="chevron_right" size={20} />
                    </button>
                  ))}
                  {shown.length === 0 && <p className="adminempty">No people match that.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
