"use server";
import { myStaffStudios, gymSchedule, studioStaff, shiftRequests } from "@/app/actions/gym";
export async function loadPreviewStudio(name:string,offset=0) {
 const studios=await myStaffStudios();
 const studio=studios.find(s=>s.admin&&s.name===name);
 if(!studio)throw new Error("Studio management access required.");
 const [week,staff,requests]=await Promise.all([gymSchedule(studio.id,offset),studioStaff(studio.id),shiftRequests(studio.id)]);
 return {week,staff:staff?.people.map(person=>({id:person.id,name:person.name,photo:person.photo,roles:person.roles.join(" · ")}))||[],requests};
}
