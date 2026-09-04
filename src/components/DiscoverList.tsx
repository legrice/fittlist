"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { FavoritePlaceButton } from "@/components/FavoritePlaceButton";
import { FavoriteGroupButton } from "@/components/FavoriteGroupButton";
import type { BrowseDay } from "@/app/actions/discover";
import { CreateGroupSheet } from "@/components/SavedScreen";
import { discoverGroups, discoverPeople, discoverStudios } from "@/app/actions/discover";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ClassOpener } from "@/components/ClassOpener";
import { PLACE_KIND_LABELS, PLACE_KINDS } from "@/lib/studio";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

export type DiscoverHalf = "people" | "places" | "classes" | "groups";
type Group = { id:string; name:string; slug:string; description:string|null; purpose:string; lat:number|null; lng:number|null; favorited:boolean };
const distanceOptions = [["1","Within 1 mile"],["2","Within 2 miles"],["5","Within 5 miles"],["10","Within 10 miles"],["25","Within 25 miles"]] as const;

export function DiscoverList({ people,studios=[],cities,myLat=null,myLng=null,startHalf,upcoming=[],groups=[],backHref,hideBack=false }: { people:DirPerson[];studios?:DirStudio[];cities:string[];myCity?:string|null;myLat?:number|null;myLng?:number|null;startHalf?:DiscoverHalf;upcoming?:BrowseDay[];groups?:Group[];backHref:string;hideBack?:boolean }) {
  const [groupCreateOpen,setGroupCreateOpen]=useState(false);
  const [tab,setTab]=useState<DiscoverHalf>(startHalf??"people");
  const [studioRows,setStudioRows]=useState(studios);
  const [groupRows,setGroupRows]=useState(groups);
  const [peopleRows,setPeopleRows]=useState(people);
  const [,startDirectory]=useTransition();
  const [directoryLoading,setDirectoryLoading]=useState(false);
  const loadedDirectories=useRef(new Map<DiscoverHalf,string>());
  const directoryRequests=useRef(new Map<DiscoverHalf,number>());
  const initialDistance=myLat!=null&&myLng!=null?"2":"";
  const [classType,setClassType]=useState(""); const [distance,setDistance]=useState(initialDistance);
  const [discipline,setDiscipline]=useState(""); const [peopleDistance,setPeopleDistance]=useState(initialDistance);
  const [placeKind,setPlaceKind]=useState(""); const [studioType,setStudioType]=useState(""); const [studioDistance,setStudioDistance]=useState(initialDistance);
  const [purpose,setPurpose]=useState(""); const [groupDistance,setGroupDistance]=useState(initialDistance); const [groupSort,setGroupSort]=useState("");
  const allUpcoming=useMemo(()=>upcoming.flatMap((day)=>day.items.map((item)=>({...item,day:day.label}))),[upcoming]);
  const classTypes=[...new Set(allUpcoming.map((item)=>item.classType).filter((value):value is string=>!!value))].sort();
  const filteredUpcoming=allUpcoming.filter((item)=>{if(classType&&item.classType!==classType)return false;if(distance){if(myLat==null||myLng==null||item.lat==null||item.lng==null)return false;if(milesBetween(myLat,myLng,item.lat,item.lng)>Number(distance))return false;}return true;});
  const filteredUpcomingDays=upcoming.map((day)=>({iso:day.iso,label:day.label,items:filteredUpcoming.filter((item)=>item.iso===day.iso)})).filter((day)=>day.items.length>0);
  const disciplines=[...new Set(peopleRows.flatMap((person)=>person.disciplines))].sort();
  const shownPeople=peopleRows.filter((person)=>person.kind==="coach"&&(!discipline||person.disciplines.includes(discipline))&&(!peopleDistance||(myLat!=null&&myLng!=null&&person.lat!=null&&person.lng!=null&&milesBetween(myLat,myLng,person.lat,person.lng)<=Number(peopleDistance))));
  const studioTypes=[...new Set(studioRows.flatMap((studio)=>studio.types))].sort();
  const shownStudios=studioRows.filter((studio)=>(!placeKind||studio.placeKind===placeKind)&&(!studioType||studio.types.includes(studioType))&&(!studioDistance||(myLat!=null&&myLng!=null&&studio.lat!=null&&studio.lng!=null&&milesBetween(myLat,myLng,studio.lat,studio.lng)<=Number(studioDistance))));
  const shownGroups=groupRows.filter((group)=>(!purpose||group.purpose===purpose)&&(!groupDistance||(myLat!=null&&myLng!=null&&group.lat!=null&&group.lng!=null&&milesBetween(myLat,myLng,group.lat,group.lng)<=Number(groupDistance)))).sort((a,b)=>groupSort==="name"?a.name.localeCompare(b.name):0);
  const activityByName=upcoming.flatMap((day)=>day.items).reduce((counts,item)=>{const key=item.attributionName.trim().toLowerCase();if(key)counts.set(key,(counts.get(key)??0)+1);return counts;},new Map<string,number>());
  const discoverCalendarDays:WeekDayRows[]=filteredUpcomingDays.map((day)=>({iso:day.iso,label:day.label,rows:day.items.map((item)=>{const base=item.base.replace(/^\//,"");return {key:`${item.classId}.${item.iso}`,name:item.name,where:item.where||"Location to come",hm:item.hm,ap:item.ap,coach:{id:item.classId,name:item.attributionName,color:item.coachColor,photo:item.coachPhoto},href:`/${base}/${item.classId}?d=${item.iso}&from=discover-classes`,classId:item.classId,iso:item.iso,base};})}));
  useEffect(()=>{
    if(tab==="classes")return;
    const distanceValue=tab==="people"?peopleDistance:tab==="places"?studioDistance:groupDistance;
    const key=distanceValue||"any";
    if(loadedDirectories.current.get(tab)===key)return;
    loadedDirectories.current.set(tab,key);
    const request=(directoryRequests.current.get(tab)??0)+1;
    directoryRequests.current.set(tab,request);
    const miles=distanceValue?Number(distanceValue):undefined;
    const memoryKey=`discover-directory:${tab}:${key}`;
    const remembered=tab==="places"
      ? readClientMemory<DirStudio[]>(memoryKey)
      : tab==="groups"
        ? readClientMemory<Group[]>(memoryKey)
        : readClientMemory<DirPerson[]>(memoryKey);
    if(tab==="places")setStudioRows((remembered as DirStudio[]|null)??[]);
    if(tab==="groups")setGroupRows((remembered as Group[]|null)??[]);
    if(tab==="people")setPeopleRows((remembered as DirPerson[]|null)??[]);
    setDirectoryLoading(!remembered);
    startDirectory(async()=>{
      try{
        if(tab==="places"){
          const rows=await loadClientMemory(memoryKey,()=>discoverStudios(miles));
          if(rows&&directoryRequests.current.get(tab)===request)setStudioRows(rows);
        }
        if(tab==="groups"){
          const rows=await loadClientMemory(memoryKey,()=>discoverGroups(miles));
          if(rows&&directoryRequests.current.get(tab)===request)setGroupRows(rows);
        }
        if(tab==="people"){
          const rows=await loadClientMemory(memoryKey,async()=>(await discoverPeople(miles)).people);
          if(rows&&directoryRequests.current.get(tab)===request)setPeopleRows(rows);
        }
      }catch{
        // A remembered directory stays visible. A first-load failure keeps
        // the existing empty treatment and naturally retries next visit.
      }finally{
        if(directoryRequests.current.get(tab)===request)setDirectoryLoading(false);
      }
    });
  },[tab,peopleDistance,studioDistance,groupDistance]);
  return <>
    <div className="dissearchrow discover-searchrow"><Link className="dissearch discover-search-door" href="/search"><Icon name="search" size={20} className="dissearch-ic"/><span>Search FittList</span></Link></div>
    <div className="discover-directory-tabs" role="tablist">{([['people','People'],['places','Studios'],['groups','Groups']] as const).map(([value,label])=><button role="tab" aria-selected={tab===value} className={tab===value?"on":""} onClick={()=>setTab(value)} key={value}>{label}</button>)}</div>
    {tab==="classes"&&<><FilterRow><Filter label="Distance" value={distance} onChange={setDistance} all="Any distance" options={distanceOptions} disabled={myLat==null||myLng==null}/><Filter label="Type" value={classType} onChange={setClassType} all="Any type" options={classTypes}/></FilterRow>{discoverCalendarDays.length?<ClassOpener handle=""><CalendarList className="discover-calendar-list" days={discoverCalendarDays}/></ClassOpener>:<Empty>There are no classes matching these filters.</Empty>}</>}
    {tab==="people"&&<><FilterRow><Filter label="Distance" value={peopleDistance} onChange={setPeopleDistance} all="No distance limit" options={distanceOptions} disabled={myLat==null||myLng==null}/><Filter label="Specialty" value={discipline} onChange={setDiscipline} all="Any specialty" options={disciplines}/></FilterRow>{directoryLoading?<Empty>Loading people…</Empty>:shownPeople.length?<div className="discover-person-grid">{shownPeople.map((person,index)=><DiscoverPerson person={person} index={index} activity={activityByName.get(person.name.trim().toLowerCase())??person.classesThisWeek} key={person.id}/>)}</div>:<Empty>There are no people matching these filters.</Empty>}</>}
    {tab==="places"&&<><FilterRow><Filter label="Distance" value={studioDistance} onChange={setStudioDistance} all="Any distance" options={distanceOptions} disabled={myLat==null||myLng==null}/><Filter label="Type" value={placeKind} onChange={setPlaceKind} all="Any type" options={PLACE_KINDS.map((kind)=>[kind,PLACE_KIND_LABELS[kind]] as const)}/><Filter label="Category" value={studioType} onChange={setStudioType} all="Any category" options={studioTypes}/></FilterRow>{directoryLoading?<Empty>Loading studios…</Empty>:shownStudios.length?<StudioGrid studios={shownStudios}/>:<Empty>There are no studios matching these filters.</Empty>}</>}
    {tab==="groups"&&<><FilterRow><Filter label="Distance" value={groupDistance} onChange={setGroupDistance} all="Any distance" options={distanceOptions} disabled={myLat==null||myLng==null}/><Filter label="Purpose" value={purpose} onChange={setPurpose} all="Any purpose" options={[["plan","Plan together"],["community","Community"],["event","Events"]]}/><Filter label="Sort" value={groupSort} onChange={setGroupSort} all="Newest" options={[["name","Name"]]}/></FilterRow>{directoryLoading?<Empty>Loading groups…</Empty>:shownGroups.length?<GroupGrid groups={shownGroups}/>:groupRows.length?<Empty>There are no groups matching these filters.</Empty>:<div className="discover-groups-empty"><span><Icon name="groups" size={32}/></span><h2>Plan fitness together</h2><p>Groups are shared calendars and updates for the people you train with. Add classes, invite members, and keep everyone&rsquo;s plans in one place.</p><button type="button" className="btn si" onClick={()=>setGroupCreateOpen(true)}><Icon name="add" size={21}/>Create a group</button></div>}</>}
    {!hideBack&&<Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    {groupCreateOpen&&<CreateGroupSheet onClose={()=>setGroupCreateOpen(false)}/>}
  </>;
}

function FilterRow({children}:{children:ReactNode}){return <div className="discover-class-filters discover-tab-filters">{children}</div>}
function Filter({label,value,onChange,all,options,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;all:string;options:readonly (string|readonly[string,string])[];disabled?:boolean}){return <label><select aria-label={label} value={value} onChange={(event)=>onChange(event.target.value)} disabled={disabled}><option value="">{all}</option>{options.map((option)=>{const [value,label]=typeof option==="string"?[option,option]:option;return <option value={value} key={value}>{label}</option>})}</select></label>}
function Empty({children}:{children:ReactNode}){return <p className="discover-tab-empty">{children}</p>}
function milesBetween(lat1:number,lng1:number,lat2:number,lng2:number){const radians=(degrees:number)=>degrees*Math.PI/180;const dLat=radians(lat2-lat1);const dLng=radians(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLng/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function DiscoverPerson({person,index,activity}:{person:DirPerson;index:number;activity:number}){return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover-people`} className="discover-person-main"><span className="discover-person-face" style={{background:person.color}}>{person.photo?<img src={person.photo} alt="" loading={index<4?"eager":"lazy"} decoding="async"/>:person.name.trim().charAt(0).toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity?`${activity} this week`:person.title||person.disciplines.slice(0,2).join(" · "),person.location].filter(Boolean).join(" · ")}</small></span></Link><FavoritePersonButton person={person}/></div>}
function StudioGrid({studios}:{studios:DirStudio[]}){
  return <div className="discover-studio-grid">{studios.map((studio,index)=><div className="discover-studio-row" key={studio.id}>
    <Link className="discover-studio-main" href={`/s/${studio.slug}?from=discover-studios`}>
      <span className="discover-studio-media">{studio.photo?<img src={studio.photo} alt="" loading={index<4?"eager":"lazy"} decoding="async"/>:<span className="discover-studio-placeholder" style={{background:studio.color}}>{studio.name.trim().charAt(0).toUpperCase()}</span>}</span>
      <span className="discover-studio-copy"><strong>{studio.name}</strong><small>{studio.types.slice(0,2).join(" · ")||"Fitness space"}</small></span>
    </Link>
    <FavoritePlaceButton studio={studio}/>
  </div>)}</div>
}
function GroupGrid({groups}:{groups:Group[]}){return <div className="discover-group-grid">{groups.map((group)=><div className="discover-group-tile" key={group.id}><Link href={`/g/${group.slug}?from=discover-groups`}><span><Icon name="groups" size={28}/></span><strong>{group.name}</strong><small>{group.description||"Open group"}</small></Link><FavoriteGroupButton group={group}/></div>)}</div>}
