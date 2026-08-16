"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";

export function GroupsScreen({ groups }: { groups: { id: string; slug: string; name: string; description: string; location: string; type: string; visibility: string; members: number; owner: boolean }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const submit = (form: FormData) => start(async () => {
    setError("");
    const result = await createGroup({
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "Community"),
      location: String(form.get("location") ?? ""),
      description: String(form.get("description") ?? ""),
      visibility: form.get("visibility") === "private" ? "private" : "public",
    });
    if (!result.ok) return setError(result.error);
    router.push(`/g/${result.slug}`);
  });

  return <>
    <div className="groups-head">
      <div>
        <h1>Groups</h1>
        <p>One place for everyone’s fitness calendars.</p>
      </div>
      <button className="btn si groups-create" onClick={() => setOpen(true)}>Create group</button>
    </div>

    {groups.length ? <div className="group-list">
      {groups.map((group) => <a className="group-card" href={`/g/${group.slug}`} key={group.id}>
        <span className="group-mark"><Icon name="groups" size={25} /></span>
        <span className="group-card-copy">
          <strong>{group.name}</strong>
          <span>{[group.type, group.location].filter(Boolean).join(" · ")}</span>
          <small>{group.visibility === "private" ? "Private" : "Public"} · {group.members} {group.members === 1 ? "member" : "members"}{group.owner ? " · You manage this" : ""}</small>
        </span>
        <Icon name="chevron_right" size={21} />
      </a>)}
    </div> : <div className="groups-empty">
      <span className="group-mark"><Icon name="groups" size={30} /></span>
      <h2>Your groups will live here</h2>
      <p>Create one for your yoga crew, run club, or the people you train with. Everyone keeps their own calendar; the group keeps them easy to find.</p>
      <button className="btn si" onClick={() => setOpen(true)}>Create your first group</button>
    </div>}

    {open && <div className="sheet-scrim" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
      <div className="sheet group-create-sheet" role="dialog" aria-modal="true" aria-labelledby="group-create-title">
        <div className="sheettop">
          <div><h2 id="group-create-title">Create a group</h2><p>Give your people one link to everyone’s calendar.</p></div>
          <button className="iconbtn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={21} /></button>
        </div>
        <form action={submit} className="group-form">
          <label>Name<input name="name" maxLength={70} placeholder="Jersey City yoga crew" autoFocus required /></label>
          <div className="group-form-pair">
            <label>Type<input name="type" maxLength={50} placeholder="Yoga group" /></label>
            <label>Location<input name="location" maxLength={80} placeholder="Jersey City, NJ" /></label>
          </div>
          <label>About<textarea name="description" maxLength={280} rows={3} placeholder="Who this group is for and what you do together." /></label>
          <fieldset className="group-visibility"><legend>Who can join?</legend><label><input type="radio" name="visibility" value="public" defaultChecked /><span><strong>Public</strong><small>Anyone can find and join it.</small></span></label><label><input type="radio" name="visibility" value="private" /><span><strong>Private</strong><small>Only people with an invite can join.</small></span></label></fieldset>
          {error && <p className="formerror">{error}</p>}
          <button className="btn si" disabled={pending}>{pending ? "Creating…" : "Create group"}</button>
        </form>
      </div>
    </div>}
  </>;
}
