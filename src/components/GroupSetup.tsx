"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGroupClasses, inviteGroupPeople, updateGroupDescription, updateGroupDetails, updateGroupVisibility, type GroupClassChoice } from "@/app/actions/groups";
import type { YouFavoritePerson } from "@/components/YouDashboard";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { readPhoto } from "@/lib/photo";

type View = "root" | "details" | "privacy" | "description" | "members" | "admins" | "classes";
type Member = { id: string; name: string; photo: string | null; color: string; role: string };

export function GroupSettings({ slug, name, photo, description, visibility, people, members, classes }: { slug: string; name: string; photo: string | null; description: string; visibility: "public" | "unlisted" | "private"; people: YouFavoritePerson[]; members: Member[]; classes: GroupClassChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("root");
  const [text, setText] = useState(description);
  const [groupName, setGroupName] = useState(name);
  const [groupPhoto, setGroupPhoto] = useState<string | null>(photo);
  const photoRef = useRef<HTMLInputElement>(null);
  const [privacy, setPrivacy] = useState(visibility);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const visiblePeople = people.filter((person) => `${person.name} ${person.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const close = () => { if (!pending) { setOpen(false); setView("root"); setSelected([]); setSearch(""); setError(""); } };
  const share = async () => {
    const url = `${window.location.origin}/g/${slug}`;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast("Group link copied"); }
  };
  const save = () => start(async () => {
    setError("");
    if (view === "details") {
      const result = await updateGroupDetails(slug, { name: groupName, photo: groupPhoto });
      if (!result.ok) return setError(result.error);
      toast("Group details updated");
    } else if (view === "description") {
      const result = await updateGroupDescription(slug, text);
      if (!result.ok) return setError(result.error);
      toast("About updated");
    } else if (view === "privacy") {
      const result = await updateGroupVisibility(slug, privacy);
      if (!result.ok) return setError(result.error);
      toast("Privacy updated");
    } else if (view === "classes") {
      const choices = classes.filter((item) => selected.includes(`${item.classId}|${item.iso}`)).map(({ classId, iso }) => ({ classId, iso }));
      const result = await addGroupClasses(slug, choices);
      if (!result.ok) return setError(result.error);
      toast(choices.length === 1 ? "Class added" : "Classes added");
    } else {
      const result = await inviteGroupPeople(slug, selected, view === "admins" ? "admin" : "member");
      if (!result.ok) return setError(result.error);
      toast(result.count === 1 ? "Invitation sent" : `${result.count} invitations sent`);
    }
    setView("root"); setSelected([]); router.refresh();
  });
  const privacyLabel = privacy === "public" ? "Public and discoverable" : privacy === "private" ? "Private" : "Anyone with the link";
  return <><button type="button" className="group-header-control" aria-label="Group settings" onClick={() => setOpen(true)}><Icon name="settings" size={23} /></button>{open && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="sheet group-settings-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button>
    {view === "root" ? <><h2>Group settings</h2><p>Manage the group, its people, and who can find it.</p><div className="group-settings-list"><button type="button" onClick={() => setView("details")}><Icon name="image" size={23} /><span><strong>Group details</strong><small>Edit the name and photo</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("privacy")}><Icon name="visibility" size={23} /><span><strong>Privacy</strong><small>{privacyLabel}</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("members")}><Icon name="groups" size={23} /><span><strong>Members</strong><small>{members.length} {members.length === 1 ? "person" : "people"} · invite more</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("admins")}><Icon name="admin_panel_settings" size={23} /><span><strong>Admins</strong><small>Invite someone to help manage</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("description")}><Icon name="edit" size={23} /><span><strong>About</strong><small>{description ? "Edit the group description" : "Add a group description"}</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={share}><Icon name="reply" className="share-arrow-forward" size={23} /><span><strong>Share group</strong><small>fittlist.co/g/{slug}</small></span><Icon name="chevron_right" size={19} /></button></div></> : view === "details" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Group details</h2><p>Give the group a recognizable name and photo.</p><div className="group-details-photo"><button type="button" onClick={() => photoRef.current?.click()}>{groupPhoto ? <img src={groupPhoto} alt="" /> : <span><Icon name="image" size={28} /></span>}</button><div><strong>{groupPhoto ? "Change photo" : "Add a photo"}</strong>{groupPhoto && <button type="button" onClick={() => setGroupPhoto(null)}>Remove</button>}</div><input ref={photoRef} type="file" accept="image/*" hidden onChange={(event) => { const file=event.target.files?.[0]; if(file) readPhoto(file,setGroupPhoto,()=>setError("That photo format isn’t supported.")); event.target.value=""; }} /></div><label className="create-group-name"><span>Group name</span><input autoFocus maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><small className="create-group-count">{groupName.length}/60</small></> : view === "privacy" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Privacy</h2><p>Choose how people can find and open this group.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Only people with the link can find it.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members and invited people can open it.']] as const).map(([value,title,detail]) => <button type="button" className={privacy === value ? "on" : ""} onClick={() => setPrivacy(value)} key={value}><Icon name={privacy === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></> : view === "description" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>About</h2><p>Give people enough context to understand the group.</p><label className="create-group-name"><span>Description</span><textarea autoFocus maxLength={280} value={text} onChange={(event) => setText(event.target.value)} placeholder="What is this group for?" /></label><small className="create-group-count">{text.length}/280</small></> : view === "members" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Members</h2><p>Current members and people you can invite.</p><div className="group-current-members">{members.map((member) => <div key={member.id}>{member.photo ? <img src={member.photo} alt="" /> : <span style={{ background:member.color }}>{member.name.charAt(0).toUpperCase()}</span>}<span><strong>{member.name}</strong><small>{member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Member"}</small></span></div>)}</div><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle} /></> : view === "admins" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Add an admin</h2><p>Admins can edit details, add classes, and invite people after accepting.</p><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle} /></> : <ClassPicker classes={classes} selected={selected} toggle={toggle} />}
    {view !== "root" && <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div><button type="button" className="btn ghost" disabled={pending} onClick={() => setView("root")}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || (view === "members" || view === "admins" || view === "classes") && selected.length === 0} onClick={save}>{pending ? "Saving…" : view === "members" || view === "admins" ? "Send invitation" : "Save"}</button></div></div>}
  </div></div>}<Toast msg={toastMsg} on={toastOn} /></>;
}

export function GroupAddClass({ slug, classes }: { slug: string; classes: GroupClassChoice[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const save = () => start(async () => { const choices = classes.filter((item) => selected.includes(`${item.classId}|${item.iso}`)).map(({ classId, iso }) => ({ classId, iso })); const result = await addGroupClasses(slug, choices); if (!result.ok) return setError(result.error); setOpen(false); router.refresh(); });
  return <><button type="button" className="group-empty-add" onClick={() => setOpen(true)}><Icon name="add" size={22} />Add a class</button>{open && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="sheet group-settings-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button><ClassPicker classes={classes} selected={selected} toggle={toggle} />{error && <p className="formerror">{error}</p>}<div className="create-group-actions"><div><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || !selected.length} onClick={save}>{pending ? "Adding…" : "Add to schedule"}</button></div></div></div></div>}</>;
}

function ClassPicker({ classes, selected, toggle }: { classes: GroupClassChoice[]; selected: string[]; toggle:(key:string)=>void }) { return <><h2>Add a class</h2><p>Choose a class from your calendar. Coaching and saved classes appear here.</p><div className="create-group-classes">{classes.length ? classes.map((item) => { const key=`${item.classId}|${item.iso}`; const on=selected.includes(key); return <button type="button" className={`create-group-class${on ? " on" : ""}`} onClick={() => toggle(key)} key={key}><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name={on ? "check_circle" : "add_circle"} size={22} /></button>; }) : <p>Add a class on your calendar first, then it will be ready to share with this group.</p>}</div></>; }
function InvitePicker({ people, selected, search, setSearch, toggle }: { people:YouFavoritePerson[]; selected:string[]; search:string; setSearch:(value:string)=>void; toggle:(key:string)=>void }) { return <><label className="create-group-search"><Icon name="search" size={19} /><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search favorites" /></label><div className="create-group-people">{people.length ? people.map((person)=><button type="button" className={`create-group-person${selected.includes(person.id) ? " on" : ""}`} onClick={()=>toggle(person.id)} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{background:person.color}}>{person.name.charAt(0).toUpperCase()}</span>}<span className="create-group-person-copy"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span><Icon name={selected.includes(person.id) ? "check_circle" : "add_circle"} size={22}/></button>) : <p>No matching favorites.</p>}</div></>; }
