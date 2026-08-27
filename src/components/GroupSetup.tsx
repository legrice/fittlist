"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { globalComposerData } from "@/app/actions/composer";
import { addGroupClasses, groupClassCatalog, inviteGroupPeople, leaveGroup, removeGroupMember, updateGroupDetails, updateGroupVisibility, type GroupClassCatalog } from "@/app/actions/groups";
import { Adder } from "@/components/Adder";
import type { YouFavoritePerson } from "@/components/YouDashboard";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { readGroupPhoto } from "@/lib/photo";

type View = "root" | "details" | "privacy" | "admins";
export type GroupMember = { id: string; name: string; photo: string | null; color: string; role: string };

export function GroupSettings({ slug, name, photo, description, visibility, people, pill=false }: { slug: string; name: string; photo: string | null; description: string; visibility: "public" | "unlisted" | "private"; people: YouFavoritePerson[]; pill?:boolean }) {
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
    } else {
      const result = await inviteGroupPeople(slug, selected, view === "admins" ? "admin" : "member");
      if (!result.ok) return setError(result.error);
      toast(result.count === 1 ? "Invitation sent" : `${result.count} invitations sent`);
    }
    setView("root"); setSelected([]); router.refresh();
  });
  const privacyLabel = privacy === "public" ? "Public and discoverable" : privacy === "private" ? "Private" : "Anyone with the link";
  return <><button type="button" className={pill?"actpill":"group-header-control"} aria-label="Group settings" onClick={() => setOpen(true)}><Icon name="settings" size={21} />{pill&&<span>Settings</span>}</button>{open && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="sheet group-settings-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button>
    {view === "root" ? <><h2>Group settings</h2><p>Manage the group and who can find it.</p><div className="group-settings-list"><button type="button" onClick={() => setView("details")}><Icon name="image" size={23} /><span><strong>Details</strong><small>Edit the name, about, and photo</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("privacy")}><Icon name="visibility" size={23} /><span><strong>Privacy</strong><small>{privacyLabel}</small></span><Icon name="chevron_right" size={19} /></button><button type="button" onClick={() => setView("admins")}><Icon name="admin_panel_settings" size={23} /><span><strong>Admins</strong><small>Invite someone to help manage</small></span><Icon name="chevron_right" size={19} /></button></div></> : view === "details" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Details</h2><p>Keep the group&rsquo;s name, about, and photo up to date.</p><div className="group-details-photo"><button type="button" onClick={() => photoRef.current?.click()}>{groupPhoto ? <img src={groupPhoto} alt="" /> : <span><Icon name="image" size={28} /></span>}</button><div><strong>{groupPhoto ? "Change photo" : "Add a photo"}</strong>{groupPhoto && <button type="button" onClick={() => setGroupPhoto(null)}>Remove</button>}</div><input ref={photoRef} type="file" accept="image/*" hidden onChange={(event) => { const file=event.target.files?.[0]; if(file) readGroupPhoto(file,setGroupPhoto,()=>setError("That photo format isn’t supported.")); event.target.value=""; }} /></div><label className="create-group-name"><span>Name</span><input autoFocus maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><small className="create-group-count">{groupName.length}/60</small><label className="create-group-name"><span>About</span><textarea maxLength={280} value={text} onChange={(event) => setText(event.target.value)} placeholder="What is this group for?" /></label><small className="create-group-count">{text.length}/280</small></> : view === "privacy" ? <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Privacy</h2><p>Choose how people can find and open this group.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Only people with the link can find it.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members and invited people can open it.']] as const).map(([value,title,detail]) => <button type="button" className={privacy === value ? "on" : ""} onClick={() => setPrivacy(value)} key={value}><Icon name={privacy === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></> : <><button type="button" className="group-settings-back" onClick={() => setView("root")}><Icon name="arrow_back" size={20} />Settings</button><h2>Add an admin</h2><p>Admins can edit details, add classes, and invite people after accepting.</p><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle} /></>}
    {view !== "root" && <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div><button type="button" className="btn ghost" disabled={pending} onClick={() => setView("root")}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || view === "admins" && selected.length === 0} onClick={save}>{pending ? "Saving…" : view === "admins" ? "Send invitation" : "Save"}</button></div></div>}
  </div></div>}<Toast msg={toastMsg} on={toastOn} /></>;
}

export function GroupMembers({ slug, inviteToken, members, people, canManage, viewerId, viewerRole }: { slug:string; inviteToken:string|null; members:GroupMember[]; people:YouFavoritePerson[]; canManage:boolean; viewerId:string|null; viewerRole:string|null }) {
  const router=useRouter(); const [inviteOpen,setInviteOpen]=useState(false); const [selected,setSelected]=useState<string[]>([]); const [search,setSearch]=useState(""); const [confirm,setConfirm]=useState<{kind:"leave"}|{kind:"remove";member:GroupMember}|null>(null); const [pending,start]=useTransition(); const [toastMsg,toastOn,toast]=useToast();
  const memberIds=new Set(members.map((member)=>member.id));
  const query=search.trim().toLowerCase();
  const visiblePeople=query?people.filter((person)=>!memberIds.has(person.id)&&`${person.name} ${person.title}`.toLowerCase().includes(query)):[];
  const toggle=(key:string)=>setSelected((current)=>current.includes(key)?current.filter((item)=>item!==key):[...current,key]);
  const closeInvite=()=>{if(!pending){setInviteOpen(false);setSelected([]);setSearch("");}};
  const invite=()=>start(async()=>{const result=await inviteGroupPeople(slug,selected,"member");if(!result.ok)return toast(result.error);toast(result.count===1?"Invitation sent":`${result.count} invitations sent`);setInviteOpen(false);setSelected([]);setSearch("");router.refresh();});
  const shareInvite=async()=>{if(!inviteToken)return;const url=`${window.location.origin}/g/join/${inviteToken}`;if(navigator.share)await navigator.share({title:"Join my FittList group",text:"Join this group on FittList.",url}).catch(()=>undefined);else{await navigator.clipboard.writeText(url);toast("Invite link copied");}};
  const act=()=>start(async()=>{if(!confirm)return;const result=confirm.kind==="leave"?await leaveGroup(slug):await removeGroupMember(slug,confirm.member.id);if(!result.ok)return toast(result.error);if(confirm.kind==="leave")router.push("/saved");else{toast(`${confirm.member.name} was removed`);setConfirm(null);router.refresh();}});
  return <section className="group-members"><div className="group-section-head"><h2>Members</h2><small>{members.length} {members.length===1?"person":"people"}</small></div>{canManage&&<div className="group-member-actions"><button type="button" className="btn" onClick={()=>setInviteOpen(true)}><Icon name="person_add" size={20}/>Add members</button>{inviteToken&&<button type="button" className="btn ghost" onClick={shareInvite}><Icon name="reply" className="share-arrow-forward" size={20}/>Share invite link</button>}</div>}<div className="group-current-members">{members.map((member)=><div key={member.id}>{member.photo?<img src={member.photo} alt=""/>:<span style={{background:member.color}}>{member.name.charAt(0).toUpperCase()}</span>}<span><strong>{member.name}</strong><small>{member.role==="owner"?"Owner":member.role==="admin"?"Admin":"Member"}</small></span>{canManage&&member.role!=="owner"&&member.id!==viewerId&&<button type="button" className="group-member-remove" onClick={()=>setConfirm({kind:"remove",member})}>Remove</button>}</div>)}</div>{viewerRole&&viewerRole!=="owner"&&<button type="button" className="group-leave" onClick={()=>setConfirm({kind:"leave"})}>Leave group</button>}{inviteOpen&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget)closeInvite();}}><div className="sheet group-settings-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" disabled={pending} onClick={closeInvite}><Icon name="close" size={18}/></button><h2>Add members</h2><p>Search for someone by name, then select who you want to invite.</p><InvitePicker people={visiblePeople} selected={selected} search={search} setSearch={setSearch} toggle={toggle} autoFocus/><div className="create-group-actions"><div><button type="button" className="btn ghost" disabled={pending} onClick={closeInvite}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending||selected.length===0} onClick={invite}>{pending?"Sending…":selected.length===1?"Send invitation":`Send ${selected.length} invitations`}</button></div></div></div></div>}{confirm&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget&&!pending)setConfirm(null);}}><div className="sheet confirmsheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" disabled={pending} onClick={()=>setConfirm(null)}><Icon name="close" size={18}/></button><h2>{confirm.kind==="leave"?"Leave this group?":`Remove ${confirm.member.name}?`}</h2><p className="lead">{confirm.kind==="leave"?"You’ll lose access to member updates and can only return with another invitation.":"They’ll lose access to member updates and will need another invitation to return."}</p><div className="publishwrap nostick"><button type="button" className="btn danger" disabled={pending} onClick={act}>{pending?"Working…":confirm.kind==="leave"?"Leave group":"Remove member"}</button><button type="button" className="btn ghost" disabled={pending} onClick={()=>setConfirm(null)}>Cancel</button></div></div></div>}<Toast msg={toastMsg} on={toastOn}/></section>;
}

export function GroupAddClass({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<GroupClassCatalog | null>(null);
  const [composer, setComposer] = useState<Awaited<ReturnType<typeof globalComposerData>>>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [loading, startLoading] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();
  const toggle = (key: string) => setSelected((current) => {
    if (current.includes(key)) return current.filter((item) => item !== key);
    if (current.length >= 30) {
      setError("Add up to 30 classes at a time.");
      return current;
    }
    setError("");
    return [...current, key];
  });
  const show = () => {
    setOpen(true);
    if (catalog || loading) return;
    startLoading(async () => setCatalog(await groupClassCatalog()));
  };
  const close = () => { if (!pending) { setOpen(false); setSelected([]); setError(""); } };
  const save = () => start(async () => {
    const choices = selected.map((key) => { const [classId, iso] = key.split("|"); return { classId, iso }; });
    const result = await addGroupClasses(slug, choices);
    if (!result.ok) return setError(result.error);
    close();
    toast(choices.length === 1 ? "Class added to the group" : `${choices.length} classes added to the group`);
    router.refresh();
  });
  const createNew = () => startLoading(async () => {
    const data = composer ?? await globalComposerData();
    if (!data) return setError("Sign in to create a class.");
    if (!data.canCoach) return setError("A new public class needs a coach profile. You can still add any nearby class below.");
    setComposer(data);
    setOpen(false);
    setCreating(true);
  });
  const created = (_message: string, _planId?: string, _live?: { id: string; name: string }, focus?: { id: string; iso: string }) => {
    if (!focus) {
      setCreating(false);
      toast("Class created. Open Add a class to place it on the group schedule.");
      router.refresh();
      return;
    }
    start(async () => {
      const result = await addGroupClasses(slug, [{ classId: focus.id, iso: focus.iso }]);
      if (!result.ok) {
        setCreating(false);
        setError(result.error);
        setOpen(true);
        return;
      }
      setCreating(false);
      toast("Class created and added to the group");
      router.refresh();
    });
  };
  return <>
    <button type="button" className="group-empty-add" onClick={show}><Icon name="add" size={22} />Add a class</button>
    {open && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="sheet group-settings-sheet group-class-catalog-sheet"><button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button><h2>Add a class</h2><p>Start a new class, or choose from public classes near you.</p><button type="button" className="group-class-new" disabled={loading} onClick={createNew}><span><Icon name="add" size={22} /></span><span><strong>Create a new class</strong><small>Add the details and publish it to this group.</small></span><Icon name="chevron_right" size={20} /></button><NearbyClassPicker catalog={catalog} selected={selected} toggle={toggle} loading={loading} />{error && <p className="formerror">{error}</p>}<div className="create-group-actions"><div><button type="button" className="btn ghost" onClick={close}>Cancel</button><button type="button" className="btn create-group-submit" disabled={pending || !selected.length} onClick={save}>{pending ? "Adding…" : "Add to schedule"}</button></div></div></div></div>}
    {creating && composer && <Adder studios={composer.studios} templates={composer.templates} customTypes={composer.customTypes} lastUsed={composer.lastUsed} subsCount={0} firstPublish={false} onClose={() => { setCreating(false); setOpen(true); }} onToast={toast} onPublished={created} onDeleted={(message) => toast(message)} />}
    <Toast msg={toastMsg} on={toastOn} />
  </>;
}

function NearbyClassPicker({ catalog, selected, toggle, loading }: { catalog: GroupClassCatalog | null; selected: string[]; toggle:(key:string)=>void; loading:boolean }) {
  const [when, setWhen] = useState("week");
  const [classType, setClassType] = useState("");
  const [place, setPlace] = useState("");
  const [distance, setDistance] = useState("");
  useEffect(() => {
    if (catalog?.myLat != null && catalog.myLng != null) setDistance((current) => current || "25");
  }, [catalog]);
  const choices = catalog?.choices ?? [];
  const classTypes = [...new Set(choices.map((item) => item.classType).filter((value): value is string => !!value))].sort();
  const places = [...new Set(choices.map((item) => item.place).filter((value): value is string => !!value))].sort();
  const today = catalog?.today ?? new Date().toISOString().slice(0, 10);
  const tomorrow = offsetIso(today, 1);
  const weekEnd = offsetIso(today, 6);
  const visible = choices.filter((item) => {
    if (when === "today" && item.iso !== today) return false;
    if (when === "tomorrow" && item.iso !== tomorrow) return false;
    if (when === "week" && item.iso > weekEnd) return false;
    if (classType && item.classType !== classType) return false;
    if (place && item.place !== place) return false;
    if (distance) {
      if (catalog?.myLat == null || catalog.myLng == null || item.lat == null || item.lng == null) return false;
      if (milesBetween(catalog.myLat, catalog.myLng, item.lat, item.lng) > Number(distance)) return false;
    }
    return true;
  });
  return <section className="group-nearby-classes"><div className="group-nearby-head"><h3>Classes near you</h3><small>{visible.length} {visible.length === 1 ? "class" : "classes"}</small></div><div className="group-class-filters" aria-label="Filter nearby classes"><label><span>When</span><select value={when} onChange={(event) => setWhen(event.target.value)}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">This week</option><option value="month">Next 30 days</option></select></label><label><span>Activity</span><select value={classType} onChange={(event) => setClassType(event.target.value)}><option value="">All activities</option>{classTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label><span>Place</span><select value={place} onChange={(event) => setPlace(event.target.value)}><option value="">All places</option>{places.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label><span>Distance</span><select value={distance} onChange={(event) => setDistance(event.target.value)} disabled={catalog?.myLat == null || catalog.myLng == null}><option value="">Any distance</option><option value="2">Within 2 miles</option><option value="5">Within 5 miles</option><option value="10">Within 10 miles</option><option value="25">Within 25 miles</option></select></label></div><div className="create-group-classes">{loading && !catalog ? <p>Finding classes near you…</p> : !visible.length ? <p>No public classes match these filters.</p> : visible.map((item) => { const key=`${item.classId}|${item.iso}`; const on=selected.includes(key); return <button type="button" className={`create-group-class${on ? " on" : ""}`} onClick={() => toggle(key)} key={key}><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name={on ? "check_circle" : "add_circle"} size={22} /></button>; })}</div></section>;
}

function offsetIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function InvitePicker({ people, selected, search, setSearch, toggle, autoFocus=false }: { people:YouFavoritePerson[]; selected:string[]; search:string; setSearch:(value:string)=>void; toggle:(key:string)=>void; autoFocus?:boolean }) { const asked=search.trim().length>0; return <><label className="create-group-search"><Icon name="search" size={19} /><input autoFocus={autoFocus} type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search people" /></label>{asked&&<div className="create-group-people">{people.length ? people.map((person)=><button type="button" className={`create-group-person${selected.includes(person.id) ? " on" : ""}`} onClick={()=>toggle(person.id)} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{background:person.color}}>{person.name.charAt(0).toUpperCase()}</span>}<span className="create-group-person-copy"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span><Icon name={selected.includes(person.id) ? "check_circle" : "add_circle"} size={22}/></button>) : <p>No matching people.</p>}</div>}</>; }
