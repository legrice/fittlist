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
const [owner, member, outsider] = await db.insert(schema.users).values([
  { email:"audit-coach@example.test", name:"Audit Coach", handle:"auditcoach", kind:"coach", passwordHash, discoverable:true, onboardedAt:new Date(), location:"New York" },
  { email:"audit-member@example.test", name:"Audit Member", handle:"auditmember", kind:"fan", passwordHash, discoverable:true, onboardedAt:new Date() },
  { email:"audit-outsider@example.test", name:"Audit Outsider", handle:"auditoutsider", kind:"fan", passwordHash, onboardedAt:new Date() },
]).returning();
const [studio] = await db.insert(schema.studios).values({ name:"Audit Studio", slug:"audit-studio", address:"100 Test Street, New York", lat:40.71, lng:-74.0 }).returning();
await db.insert(schema.studioManagers).values({studioId:studio.id,userId:owner.id});
const iso = todayIso();
const dow = (new Date(`${iso}T12:00:00Z`).getUTCDay()+6)%7;
const [publicClass, privateClass] = await db.insert(schema.classes).values([
  { userId:owner.id, name:"Audit Strength", dayOfWeek:dow, startTime:"23:00", durationMin:45, studioId:studio.id, isPublic:true },
  { userId:owner.id, name:"CONFIDENTIAL COACH CLASS", dayOfWeek:dow, startTime:"23:00", durationMin:30, isPublic:false },
]).returning();
const [group] = await db.insert(schema.groups).values({name:"Audit Group",slug:"audit-group",ownerUserId:owner.id,inviteToken:randomBytes(24).toString("hex"),visibility:"public"}).returning();
await db.insert(schema.groupMembers).values([{groupId:group.id,userId:owner.id,role:"owner"},{groupId:group.id,userId:member.id,role:"member"}]);
await db.insert(schema.groupClasses).values({groupId:group.id,classId:publicClass.id,occurrenceDate:iso});
const [personal] = await db.insert(schema.personalClasses).values({ userId:owner.id, name:"CONFIDENTIAL PERSONAL PLAN", dayOfWeek:dow, startTime:"23:30" }).returning();
await db.insert(schema.subscribers).values({ trainerUserId:owner.id, userId:member.id, email:member.email });
const magic = randomBytes(32).toString("hex");
await db.insert(schema.magicLinks).values({ email:"audit-new@example.test", tokenHash:createHash("sha256").update(magic).digest("hex"), purpose:"signup", ip:"local", expiresAt:new Date(Date.now()+60*60*1000) });
async function token(id: string) { return new SignJWT({uid:id,sv:0}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret)); }
const fixture = {directory, dataDir:process.env.PGLITE_DATA_DIR, secret, password, iso, owner:{id:owner.id,email:owner.email,token:await token(owner.id)}, member:{id:member.id,email:member.email,token:await token(member.id)}, outsider:{id:outsider.id,email:outsider.email,token:await token(outsider.id)}, studioId:studio.id, classId:publicClass.id, privateClassId:privateClass.id, personalId:personal.id, magic};
writeFileSync(join(directory,"fixtures.json"),JSON.stringify(fixture));
console.log(join(directory,"fixtures.json"));
process.exit(0);

}
void main();
