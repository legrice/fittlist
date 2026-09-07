import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import sharp from "sharp";
import { getDb, schema } from "../src/db";
import { todayIso } from "../src/lib/format";

// Local only. Keep the fixture manifest (which contains a synthetic session)
// outside the repository; the browser runner writes a sanitized report.
async function main() {
  if (process.env.DATABASE_URL) throw new Error("Scale fixtures refuse DATABASE_URL");
  const directory = mkdtempSync(join(tmpdir(), "fittlist-scale-audit-"));
  process.env.PGLITE_DATA_DIR = join(directory, "db");
  const secret = randomBytes(32).toString("hex");
  const db = await getDb();
  const portrait = "data:image/png;base64," + (await sharp({create:{width:40,height:100,channels:3,background:"#8cf25f"}}).png().toBuffer()).toString("base64");
  // Legacy data-URL artwork is deliberately substantial, so accidentally
  // returning artwork from a list query is measurable. It is never rendered.
  const legacyArtwork = "data:image/png;base64," + randomBytes(12_000).toString("base64");
  const [viewer] = await db.insert(schema.users).values({email:"scale-viewer@example.test",name:"Scale Viewer",handle:"scaleviewer",kind:"fan",onboardedAt:new Date(),location:"New York",locationLat:40.71,locationLng:-74.0}).returning();
  const people = await db.insert(schema.users).values(Array.from({length:400},(_,i)=>({email:`scale-${i}@example.test`,name:i===0?"Alexandria-Catherine Longlastname International Fitness and Mobility Coach":`Scale Coach ${i}`,handle:`scalecoach${i}`,kind:"coach",title:"Strength and mobility",about:"A synthetic profile used for local audit only.",onboardedAt:new Date(),discoverable:true,location:"New York",locationLat:40.71,locationLng:-74.0,photo:i===1?portrait:i===2?"/audit-missing-photo.png":null,photoThumb:i===1?portrait:null}))).returning();
  await db.insert(schema.subscribers).values(people.map(person=>({trainerUserId:person.id,userId:viewer.id,email:viewer.email})));
  const studios = await db.insert(schema.studios).values(Array.from({length:20},(_,i)=>({name:i===0?"International Performance Athletics and Restorative Mobility Studio":`Scale Studio ${i}`,slug:`scale-studio-${i}`,address:"100 Test Street, New York",lat:40.71,lng:-74.0,photo:i===1?portrait:null}))).returning();
  await db.insert(schema.studioEndorsements).values(studios.map(studio=>({targetStudioId:studio.id,endorserUserId:viewer.id,trait:"been_here"})));
  const today=todayIso();
  const dow=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7;
  const classes: {id:string;dayOfWeek:number}[]=[];
  for(let batch=0;batch<8;batch++) {
    const rows=await db.insert(schema.classes).values(Array.from({length:500},(_,j)=>{
      const i=batch*500+j;
      return {userId:people[Math.floor(i/10)].id,name:i===0?"Strength, Endurance, Mobility, and Full Body Conditioning for Everyone":`Scale Class ${i}`,dayOfWeek:(dow+(i%7))%7,startTime:`${String(7+(i%14)).padStart(2,"0")}:00`,durationMin:45,studioId:studios[i%20].id,isPublic:true,image:legacyArtwork};
    })).returning({id:schema.classes.id,dayOfWeek:schema.classes.dayOfWeek});
    classes.push(...rows);
  }
  const groups=await db.insert(schema.groups).values(Array.from({length:20},(_,i)=>({name:i===0?"A Community of Friends Who Love to Train Together Every Single Week":`Scale Group ${i}`,slug:`scale-group-${i}`,description:"A longer group description that should wrap or truncate cleanly beneath the group name, without colliding with its photo or following button.",photo:i===1?portrait:null,visibility:"public",ownerUserId:people[i].id,inviteToken:randomBytes(24).toString("hex")}))).returning();
  await db.insert(schema.groupMembers).values(groups.flatMap((group,index)=>[{groupId:group.id,userId:viewer.id,role:"member"},...people.slice(index*5,index*5+50).map((person,i)=>({groupId:group.id,userId:person.id,role:i===0?"owner":"member"}))]));
  await db.insert(schema.groupClasses).values(groups.map((group,index)=>({groupId:group.id,classId:classes[index*7].id,occurrenceDate:today})));
  const token=await new SignJWT({uid:viewer.id,sv:0}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("4h").sign(new TextEncoder().encode(secret));
  const output=join(directory,"fixtures.json");
  writeFileSync(output,JSON.stringify({directory,dataDir:process.env.PGLITE_DATA_DIR,secret,viewer:{id:viewer.id,email:viewer.email,token},counts:{follows:400,classes:4000,studios:20,groups:20,memberships:1020},iso:today,portrait}));
  console.log(output);
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
