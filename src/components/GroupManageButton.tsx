"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGroup, updateGroup } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";

type Group = { id: string; name: string; description: string; location: string; type: string; visibility: string };

export function GroupManageButton({ group }: { group: Group }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const save = (form: FormData) => start(async () => {
    setError("");
    const result = await updateGroup({
      id: group.id,
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "Community"),
      location: String(form.get("location") ?? ""),
      description: String(form.get("description") ?? ""),
      visibility: form.get("visibility") === "private" ? "private" : "public",
    });
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  });

  const remove = () => start(async () => {
    setError("");
    const result = await deleteGroup(group.id);
    if (!result.ok) return setError(result.error);
    router.push("/groups");
  });

  return <>
    <button className="btn group-manage-trigger" onClick={() => setOpen(true)}>Manage group</button>
    {open && <div className="sheet-scrim" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
      <div className="sheet group-create-sheet" role="dialog" aria-modal="true" aria-labelledby="group-manage-title">
        <div className="sheettop">
          <div><h2 id="group-manage-title">Manage group</h2><p>Keep the details useful for everyone in it.</p></div>
          <button className="iconbtn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={21} /></button>
        </div>
        <form action={save} className="group-form">
          <label>Name<input name="name" maxLength={70} defaultValue={group.name} required /></label>
          <div className="group-form-pair">
            <label>Type<input name="type" maxLength={50} defaultValue={group.type} /></label>
            <label>Location<input name="location" maxLength={80} defaultValue={group.location} /></label>
          </div>
          <label>About<textarea name="description" maxLength={280} rows={3} defaultValue={group.description} /></label>
          <fieldset className="group-visibility"><legend>Who can join?</legend><label><input type="radio" name="visibility" value="public" defaultChecked={group.visibility !== "private"} /><span><strong>Public</strong><small>Anyone can find and join it.</small></span></label><label><input type="radio" name="visibility" value="private" defaultChecked={group.visibility === "private"} /><span><strong>Private</strong><small>Only people with an invite can join.</small></span></label></fieldset>
          {error && <p className="formerror">{error}</p>}
          <button className="btn si" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
          {!confirming ? <button type="button" className="group-delete-link" onClick={() => setConfirming(true)}>Delete group</button> : <div className="group-delete-confirm">
            <p>Delete this group? Its member directory will be removed, but everyone’s own calendar stays intact.</p>
            <div><button type="button" className="btn" onClick={() => setConfirming(false)}>Keep it</button><button type="button" className="btn danger" disabled={pending} onClick={remove}>Delete group</button></div>
          </div>}
        </form>
      </div>
    </div>}
  </>;
}
