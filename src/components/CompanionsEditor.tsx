"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { joinNames } from "@/components/Roster";

// "Who's coming with you?" Names, not accounts: Joanne doesn't need the app
// to be in the room. Shown only after you've marked Going, and what you type
// shows exactly where the roster shows (the coach, fellow goers), nowhere
// public.
export function CompanionsEditor({
  value,
  onSave,
}: {
  value: string[];
  /** Persists the cleaned list; resolves with the server's version. */
  onSave: (names: string[]) => Promise<string[] | null>;
}) {
  const [names, setNames] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.join(", "));
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const cleaned = await onSave(
        draft
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      if (cleaned) {
        setNames(cleaned);
        setEditing(false);
      }
    });

  if (editing) {
    return (
      <div className="withwrap">
        <label className="flabel" htmlFor="withNames">
          Who&rsquo;s coming with you? <span>· they don&rsquo;t need the app</span>
        </label>
        <input
          id="withNames"
          className="editinput"
          placeholder="Names, separated by commas"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="withrow">
          <button className="withsave" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            className="tertiary"
            onClick={() => {
              setDraft(names.join(", "));
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <button className="withbtn" onClick={() => setEditing(true)}>
      <Icon name="person_add" size={16} />
      {names.length ? `With ${joinNames(names)}` : "Bringing anyone?"}
    </button>
  );
}
