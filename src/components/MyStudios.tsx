"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addCoachStudio,
  createStudio,
  listAllStudios,
  myCoachStudios,
  removeCoachStudio,
  type StudioDto,
} from "@/app/actions/studios";
import { Icon } from "@/components/Icon";

// "Where I coach", editable after setup. The wizard was the only place these
// could be picked, so a coach who added a studio later had no way to put it on
// their page without publishing a class there first.
//
// Search doubles as the duplicate check: the matches for what you typed sit
// right above the "add new" button, so the moment before creating "Iron Bound"
// is the moment you're looking at "Ironbound".

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function MyStudios() {
  const [mine, setMine] = useState<StudioDto[] | null>(null);
  const [all, setAll] = useState<StudioDto[]>([]);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    myCoachStudios().then(setMine);
    listAllStudios().then(setAll);
  }, []);

  const mineIds = new Set((mine ?? []).map((s) => s.id));
  const needle = fold(q);
  const matches = needle
    ? all
        .filter((s) => !mineIds.has(s.id))
        .filter((s) => fold(s.name).includes(needle) || fold(s.address).includes(needle))
        .slice(0, 5)
    : [];

  const add = (s: StudioDto) =>
    start(async () => {
      const res = await addCoachStudio(s.id);
      if (!res.ok) {
        setError(res.error ?? "Couldn't add that.");
        return;
      }
      setError("");
      setMine((m) => [...(m ?? []), s].sort((a, b) => a.name.localeCompare(b.name)));
      setQ("");
      setNewOpen(false);
      setNewAddress("");
    });

  const remove = (s: StudioDto) =>
    start(async () => {
      await removeCoachStudio(s.id);
      setMine((m) => (m ?? []).filter((x) => x.id !== s.id));
    });

  const createNew = () =>
    start(async () => {
      const res = await createStudio(q, newAddress);
      if (!res.ok || !res.studio) {
        setError(res.error ?? "Couldn't add that.");
        return;
      }
      setAll((a) => [...a, res.studio!]);
      add(res.studio);
    });

  return (
    <div className="mystudios">
      {(mine ?? []).map((s) => (
        <div key={s.id} className="linksfield-row">
          <span className="linksfield-txt">
            <span className="nm">{s.name}</span>
            <span className="u">{s.address}</span>
          </span>
          <button
            type="button"
            className="linksfield-x"
            aria-label={`Remove ${s.name}`}
            disabled={pending}
            onClick={() => remove(s)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <input
        className="editinput"
        type="text"
        placeholder="Search studios, or type a new one"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setNewOpen(false);
          setError("");
        }}
      />
      {matches.map((s) => (
        <button
          key={s.id}
          type="button"
          className="mystudios-match"
          disabled={pending}
          onClick={() => add(s)}
        >
          <span className="linksfield-txt">
            <span className="nm">{s.name}</span>
            <span className="u">{s.address}</span>
          </span>
          <Icon name="add" size={20} />
        </button>
      ))}
      {q.trim() && !newOpen && (
        <button type="button" className="linksfield-add" onClick={() => setNewOpen(true)}>
          {matches.length > 0
            ? `None of these? Add "${q.trim()}" as a new studio`
            : `+ Add "${q.trim()}" as a new studio`}
        </button>
      )}
      {newOpen && (
        <>
          <input
            className="editinput"
            style={{ marginTop: 8 }}
            type="text"
            placeholder="Address, e.g. 501 Palisade Ave, Jersey City"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
          <button
            type="button"
            className="linksfield-add"
            disabled={pending || !newAddress.trim()}
            onClick={createNew}
          >
            {pending ? "Adding…" : "Add studio"}
          </button>
        </>
      )}
      {error && <div className="errorcopy">{error}</div>}
    </div>
  );
}
