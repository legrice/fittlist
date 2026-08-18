"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { FavoritePlaceButton } from "@/components/FavoritePlaceButton";
import type { BrowseDay } from "@/app/actions/discover";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { ClassPeek, peekFromDetail } from "@/components/ClassPeek";
import { Toast, useToast } from "@/components/Toast";
import { CreateGroupSheet } from "@/components/SavedScreen";
import { discoverGroups, discoverPeople, discoverStudios } from "@/app/actions/discover";

export type DiscoverHalf = "people" | "places" | "classes" | "groups";
type Group = { id:string; name:string; slug:string; description:string|null; purpose:string };

export function DiscoverList({ people,studios=[],cities,myLat=null,myLng=null,startHalf,upcoming=[],groups=[],backHref,hideBack=false }: { people:DirPerson[];studios?:DirStudio[];cities:string[];myCity?:string|null;myLat?:number|null;myLng?:number|null;startHalf?:DiscoverHalf;upcoming?:BrowseDay[];groups?:Group[];backHref:string;hideBack?:boolean }) {
  const router=useRouter();
  const [openClass,setOpenClass]=useState<ClassDetail|null>(null);
  const [groupCreateOpen,setGroupCreateOpen]=useState(false);
  const [toastMsg,toastOn,toast]=useToast();
  const [tab,setTab]=useState<DiscoverHalf>(startHalf??"classes");
  const [studioRows,setStudioRows]=useState(studios);
  const [groupRows,setGroupRows]=useState(groups);
  const [peopleRows,setPeopleRows]=useState(people);
  const [cityRows,setCityRows]=useState(cities);
  const [directoryPending,startDirectory]=useTransition();
  const loadedDirectories=useRef(new Set<DiscoverHalf>());
  const [searchOpen,setSearchOpen]=useState(false); const [query,setQuery]=useState("");
  const [classType,setClassType]=useState(""); const [distance,setDistance]=useState("");
  const [discipline,setDiscipline]=useState(""); const [peopleCity,setPeopleCity]=useState("");
  const [studioType,setStudioType]=useState(""); const [studioCity,setStudioCity]=useState("");
  const [purpose,setPurpose]=useState(""); const [groupSort,setGroupSort]=useState("newest");
  const q=query.trim().toLowerCase();
  const allUpcoming=useMemo(()=>upcoming.flatMap((day)=>day.items.map((item)=>({...item,day:day.label}))).filter((item)=>!q||[item.name,item.where,item.attributionName].some((value)=>(value??"").toLowerCase().includes(q))),[upcoming,q]);
  const classTypes=[...new Set(allUpcoming.map((item)=>item.classType).filter((value):value is string=>!!value))].sort();
  const filteredUpcoming=allUpcoming.filter((item)=>{if(classType&&item.classType!==classType)return false;if(distance){if(myLat==null||myLng==null||item.lat==null||item.lng==null)return false;if(milesBetween(myLat,myLng,item.lat,item.lng)>Number(distance))return false;}return true;});
  const filteredUpcomingDays=upcoming.map((day)=>({iso:day.iso,label:day.label,items:filteredUpcoming.filter((item)=>item.iso===day.iso)})).filter((day)=>day.items.length>0);
  const disciplines=[...new Set(peopleRows.flatMap((person)=>person.disciplines))].sort();
  const shownPeople=peopleRows.filter((person)=>person.kind==="coach"&&(!q||[person.name,person.title,person.location,person.handle,...person.disciplines].some((value)=>value.toLowerCase().includes(q)))&&(!discipline||person.disciplines.includes(discipline))&&(!peopleCity||person.location.toLowerCase().includes(peopleCity.toLowerCase())));
  const studioTypes=[...new Set(studioRows.flatMap((studio)=>studio.types))].sort();
  const studioCities=[...new Set([...cityRows,...studioRows.map((studio)=>studio.address.split(",").slice(-2,-1)[0]?.trim()??"")].filter(Boolean))].sort();
  const shownStudios=studioRows.filter((studio)=>(!q||[studio.name,studio.address,...studio.types].some((value)=>value.toLowerCase().includes(q)))&&(!studioType||studio.types.includes(studioType))&&(!studioCity||studio.address.toLowerCase().includes(studioCity.toLowerCase())));
  const shownGroups=groupRows.filter((group)=>(!q||`${group.name} ${group.description??""}`.toLowerCase().includes(q))&&(!purpose||group.purpose===purpose)).sort((a,b)=>groupSort==="name"?a.name.localeCompare(b.name):0);
  const activityByName=upcoming.flatMap((day)=>day.items).reduce((counts,item)=>{const key=item.attributionName.trim().toLowerCase();if(key)counts.set(key,(counts.get(key)??0)+1);return counts;},new Map<string,number>());
  const openEvent=async(item:UpcomingItem)=>{const detail=await classDetail(item.base.replace(/^s\//,""),item.classId,item.iso);if(detail)setOpenClass(detail);else toast("That class isn't available");};
  useEffect(()=>{
    if(loadedDirectories.current.has(tab))return;
    if(tab==="places"){loadedDirectories.current.add(tab);startDirectory(async()=>setStudioRows(await discoverStudios()));}
    if(tab==="groups"){loadedDirectories.current.add(tab);startDirectory(async()=>setGroupRows(await discoverGroups()));}
    if(tab==="people"){loadedDirectories.current.add(tab);startDirectory(async()=>{const data=await discoverPeople();setPeopleRows(data.people);setCityRows(data.cities);});}
  },[tab,studioRows.length,groupRows.length,peopleRows.length]);
  return <>
    <div className="discover-title-row"><h1>Discover</h1><button type="button" aria-label="Search Discover" aria-expanded={searchOpen} onClick={()=>setSearchOpen((open)=>!open)}><Icon name="search" size={24}/></button></div>
    {searchOpen&&<div className="dissearchrow discover-searchrow"><label className="dissearch"><Icon name="search" size={20} className="dissearch-ic"/><input autoFocus className="dissearch-in" type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search Discover" aria-label="Search Discover"/>{query&&<button type="button" className="dissearch-x" onClick={()=>setQuery("")} aria-label="Clear search"><Icon name="close" size={19}/></button>}</label></div>}
    <div className="discover-directory-tabs" role="tablist">{([['classes','Classes'],['people','People'],['places','Studios'],['groups','Groups']] as const).map(([value,label])=><button role="tab" aria-selected={tab===value} className={tab===value?"on":""} onClick={()=>setTab(value)} key={value}>{label}</button>)}</div>
    {tab==="classes"&&<><FilterRow><Filter label="Type" value={classType} onChange={setClassType} all="All types" options={classTypes}/><Filter label="Distance" value={distance} onChange={setDistance} all="Any distance" options={[["1","Within 1 mile"],["5","Within 5 miles"],["10","Within 10 miles"],["25","Within 25 miles"]]} disabled={myLat==null||myLng==null}/></FilterRow>{filteredUpcomingDays.length?<div className="discover-event-list">{filteredUpcomingDays.map((day)=><section className="discover-event-day" key={day.iso}><h2>{day.label}</h2><div>{day.items.map((item)=><DiscoverEvent item={item} onOpen={()=>void openEvent(item)} key={`${item.classId}.${item.iso}`}/>)}</div></section>)}</div>:<Empty>There are no classes matching these filters.</Empty>}</>}
    {tab==="people"&&<><FilterRow><Filter label="Specialty" value={discipline} onChange={setDiscipline} all="All specialties" options={disciplines}/><Filter label="Location" value={peopleCity} onChange={setPeopleCity} all="All locations" options={cityRows}/></FilterRow>{directoryPending?<Empty>Loading people…</Empty>:shownPeople.length?<div className="discover-person-grid">{shownPeople.map((person,index)=><DiscoverPerson person={person} index={index} activity={activityByName.get(person.name.trim().toLowerCase())??person.classesThisWeek} key={person.id}/>)}</div>:<Empty>There are no people matching these filters.</Empty>}</>}
    {tab==="places"&&<><FilterRow><Filter label="Type" value={studioType} onChange={setStudioType} all="All types" options={studioTypes}/><Filter label="Location" value={studioCity} onChange={setStudioCity} all="All locations" options={studioCities}/></FilterRow>{directoryPending?<Empty>Loading studios…</Empty>:shownStudios.length?<StudioGrid studios={shownStudios}/>:<Empty>There are no studios matching these filters.</Empty>}</>}
    {tab==="groups"&&<><FilterRow><Filter label="Purpose" value={purpose} onChange={setPurpose} all="All purposes" options={[["plan","Plan together"],["community","Community"],["event","Events"]]}/><Filter label="Sort" value={groupSort} onChange={setGroupSort} all="Newest" options={[["name","Name"]]}/></FilterRow>{directoryPending?<Empty>Loading groups…</Empty>:shownGroups.length?<GroupGrid groups={shownGroups}/>:groupRows.length?<Empty>There are no groups matching these filters.</Empty>:<div className="discover-groups-empty"><span><Icon name="groups" size={32}/></span><h2>Plan fitness together</h2><p>Groups are shared calendars and updates for the people you train with. Add classes, invite members, and keep everyone&rsquo;s plans in one place.</p><button type="button" className="btn si" onClick={()=>setGroupCreateOpen(true)}><Icon name="add" size={21}/>Create a group</button></div>}</>}
    {!hideBack&&<Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    {openClass&&<ClassPeek cls={peekFromDetail(openClass)} initialDetail={openClass} onClose={()=>setOpenClass(null)} onChanged={()=>router.refresh()} onToast={toast}/>}<Toast msg={toastMsg} on={toastOn}/>
    {groupCreateOpen&&<CreateGroupSheet onClose={()=>setGroupCreateOpen(false)}/>} 
  </>;
}

function FilterRow({children}:{children:ReactNode}){return <div className="discover-class-filters discover-tab-filters">{children}</div>}
function Filter({label,value,onChange,all,options,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;all:string;options:(string|readonly[string,string])[];disabled?:boolean}){return <label><span>{label}</span><select value={value} onChange={(event)=>onChange(event.target.value)} disabled={disabled}><option value="">{all}</option>{options.map((option)=>{const [value,label]=typeof option==="string"?[option,option]:option;return <option value={value} key={value}>{label}</option>})}</select></label>}
function Empty({children}:{children:ReactNode}){return <p className="discover-tab-empty">{children}</p>}
function milesBetween(lat1:number,lng1:number,lat2:number,lng2:number){const radians=(degrees:number)=>degrees*Math.PI/180;const dLat=radians(lat2-lat1);const dLng=radians(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLng/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
type UpcomingItem=BrowseDay["items"][number]&{day:string};
function DiscoverEvent({item,onOpen}:{item:UpcomingItem;onOpen:()=>void}){return <Link className="discover-event-card" href={`/${item.base}/${item.classId}?d=${item.iso}&from=discover`} onClick={(event)=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen();}}><small>{item.hm}{item.ap.toLowerCase()}</small>{item.classType&&<span className="discover-event-type">{item.classType}</span>}<strong>{item.name}</strong><span className="discover-event-studio">{item.where||"Location to come"}</span><span className="discover-event-teacher"><span className="discover-event-avatar" style={{background:item.coachColor}}>{item.coachPhoto?<img src={item.coachPhoto} alt="" loading="lazy" decoding="async"/>:(item.attributionName.trim().charAt(0)||"?").toUpperCase()}</span><span>{item.attributionName}</span></span></Link>}
function DiscoverPerson({person,index,activity}:{person:DirPerson;index:number;activity:number}){return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover`} className="discover-person-main"><span className="discover-person-face" style={{background:person.color}}>{person.photo?<img src={person.photo} alt="" loading={index<4?"eager":"lazy"} decoding="async"/>:person.name.trim().charAt(0).toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity?`${activity} this week`:person.title||person.disciplines.slice(0,2).join(" · "),person.location].filter(Boolean).join(" · ")}</small></span></Link><FavoritePersonButton person={person}/></div>}
function StudioGrid({studios}:{studios:DirStudio[]}){return <div className="discover-studio-grid">{studios.map((studio,index)=><div className="discover-studio-tile" key={studio.id}><Link href={`/s/${studio.slug}?from=discover`}><span className="discover-studio-media">{studio.photo?<img src={studio.photo} alt="" loading={index<4?"eager":"lazy"} decoding="async"/>:<span className="discover-studio-placeholder" style={{background:studio.color}}>{studio.name.trim().charAt(0).toUpperCase()}</span>}</span><strong>{studio.name}</strong><small>{studio.types.slice(0,2).join(" · ")||"Fitness space"}</small></Link><FavoritePlaceButton studio={studio}/></div>)}</div>}
function GroupGrid({groups}:{groups:Group[]}){return <div className="discover-group-grid">{groups.map((group)=><Link className="discover-group-tile" href={`/g/${group.slug}?from=discover`} key={group.id}><span><Icon name="groups" size={28}/></span><strong>{group.name}</strong><small>{group.description||"Open group"}</small></Link>)}</div>}
