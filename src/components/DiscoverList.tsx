"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { FavoritePlaceButton } from "@/components/FavoritePlaceButton";
import type { BrowseDay } from "@/app/actions/discover";

export type DiscoverHalf = "people" | "places" | "classes" | "groups";
type Group = { id:string; name:string; slug:string; description:string|null; purpose:string };

export function DiscoverList({ people,studios=[],cities,myLat=null,myLng=null,startHalf,upcoming=[],groups=[],backHref,hideBack=false }: { people:DirPerson[];studios?:DirStudio[];cities:string[];myCity?:string|null;myLat?:number|null;myLng?:number|null;startHalf?:DiscoverHalf;upcoming?:BrowseDay[];groups?:Group[];backHref:string;hideBack?:boolean }) {
  const [tab,setTab]=useState<DiscoverHalf>(startHalf??"classes");
  const [searchOpen,setSearchOpen]=useState(false); const [query,setQuery]=useState("");
  const [classType,setClassType]=useState(""); const [distance,setDistance]=useState("");
  const [discipline,setDiscipline]=useState(""); const [peopleCity,setPeopleCity]=useState("");
  const [studioType,setStudioType]=useState(""); const [studioCity,setStudioCity]=useState("");
  const [purpose,setPurpose]=useState(""); const [groupSort,setGroupSort]=useState("newest");
  const q=query.trim().toLowerCase();
  const allUpcoming=useMemo(()=>upcoming.flatMap((day)=>day.items.map((item)=>({...item,day:day.label}))).filter((item)=>!q||[item.name,item.where,item.attributionName].some((value)=>(value??"").toLowerCase().includes(q))),[upcoming,q]);
  const classTypes=[...new Set(allUpcoming.map((item)=>item.classType).filter((value):value is string=>!!value))].sort();
  const filteredUpcoming=allUpcoming.filter((item)=>{if(classType&&item.classType!==classType)return false;if(distance){if(myLat==null||myLng==null||item.lat==null||item.lng==null)return false;if(milesBetween(myLat,myLng,item.lat,item.lng)>Number(distance))return false;}return true;});
  const disciplines=[...new Set(people.flatMap((person)=>person.disciplines))].sort();
  const shownPeople=people.filter((person)=>person.kind==="coach"&&(!q||[person.name,person.title,person.location,person.handle,...person.disciplines].some((value)=>value.toLowerCase().includes(q)))&&(!discipline||person.disciplines.includes(discipline))&&(!peopleCity||person.location.toLowerCase().includes(peopleCity.toLowerCase())));
  const studioTypes=[...new Set(studios.flatMap((studio)=>studio.types))].sort();
  const shownStudios=studios.filter((studio)=>(!q||[studio.name,studio.address,...studio.types].some((value)=>value.toLowerCase().includes(q)))&&(!studioType||studio.types.includes(studioType))&&(!studioCity||studio.address.toLowerCase().includes(studioCity.toLowerCase())));
  const shownGroups=groups.filter((group)=>(!q||`${group.name} ${group.description??""}`.toLowerCase().includes(q))&&(!purpose||group.purpose===purpose)).sort((a,b)=>groupSort==="name"?a.name.localeCompare(b.name):0);
  const activityByName=upcoming.flatMap((day)=>day.items).reduce((counts,item)=>{const key=item.attributionName.trim().toLowerCase();if(key)counts.set(key,(counts.get(key)??0)+1);return counts;},new Map<string,number>());
  const teacherFor=(name:string)=>people.find((person)=>person.name.trim().toLowerCase()===name.trim().toLowerCase());
  return <>
    <div className="discover-title-row"><h1>Discover</h1><button type="button" aria-label="Search Discover" aria-expanded={searchOpen} onClick={()=>setSearchOpen((open)=>!open)}><Icon name="search" size={24}/></button></div>
    {searchOpen&&<div className="dissearchrow discover-searchrow"><label className="dissearch"><Icon name="search" size={20} className="dissearch-ic"/><input autoFocus className="dissearch-in" type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search Discover" aria-label="Search Discover"/>{query&&<button type="button" className="dissearch-x" onClick={()=>setQuery("")} aria-label="Clear search"><Icon name="close" size={19}/></button>}</label></div>}
    <div className="discover-directory-tabs" role="tablist">{([['classes','Classes'],['people','People'],['places','Studios'],['groups','Groups']] as const).map(([value,label])=><button role="tab" aria-selected={tab===value} className={tab===value?"on":""} onClick={()=>setTab(value)} key={value}>{label}</button>)}</div>
    {tab==="classes"&&<><FilterRow><Filter label="Type" value={classType} onChange={setClassType} all="All types" options={classTypes}/><Filter label="Distance" value={distance} onChange={setDistance} all="Any distance" options={[["1","Within 1 mile"],["5","Within 5 miles"],["10","Within 10 miles"],["25","Within 25 miles"]]} disabled={myLat==null||myLng==null}/></FilterRow>{filteredUpcoming.length?<div className="discover-event-list">{filteredUpcoming.map((item)=><DiscoverEvent item={item} teacher={teacherFor(item.attributionName)} key={`${item.classId}.${item.iso}`}/>)}</div>:<Empty>There are no classes matching these filters.</Empty>}</>}
    {tab==="people"&&<><FilterRow><Filter label="Specialty" value={discipline} onChange={setDiscipline} all="All specialties" options={disciplines}/><Filter label="Location" value={peopleCity} onChange={setPeopleCity} all="All locations" options={cities}/></FilterRow>{shownPeople.length?<div className="discover-person-grid">{shownPeople.map((person,index)=><DiscoverPerson person={person} index={index} activity={activityByName.get(person.name.trim().toLowerCase())??person.classesThisWeek} key={person.id}/>)}</div>:<Empty>There are no people matching these filters.</Empty>}</>}
    {tab==="places"&&<><FilterRow><Filter label="Type" value={studioType} onChange={setStudioType} all="All types" options={studioTypes}/><Filter label="Location" value={studioCity} onChange={setStudioCity} all="All locations" options={cities}/></FilterRow>{shownStudios.length?<StudioGrid studios={shownStudios}/>:<Empty>There are no studios matching these filters.</Empty>}</>}
    {tab==="groups"&&<><FilterRow><Filter label="Purpose" value={purpose} onChange={setPurpose} all="All purposes" options={[["plan","Plan together"],["community","Community"],["event","Events"]]}/><Filter label="Sort" value={groupSort} onChange={setGroupSort} all="Newest" options={[["name","Name"]]}/></FilterRow>{shownGroups.length?<GroupGrid groups={shownGroups}/>:<Empty>There are no groups matching these filters.</Empty>}</>}
    {!hideBack&&<Link className="logoutbtn" href={backHref}>Back to your week</Link>}
  </>;
}

function FilterRow({children}:{children:ReactNode}){return <div className="discover-class-filters discover-tab-filters">{children}</div>}
function Filter({label,value,onChange,all,options,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;all:string;options:(string|readonly[string,string])[];disabled?:boolean}){return <label><span>{label}</span><select value={value} onChange={(event)=>onChange(event.target.value)} disabled={disabled}><option value="">{all}</option>{options.map((option)=>{const [value,label]=typeof option==="string"?[option,option]:option;return <option value={value} key={value}>{label}</option>})}</select></label>}
function Empty({children}:{children:ReactNode}){return <p className="discover-tab-empty">{children}</p>}
function milesBetween(lat1:number,lng1:number,lat2:number,lng2:number){const radians=(degrees:number)=>degrees*Math.PI/180;const dLat=radians(lat2-lat1);const dLng=radians(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLng/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
type UpcomingItem=BrowseDay["items"][number]&{day:string};
function DiscoverEvent({item,teacher}:{item:UpcomingItem;teacher?:DirPerson}){return <Link className="discover-event-card" href={`/${item.base}/${item.classId}?d=${item.iso}&from=discover`}><small>{item.day} • {item.hm}{item.ap.toLowerCase()}</small>{item.classType&&<span className="discover-event-type">{item.classType}</span>}<strong>{item.name}</strong><span className="discover-event-studio">{item.where||"Location to come"}</span><span className="discover-event-teacher"><span className="discover-event-avatar" style={{background:teacher?.color}}>{teacher?.photo?<img src={teacher.photo} alt=""/>:(item.attributionName.trim().charAt(0)||"?").toUpperCase()}</span><span>{item.attributionName}</span></span></Link>}
function DiscoverPerson({person,index,activity}:{person:DirPerson;index:number;activity:number}){return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover`} className="discover-person-main"><span className="discover-person-face" style={{background:person.color}}>{person.photo?<img src={person.photo} alt="" loading={index<4?"eager":"lazy"}/>:person.name.trim().charAt(0).toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity?`${activity} this week`:person.title||person.disciplines.slice(0,2).join(" · "),person.location].filter(Boolean).join(" · ")}</small></span></Link><FavoritePersonButton person={person}/></div>}
function StudioGrid({studios}:{studios:DirStudio[]}){return <div className="discover-studio-grid">{studios.map((studio,index)=><div className="discover-studio-tile" key={studio.id}><Link href={`/s/${studio.slug}?from=discover`}><span className="discover-studio-media">{studio.photo?<img src={studio.photo} alt="" loading={index<4?"eager":"lazy"}/>:<span className="discover-studio-placeholder" style={{background:studio.color}}>{studio.name.trim().charAt(0).toUpperCase()}</span>}</span><strong>{studio.name}</strong><small>{studio.types.slice(0,2).join(" · ")||"Fitness space"}</small></Link><FavoritePlaceButton studio={studio}/></div>)}</div>}
function GroupGrid({groups}:{groups:Group[]}){return <div className="discover-group-grid">{groups.map((group)=><Link className="discover-group-tile" href={`/g/${group.slug}?from=discover`} key={group.id}><span><Icon name="groups" size={28}/></span><strong>{group.name}</strong><small>{group.description||"Open group"}</small></Link>)}</div>}
