"use client";

import { useEffect, useState, useTransition } from "react";
import { inviteToClass, myPeople } from "@/app/actions/going";
import { Icon } from "@/components/Icon";

// The second screen after "I'm going": who's coming with you? Your mutuals
// list here with checkboxes, an in-app note each; everyone else is a text
// message away, carrying the poster with your name on it. Both doors are
// yours to open, nothing happens on its own, and closing does nothing.
type Person = { id: string; name: string; photo: string | null; color: string; handle: string | null };

export function TellSheet({
  open,
  onClose,
  name,
  dateLong,
  shareUrl,
  classId,
  whenIso,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  dateLong: string;
  /** Carries ?g={handle} so the poster says who's going. */
  shareUrl: string;
  classId: string;
  whenIso: string;
  onToast: (msg: string) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let live = true;
    myPeople().then((p) => {
      if (live) setPeople(p);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = () =>
    start(async () => {
      const res = await inviteToClass(classId, whenIso, [...picked]);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      setSent(true);
    });

  const text = async () => {
    const sentence = `I'm going to ${name} on ${dateLong}. Come with me:`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: name, text: sentence, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${sentence} ${shareUrl}`);
      onToast("Invite copied, ready to paste");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  if (!open) return null;
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet tellsheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2 style={{ marginTop: 10 }}>You&rsquo;re in</h2>
        <p className="lead">
          {name} · {dateLong}. Classes are better with your people there.
        </p>

        {people && people.length > 0 && (
          <div className="tellpick">
            <h3 className="tellpick-h">Ask your people</h3>
            <div className="tellpick-list">
              {people.map((p) => (
                <button
                  key={p.id}
                  className={`tellrow${picked.has(p.id) ? " on" : ""}`}
                  disabled={sent}
                  aria-pressed={picked.has(p.id)}
                  onClick={() => toggle(p.id)}
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tellrow-av" src={p.photo} alt="" />
                  ) : (
                    <span
                      className="tellrow-av tellrow-av-empty"
                      style={{ background: p.color }}
                      aria-hidden="true"
                    >
                      {(p.name.charAt(0) || "?").toUpperCase()}
                    </span>
                  )}
                  <span className="tellrow-nm">{p.name}</span>
                  <span className="tellrow-check" aria-hidden="true">
                    <Icon name="check" size={15} />
                  </span>
                </button>
              ))}
            </div>
            <button
              className="tellbtn"
              disabled={pending || sent || picked.size === 0}
              onClick={send}
            >
              <Icon name={sent ? "check" : "notifications"} size={18} />
              {sent
                ? "Asked. They'll see it in Updates"
                : picked.size > 0
                  ? `Ask ${picked.size} ${picked.size === 1 ? "person" : "people"} to come`
                  : "Pick who to ask"}
            </button>
          </div>
        )}

        <button className="tellbtn tellbtn-text" onClick={text}>
          <Icon name="campaign" size={18} />
          {people && people.length > 0
            ? "Text friends who aren't on fittlist"
            : "Text someone the plan"}
        </button>
        <button className="tertiary tellsheet-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
