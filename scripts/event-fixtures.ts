import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { getDb, schema } from '../src/db';
async function main(){
  if(process.env.DATABASE_URL || process.env.VERCEL)throw Error('Event fixtures are local only');
  const directory=mkdtempSync(join(tmpdir(),'fittlist-event-browser-')),secret=randomBytes(32).toString('hex');process.env.PGLITE_DATA_DIR=join(directory,'db');
  const db=await getDb();
  const [gym,admin,member]=await db.insert(schema.users).values([{email:'event-gym@example.test',name:'Expo',kind:'gym'},{email:'event-admin@example.test',name:'Expo Admin',handle:'expoadmin',kind:'coach',onboardedAt:new Date()},{email:'event-member@example.test',name:'Jordan Lane',handle:'jordanlane',kind:'fan',onboardedAt:new Date()}]).returning();
  const date='2099-09-12',dow=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  const [studio]=await db.insert(schema.studios).values({name:'Hudson Fit Expo',slug:'hudson-fit-expo',address:'Expo demonstration hall',accountUserId:gym.id,registrationDate:date,registrationPro:true,placeKind:'event'}).returning();
  await db.insert(schema.studios).values({name:'Unapproved space',slug:'pro-disabled',address:'Test hall',registrationDate:date});
  await db.insert(schema.studioManagers).values({studioId:studio.id,userId:admin.id});
  const classes=await db.insert(schema.classes).values(['Strength Circuit','Morning Yoga','Dance Fitness','Pilates Flow'].map((name,i)=>({userId:gym.id,studioId:studio.id,name,dayOfWeek:dow,specificDate:date,startTime:`${String(10+i).padStart(2,'0')}:00`,durationMin:45,isPublic:true,rsvp:true,registrationCapacity:i===2 ? 1 : 20,registrationWaitlist:i===2}))).returning();
  await db.insert(schema.attendances).values({userId:member.id,classId:classes[0].id,occurrenceDate:date,isPublic:false});
  await db.insert(schema.attendances).values({userId:member.id,classId:classes[2].id,occurrenceDate:date,isPublic:false});
  const magic=randomBytes(32).toString('hex');await db.insert(schema.magicLinks).values({email:'expo-browser-new@example.test',tokenHash:createHash('sha256').update(magic).digest('hex'),purpose:'signup',registration:{studioId:studio.id,classId:classes[1].id,date,name:'Alex Rivera'},expiresAt:new Date(Date.now()+3600000)});
  const token=async(id:string)=>new SignJWT({uid:id,sv:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('2h').sign(new TextEncoder().encode(secret));
  const path=join(directory,'fixtures.json');writeFileSync(path,JSON.stringify({directory,dataDir:process.env.PGLITE_DATA_DIR,secret,date,slug:studio.slug,classes:classes.map(c=>({id:c.id,name:c.name})),admin:await token(admin.id),member:await token(member.id),magic}),{mode:0o600});console.log(path);
}
main().then(()=>process.exit(0)).catch(()=>{console.error('Fixture setup failed');process.exit(1);});
