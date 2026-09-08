import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { getDb, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { todayIso } from "../src/lib/format";

async function main() {
// Deliberately local and disposable. No production URLs or credentials.
if (process.env.DATABASE_URL) throw new Error("Audit fixtures refuse DATABASE_URL");
const directory = mkdtempSync(join(tmpdir(), "fittlist-audit-"));
process.env.PGLITE_DATA_DIR = join(directory, "db");
const secret = randomBytes(32).toString("hex");
const db = await getDb();
const password = "Audit-only-password-123";
const passwordHash = await hashPassword(password);
const [owner, member, outsider, summaryMember] = await db.insert(schema.users).values([
  { email:"audit-coach@example.test", name:"Audit Coach", handle:"auditcoach", kind:"coach", passwordHash, discoverable:true, onboardedAt:new Date(), location:"New York" },
  { email:"audit-member@example.test", name:"Audit Member", handle:"auditmember", kind:"fan", passwordHash, discoverable:true, onboardedAt:new Date() },
  { email:"audit-outsider@example.test", name:"Audit Outsider", handle:"auditoutsider", kind:"fan", passwordHash, onboardedAt:new Date() },
  { email:"summary-member@example.test", name:"Summary Member", handle:"summarymember", kind:"fan", passwordHash, onboardedAt:new Date() },
]).returning();
const [studio] = await db.insert(schema.studios).values({ name:"Audit Studio", slug:"audit-studio", address:"100 Test Street, New York", lat:40.71, lng:-74.0 }).returning();
await db.insert(schema.studioManagers).values({studioId:studio.id,userId:owner.id});
const iso = todayIso();
const dow = (new Date(`${iso}T12:00:00Z`).getUTCDay()+6)%7;
const [publicClass, privateClass] = await db.insert(schema.classes).values([
  { userId:owner.id, name:"Audit Strength", dayOfWeek:dow, startTime:"23:00", durationMin:45, studioId:studio.id, isPublic:true },
  { userId:owner.id, name:"CONFIDENTIAL COACH CLASS", dayOfWeek:dow, startTime:"23:00", durationMin:30, isPublic:false },
]).returning();
// Claimed studio attribution is independent of a coach's personal shift visibility.
const [studioAccount, scheduledCoach, coverCoach] = await db.insert(schema.users).values([
  {email:"schedule-account@example.test",name:"Schedule Account",kind:"gym"},
  {email:"scheduled-coach@example.test",name:"Scheduled Coach",handle:"scheduledcoach",kind:"coach",shiftsPublic:false},
  {email:"cover-coach@example.test",name:"Cover Coach",handle:"covercoach",kind:"coach",shiftsPublic:false},
]).returning();
const [namedStudio, hiddenStudio] = await db.insert(schema.studios).values([
  {name:"Named Schedule Studio",slug:"named-schedule-studio",address:"100 Test Street",accountUserId:studioAccount.id,showCoaches:true},
  {name:"Hidden Schedule Studio",slug:"hidden-schedule-studio",address:"200 Test Street",accountUserId:studioAccount.id,showCoaches:false},
]).returning();
const scheduleDate = new Date(`${iso}T12:00:00Z`);scheduleDate.setUTCDate(scheduleDate.getUTCDate()+1);
const scheduleIso = scheduleDate.toISOString().slice(0,10);
const scheduleRows = await db.insert(schema.classes).values([
  {name:"Regular Assignment",studioId:namedStudio.id},
  {name:"Covered Assignment",studioId:namedStudio.id},
  {name:"Open Assignment",studioId:namedStudio.id},
  {name:"Hidden Assignment",studioId:hiddenStudio.id},
].map(row=>({...row,userId:studioAccount.id,coachUserId:scheduledCoach.id,dayOfWeek:(scheduleDate.getUTCDay()+6)%7,specificDate:scheduleIso,startTime:"17:00",durationMin:50,isPublic:true}))).returning();
await db.insert(schema.shiftCovers).values([
  {classId:scheduleRows[1].id,occurrenceDate:scheduleIso,coachUserId:coverCoach.id},
  {classId:scheduleRows[2].id,occurrenceDate:scheduleIso,coachUserId:null},
]);
const [group] = await db.insert(schema.groups).values({name:"Audit Group",slug:"audit-group",ownerUserId:owner.id,inviteToken:randomBytes(24).toString("hex"),visibility:"public"}).returning();
await db.insert(schema.groupMembers).values([{groupId:group.id,userId:owner.id,role:"owner"},{groupId:group.id,userId:member.id,role:"member"}]);
await db.insert(schema.groupClasses).values({groupId:group.id,classId:publicClass.id,occurrenceDate:iso});
const [personal] = await db.insert(schema.personalClasses).values({ userId:owner.id, name:"CONFIDENTIAL PERSONAL PLAN", dayOfWeek:dow, startTime:"23:30" }).returning();
await db.insert(schema.personalClasses).values(["Run club","Mat Pilates","Lift","Strength & Conditioning"].map((name,offset)=>{
  const date=new Date(`${iso}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);
  return {userId:summaryMember.id,name,dayOfWeek:(date.getUTCDay()+6)%7,specificDate:date.toISOString().slice(0,10),startTime:"23:30",durationMin:45};
}));
await db.insert(schema.subscribers).values({ trainerUserId:owner.id, userId:member.id, email:member.email });
const magic = randomBytes(32).toString("hex");
await db.insert(schema.magicLinks).values({ email:"audit-new@example.test", tokenHash:createHash("sha256").update(magic).digest("hex"), purpose:"signup", ip:"local", expiresAt:new Date(Date.now()+60*60*1000) });
async function token(id: string) { return new SignJWT({uid:id,sv:0}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret)); }
const fixture = {summaryMember:{token:await token(summaryMember.id)},directory, dataDir:process.env.PGLITE_DATA_DIR, secret, password, iso, owner:{id:owner.id,email:owner.email,token:await token(owner.id)}, member:{id:member.id,email:member.email,token:await token(member.id)}, outsider:{id:outsider.id,email:outsider.email,token:await token(outsider.id)}, studioId:studio.id, classId:publicClass.id, privateClassId:privateClass.id, personalId:personal.id, magic};
writeFileSync(join(directory,"fixtures.json"),JSON.stringify(fixture));
console.log(join(directory,"fixtures.json"));
process.exit(0);

}
void main();
