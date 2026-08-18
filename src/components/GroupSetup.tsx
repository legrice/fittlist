"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGroupClasses, inviteGroupPeople, leaveGroup, removeGroupMember, updateGroupDetails, updateGroupVisibility, type GroupClassChoice } from "@/app/actions/groups";
import type { YouFavoritePerson } from "@/components/YouDashboard";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { readPhoto } from "@/lib/photo";

type View = "root" | "details" | "privacy" | "admins" | "classes";
export type GroupMember = { id: string; name: string; photo: string | null; color: string; role: string };

export function GroupSettings({ slug, name, photo, description, visibility, people, classes }: { slug: string; name: string; photo: string | null; description: string; visibility: "public" | "unlisted" | "private"; people: YouFavoritePerson[]; classes: GroupClassChoice[] }) {
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
      const result = await updateGroupDetails(slug, { name: groupName, description: text, photo: groupPhoto });
      if (!result.ok) return setError(result.error);
      toast("Group details updated");
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
    {view === "root" ? <><h2>Group settings</h2><p>Manage the group and who can find it.</p><div className="group-settings-list"><button type="button" onClick={() => setView("details")}><Icon name="image" size={23} /><span><strong>Details</strong><small>Edit the name, about, and photo</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("privacy")}><Icon name="visibility" size={23} /><span><strong>Privacy</strong><small>{privacyLabel}</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("admins")}><Icon name="admin_panel_settings" size={23} /><span><strong>Admins</strong><small>Invite someone to help manage</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={share}><Icon name="reply" className="share-arrow-forward" size={23} /><span><strong>Share group</strong><small>fittlist.co/g/{slug}</small></span><Icon name="chevron_right" size={19} /></button></div></> : view === "details" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Details</h2><p>Keep the group&rsquo;s name, about, and photo up to date.</p><div className="group-details-photo"><button type="button" onClick={() => photoRef.current?.click()}>{groupPhoto ? <img src={groupPhoto} alt="" /> : <span><Icon name="image" size={28} /></span>}</button><div><strong>{groupPhoto ? "Change photo" : "Add a photo"}</strong>{groupPhoto && <button type="button" onClick={() => setGroupPhoto(null)}>Remove</button>}</div><input ref={photoRef} type="file" accept="image/*" hidden onChange={(event) => { const file=event.target.files?.[0]; if(file) readPhoto(file,setGroupPhoto,()=>setError("That photo format isn’t supported.")); event.target.value=""; }} /></div><label className="create-group-name"><span>Name</span><input autoFocus maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><small className="create-group-count">{groupName.length}/60</small><label className="create-group-name"><span>About</span><textarea maxLength={280} value={text} onChange={(event) => setText(event.target.value)} placeholder="What is this group for?" /></label><small className="create-group-count">{text.length}/280</small></> : view === "privacy" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Privacy</h2><p>Choose how people can find and open this group.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Only people with the link can find it.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members and invited people can open it.']] as const).map(([value,title,detail]) => <button type="button" className={privacy === value ? "on" : ""} onClick={() => setPrivacy(value)} key={value}><Icon name={privacy === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></> : view === "admins" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Add an admin</h2><p>Admins can edit details, add classes, and invite people after accepting.</p><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle} /></> : <ClassPicker classes={classes} selected={selected} toggle={toggle} />}
    {view !== "root" && <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div><button type="button" className="btn ghost" disabled={pending} onClick={() => setView("root")}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || (view === "admins" || view === "classes") && selected.length === 0} onClick={save}>{pending ? "Saving…" : view === "admins" ? "Send invitation" : "Save"}</button></div></div>}
  </div></div>}<Toast msg={toastMsg} on={toastOn} /></>;
}

export function GroupMembers({ slug, members, people, canManage, viewerId, viewerRole }: { slug:string; members:GroupMember[]; people:YouFavoritePerson[]; canManage:boolean; viewerId:string|null; viewerRole:string|null }) {
  const router=useRouter(); const [selected,setSelected]=useState<string[]>([]); const [search,setSearch]=useState(""); const [confirm,setConfirm]=useState<{kind:"leave"}|{kind:"remove";member:GroupMember}|null>(null); const [pending,start]=useTransition(); const [toastMsg,toastOn,toast]=useToast();
  const memberIds=new Set(members.map((member)=>member.id));
  const visiblePeople=people.filter((person)=>!memberIds.has(person.id)&&`${person.name} ${person.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle=(key:string)=>setSelected((current)=>current.includes(key)?current.filter((item)=>item!==key):[...current,key]);
  const invite=()=>start(async()=>{const result=await inviteGroupPeople(slug,selected,"member");if(!result.ok)return toast(result.error);toast(result.count===1?"Invitation sent":`${result.count} invitations sent`);setSelected([]);setSearch("");router.refresh();});
  const act=()=>start(async()=>{if(!confirm)return;const result=confirm.kind==="leave"?await leaveGroup(slug):await removeGroupMember(slug,confirm.member.id);if(!result.ok)return toast(result.error);if(confirm.kind==="leave")router.push("/saved");else{toast(`${confirm.member.name} was removed`);setConfirm(null);router.refresh();}});
  return <section className="group-members"><div className="group-section-head"><h2>Members</h2><small>{members.length} {members.length===1?"person":"people"}</small></div><div className="group-current-members">{members.map((member)=><div key={member.id}>{member.photo?<img src={member.photo} alt=""/>:<span style={{background:member.color}}>{member.name.charAt(0).toUpperCase()}</span>}<span><strong>{member.name}</strong><small>{member.role==="owner"?"Owner":member.role==="admin"?"Admin":"Member"}</small></span>{canManage&&member.role!=="owner"&&member.id!==viewerId&&<button type="button" className="group-member-remove" onClick={()=>setConfirm({kind:"remove",member})}>Remove</button>}</div>)}</div>{canManage&&<div className="group-member-invite"><h3>Invite members</h3><p>Choose from your favorites.</p><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle}/><button type="button" className="btn create-group-submit" disabled={pending||selected.length===0} onClick={invite}>{pending?"Sending…":selected.length===1?"Send invitation":`Send ${selected.length} invitations`}</button></div>}{viewerRole&&viewerRole!=="owner"&&<button type="button" className="group-leave" onClick={()=>setConfirm({kind:"leave"})}>Leave group</button>}{confirm&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget&&!pending)setConfirm(null);}}><div className="sheet confirmsheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" disabled={pending} onClick={()=>setConfirm(null)}><Icon name="close" size={18}/></button><h2>{confirm.kind==="leave"?"Leave this group?":`Remove ${confirm.member.name}?`}</h2><p className="lead">{confirm.kind==="leave"?"You’ll lose access to member updates and can only return with another invitation.":"They’ll lose access to member updates and will need another invitation to return."}</p><div className="publishwrap nostick"><button type="button" className="btn danger" disabled={pending} onClick={act}>{pending?"Working…":confirm.kind==="leave"?"Leave group":"Remove member"}</button><button type="button" className="btn ghost" disabled={pending} onClick={()=>setConfirm(null)}>Cancel</button></div></div></div>}<Toast msg={toastMsg} on={toastOn}/></section>;
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
