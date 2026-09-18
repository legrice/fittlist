import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import {chromium} from 'playwright';
if(process.env.DATABASE_URL || process.env.VERCEL) throw new Error('Local audit only');
const path=execFileSync(process.execPath,['--import','tsx','scripts/audit-fixtures.ts'],{env:{...process.env,DATABASE_URL:''},encoding:'utf8'}).trim().split('\n').at(-1);
const fixture=JSON.parse(fs.readFileSync(path,'utf8'));
const base='http://localhost:3199';
const log=fs.openSync(`${fixture.directory}/beta-browser.log`,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3199'],{env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:fixture.dataDir,SESSION_SECRET:fixture.secret,ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true',ADMIN_EMAILS:fixture.owner.email,RESEND_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',CRON_SECRET:'',APNS_PRIVATE_KEY:'',APNS_KEY_ID:'',APNS_TEAM_ID:''},stdio:['ignore',log,log]});
let browser;
try {
 let ready=false;
 for(let i=0;i<90;i++){assert.equal(server.exitCode,null);try{if((await fetch(`${base}/api/native/push`)).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert(ready);
 browser=await chromium.launch({headless:true});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844}});
  await context.addCookies([{name:'fl_session',value:fixture.owner.token,url:base}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();
  assert.equal((await page.goto(`${base}/admin`)).status(),200);
  await page.getByRole('heading',{name:'Beta usage'}).waitFor();
  await page.getByLabel('Period').selectOption('28');
  await page.getByText('Active in 28 days',{exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'iPhone push health'}).click();
  assert(await page.getByRole('button',{name:'Send test to my iPhone'}).isDisabled());
  assert(await page.locator('.admin-beta').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Analytics fits viewport');
  await page.screenshot({path:`${fixture.directory}/beta-${width}.png`,fullPage:true});
  await page.goto(`${base}/notifications`);
  await page.getByRole('button',{name:'Messages',exact:true}).click();
  await page.getByRole('link',{name:'New message / all conversations'}).waitFor();
  await context.close();
 }
 const outsider=await browser.newContext();
 await outsider.addCookies([{name:'fl_session',value:fixture.outsider.token,url:base}]);
 const page=await outsider.newPage();
 assert.equal((await page.goto(`${base}/admin`)).status(),404,'Non-admin cannot see analytics');
 console.log(`PASS beta browser: mobile/desktop, period selector, push setup state, message tab, admin protection. Artifacts: ${fixture.directory}`);
} finally {await browser?.close();server.kill('SIGTERM');fs.closeSync(log);}
