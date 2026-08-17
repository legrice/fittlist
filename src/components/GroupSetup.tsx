"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGroupClasses, inviteGroupPeople, updateGroupDescription, type GroupClassChoice, type GroupPurpose } from "@/app/actions/groups";
import type { YouFavoritePerson } from "@/components/YouDashboard";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

type SetupView = "description" | "classes" | "members" | "admins" | null;

const purposeCopy: Record<GroupPurpose, { title: string; detail: string; primary: SetupView }> = {
  plan: { title: "Start planning together", detail: "Add the first class, invite people, or share the link so plans can start here.", primary: "classes" },
  community: { title: "Bring the community in", detail: "Invite members and teachers, then start building the shared calendar.", primary: "members" },
  event: { title: "Build the event", detail: "Add event details and the first scheduled class, session, or meetup.", primary: "description" },
};

export function GroupSetup({ slug, name, purpose, description, people, classes }: { slug: string; name: string; purpose: GroupPurpose; description: string; people: YouFavoritePerson[]; classes: GroupClassChoice[] }) {
  const router = useRouter();
  const [view, setView] = useState<SetupView>(null);
  const [text, setText] = useState(description);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const copy = purposeCopy[purpose];
  const visiblePeople = people.filter((person) => `${person.name} ${person.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const close = () => { if (!pending) { setView(null); setSelected([]); setSearch(""); setError(""); } };
  const share = async () => {
    const url = `${window.location.origin}/g/${slug}`;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast("Group link copied"); }
  };
  const save = () => start(async () => {
    setError("");
    if (view === "description") {
      const result = await updateGroupDescription(slug, text);
      if (!result.ok) return setError(result.error);
      toast("Group details saved");
    } else if (view === "classes") {
      const choices = classes.filter((item) => selected.includes(`${item.classId}|${item.iso}`)).map(({ classId, iso }) => ({ classId, iso }));
      const result = await addGroupClasses(slug, choices);
      if (!result.ok) return setError(result.error);
      toast(choices.length === 1 ? "Class added to the group" : "Classes added to the group");
    } else if (view === "members" || view === "admins") {
      const result = await inviteGroupPeople(slug, selected, view === "admins" ? "admin" : "member");
      if (!result.ok) return setError(result.error);
      toast(result.count === 1 ? "Invitation sent" : `${result.count} invitations sent`);
    }
    close();
    router.refresh();
  });
  return <>
    <section className="group-setup">
      <span>Organizer setup</span><h2>{copy.title}</h2><p>{copy.detail}</p>
      <div className="group-setup-grid">
        <button type="button" className={copy.primary === "classes" ? "primary" : ""} onClick={() => setView("classes")}><Icon name="calendar_month" size={23} /><span><strong>Add a class</strong><small>Build the group calendar</small></span></button>
        <button type="button" className={copy.primary === "members" ? "primary" : ""} onClick={() => setView("members")}><Icon name="person_add" size={23} /><span><strong>Invite members</strong><small>They choose whether to join</small></span></button>
        <button type="button" className={copy.primary === "description" ? "primary" : ""} onClick={() => setView("description")}><Icon name="edit" size={23} /><span><strong>Add details</strong><small>Describe the group</small></span></button>
        <button type="button" onClick={() => setView("admins")}><Icon name="admin_panel_settings" size={23} /><span><strong>Add an admin</strong><small>Share organizer access</small></span></button>
        <button type="button" onClick={share}><Icon name="reply" className="share-arrow-forward" size={23} /><span><strong>Share group</strong><small>Send the public link</small></span></button>
      </div>
    </section>
    {view && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="sheet group-setup-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button>
      {view === "description" ? <><h2>Add group details</h2><p>Give people enough context to know why they should join.</p><label className="create-group-name"><span>Description</span><textarea autoFocus maxLength={280} value={text} onChange={(event) => setText(event.target.value)} placeholder="What is this group for?" /></label><small className="create-group-count">{text.length}/280</small></> : view === "classes" ? <><h2>Add a class</h2><p>Choose from classes saved to your calendar.</p><div className="create-group-classes">{classes.length ? classes.map((item) => { const key = `${item.classId}|${item.iso}`; const on = selected.includes(key); return <button type="button" className={`create-group-class${on ? " on" : ""}`} onClick={() => toggle(key)} key={key}><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name={on ? "check_circle" : "add_circle"} size={22} /></button>; }) : <p>Save a class to your calendar first, then it will appear here.</p>}</div></> : <><h2>{view === "admins" ? "Add an admin" : "Invite members"}</h2><p>{view === "admins" ? "Admins can edit details, invite people, and add classes after they accept." : "An invitation does not make someone a member until they accept."}</p><label className="create-group-search"><Icon name="search" size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search favorites" /></label><div className="create-group-people">{visiblePeople.length ? visiblePeople.map((person) => <button type="button" className={`create-group-person${selected.includes(person.id) ? " on" : ""}`} onClick={() => toggle(person.id)} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<span className="create-group-person-copy"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span><Icon name={selected.includes(person.id) ? "check_circle" : "add_circle"} size={22} /></button>) : <p>{people.length ? "No matching favorites." : "Favorite someone first, or share the group link with them."}</p>}</div></>}
      <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div><button type="button" className="btn ghost" disabled={pending} onClick={close}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || view !== "description" && selected.length === 0} onClick={save}>{pending ? "Saving…" : view === "members" || view === "admins" ? "Send invitation" : "Save"}</button></div></div>
    </div></div>}
    <Toast msg={toastMsg} on={toastOn} />
  </>;
}
