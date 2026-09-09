import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
async function main() {
  if(process.env.DATABASE_URL || process.env.VERCEL)throw Error('Event tests require an isolated database');
  process.env.PGLITE_DATA_DIR=join(mkdtempSync(join(tmpdir(),'fittlist-event-check-')),'db');
  process.env.SESSION_SECRET=randomBytes(32).toString('hex');process.env.ADMIN_EMAILS='';process.env.INVITE_ONLY='false';
  const request=new AsyncLocalStorage<Map<string,string>>(), require=createRequire(import.meta.url);
  const runtime=require('node:module'), original=runtime._load.bind(runtime);
  runtime._load=(id:string,...args:unknown[])=>id==='server-only'?{}:original(id,...args);
  require('next/headers').cookies=async()=>({get:(key:string)=>request.getStore()?.has(key)?{value:request.getStore()!.get(key)}:undefined,set:(key:string,value:string)=>request.getStore()?.set(key,value),delete:(key:string)=>request.getStore()?.delete(key)});
  require('next/headers').headers=async()=>new Headers();
  require('next/cache').revalidatePath=()=>{};require('next/server').after=()=>{};
  globalThis.fetch=async()=>{throw Error('External network disabled');};

  delete process.env.BLOB_READ_WRITE_TOKEN;
  const {getDb,schema}=await import('../src/db');
  const {saveProfileBanner,loadProfileBanner}=await import('../src/app/actions/profile-banner');
  const db=await getDb();
  const people=await db.insert(schema.users).values([0,1].map(i=>({email:`banner${i}@example.test`,handle:`banner${i}`,photo:'original-avatar',kind:i?'fan':'instructor'}))).returning();
  const [studio]=await db.insert(schema.studios).values({name:'Banner studio',address:'Test',slug:'banner-studio'}).returning();
  await db.insert(schema.studioManagers).values({studioId:studio.id,userId:people[0].id});
  async function as<T>(i:number,fn:()=>Promise<T>){const token=await new SignJWT({uid:people[i].id,sv:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.SESSION_SECRET));return request.run(new Map([['fl_session',token]]),fn);}
  const bytes=await sharp({create:{width:600,height:400,channels:3,background:'#365e45'}}).png().toBuffer();
  const image=`data:image/png;base64,${bytes.toString('base64')}`;
  assert(!(await saveProfileBanner(image)).ok,'Anonymous cannot edit');
  assert(!(await as(1,()=>saveProfileBanner(image,studio.id))).ok,'Unrelated account cannot edit studio');
  assert.equal(await as(1,()=>loadProfileBanner(studio.id)),null);
  assert(!(await as(0,()=>saveProfileBanner('https://example.test/image.jpg'))).ok);
  assert(!(await as(0,()=>saveProfileBanner('data:image/png;base64,broken'))).ok);
  assert(!(await as(0,()=>saveProfileBanner('x'.repeat(2500001)))).ok);
  for(const i of [0,1]) {
    assert((await as(i,()=>saveProfileBanner(image))).ok);
    const banner=await as(i,()=>loadProfileBanner());assert(banner?.banner);
    const dimensions=await sharp(Buffer.from(banner.banner.split(',')[1],'base64')).metadata();
    assert.equal(dimensions.width,1600);assert.equal(dimensions.height,500);
    const [person]=await db.select().from(schema.users).where(eq(schema.users.id,people[i].id));assert.equal(person.photo,'original-avatar');
    assert((await as(i,()=>saveProfileBanner(null))).ok);assert.equal((await as(i,()=>loadProfileBanner()))?.banner,null);
  }
  assert((await as(0,()=>saveProfileBanner(image,studio.id))).ok);
  assert((await as(0,()=>loadProfileBanner(studio.id)))?.banner);
  assert((await as(0,()=>saveProfileBanner(null,studio.id))).ok);
  const [group]=await db.insert(schema.groups).values({ownerUserId:people[0].id,name:'Banner group',slug:'banner-group',inviteToken:'banner-test-invite',photo:'original-group-photo'}).returning();
  assert(!(await as(1,()=>saveProfileBanner(image,undefined,group.id))).ok,'Nonmember cannot edit group banner');
  await db.insert(schema.groupMembers).values({groupId:group.id,userId:people[1].id,role:'member'});
  assert(!(await as(1,()=>saveProfileBanner(image,undefined,group.id))).ok,'Ordinary member cannot edit group banner');
  assert((await as(0,()=>saveProfileBanner(image,undefined,group.id))).ok,'Owner can upload banner');
  assert((await as(0,()=>loadProfileBanner(undefined,group.id)))?.banner);
  await db.update(schema.groupMembers).set({role:'admin'}).where(eq(schema.groupMembers.groupId,group.id));
  assert((await as(1,()=>saveProfileBanner(null,undefined,group.id))).ok,'Group admin can remove banner');
  const [savedGroup]=await db.select().from(schema.groups).where(eq(schema.groups.id,group.id));
  assert.equal(savedGroup.bannerPhoto,null);assert.equal(savedGroup.photo,'original-group-photo');
  console.log('PASS banner ownership, studio permissions, invalid images, resizing, avatar preservation and removal');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
