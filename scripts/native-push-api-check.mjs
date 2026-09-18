import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
const path=execFileSync(process.execPath,['--import','tsx','scripts/audit-fixtures.ts'],{env:{...process.env,DATABASE_URL:''},encoding:'utf8'}).trim().split('\n').at(-1);
const fixture=JSON.parse(fs.readFileSync(path,'utf8'));
const base='http://localhost:3198';
const log=fs.openSync(`${fixture.directory}/push-api.log`,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3198'],{env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:fixture.dataDir,SESSION_SECRET:fixture.secret,ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true',ADMIN_EMAILS:fixture.owner.email,APNS_KEY_ID:'test',APNS_TEAM_ID:'test',APNS_PRIVATE_KEY:'test',CRON_SECRET:'test-cron',RESEND_API_KEY:'',BLOB_READ_WRITE_TOKEN:''},stdio:['ignore',log,log]});
const device=randomUUID(), deviceToken='a'.repeat(64), prefs={follows:true,messages:true,adminActivity:false};
const read=(who,id=device)=>fetch(`${base}/api/native/push?device=${id}`,{headers:who?{cookie:`fl_session=${who.token}`}:{}});
const save=(who,input,origin=base)=>fetch(`${base}/api/native/push`,{method:'POST',headers:{origin,'content-type':'application/json',...(who?{cookie:`fl_session=${who.token}`}:{})},body:JSON.stringify(input)});
try {
 let ready=false;
 for(let i=0;i<90;i++) {assert.equal(server.exitCode,null);try{if((await read()).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert(ready,'Server starts');
 assert.equal((await save(null,{id:device,enabled:true})).status,401);
 assert.equal((await save(fixture.member,{id:device,enabled:true},'https://evil.test')).status,403);
 assert.equal((await save(fixture.member,{id:'invalid',enabled:false})).status,400);
 assert.equal((await save(fixture.member,{id:device,enabled:true,token:'invalid',preferences:prefs})).status,400);
 assert.equal((await save(fixture.member,{id:device,enabled:true,token:deviceToken,preferences:{...prefs,adminActivity:true}})).status,403);
 assert.equal((await save(fixture.member,{id:device,enabled:true,token:deviceToken,preferences:prefs})).status,200);
 let state=await (await read(fixture.member)).json();assert.equal(state.enabled,true);assert.equal(state.admin,false);assert(!JSON.stringify(state).includes(deviceToken));
 assert.equal((await (await read(fixture.outsider)).json()).enabled,false);
 await save(fixture.outsider,{id:device,enabled:false});assert.equal((await (await read(fixture.member)).json()).enabled,true);
 await save(fixture.member,{id:device,enabled:true,token:deviceToken,preferences:{...prefs,messages:false,updates:false}});
 await save(fixture.member,{id:device,enabled:true,token:deviceToken,refresh:true,preferences:prefs});
 assert.equal((await (await read(fixture.member)).json()).preferences.messages,false,'Refresh preserves preferences');
 assert.equal((await (await read(fixture.member)).json()).preferences.updates,false,'Old clients and refresh preserve update opt-out');
 const usage=(who,input,origin=base)=>fetch(`${base}/api/usage`,{method:'POST',headers:{origin,'content-type':'application/json',...(who?{cookie:`fl_session=${who.token}`}:{})},body:JSON.stringify(input)});
 assert.equal((await usage(null,{kind:'app_active'})).status,401);
 assert.equal((await usage(fixture.member,{kind:'app_active'},'https://evil.test')).status,403);
 assert.equal((await usage(fixture.member,{kind:'arbitrary_content'})).status,400);
 assert.equal((await usage(fixture.member,{kind:'class_viewed',classId:'private-content'})).status,400);
 assert.equal((await usage(fixture.member,{kind:'app_active'})).status,204);
 assert.equal((await usage(fixture.member,{kind:'app_active'})).status,204);
 // The same physical device changes account; it must have one owner.
 await save(fixture.owner,{id:device,enabled:true,token:deviceToken,preferences:{...prefs,adminActivity:true}});
 assert.equal((await (await read(fixture.member)).json()).enabled,false);
 assert.equal((await (await read(fixture.owner)).json()).preferences.adminActivity,true);
 assert.equal((await save(fixture.member,{id:device,enabled:true,token:deviceToken,refresh:true})).status,409);
 await save(fixture.owner,{id:device,enabled:false});assert.equal((await (await read(fixture.owner)).json()).enabled,false);
 assert.equal((await fetch(`${base}/api/cron/push`)).status,401);
 assert.equal((await fetch(`${base}/api/cron/push`,{headers:{authorization:'Bearer test-cron'}})).status,200);
 console.log('PASS native push API: authentication, origin, validation, admin scope, device ownership, preferences, token refresh, opt-out, cron authentication');
} finally {server.kill('SIGTERM');fs.closeSync(log);}
