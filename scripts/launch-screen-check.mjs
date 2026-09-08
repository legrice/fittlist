import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { webkit } from 'playwright';
const path = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/audit-fixtures.ts'], { env: {...process.env, DATABASE_URL:''}, encoding:'utf8' }).trim().split('\n').at(-1);
const f = JSON.parse(fs.readFileSync(path,'utf8')), base='http://localhost:3194';
const log=fs.openSync(`${f.directory}/launch-server.log`,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3194'],{env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:f.dataDir,SESSION_SECRET:f.secret,ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true',RESEND_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',NEXT_PUBLIC_ORIGIN:base},stdio:['ignore',log,log]});
let browser;
try {
  for(let i=0;i<90;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await webkit.launch();
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  let release; const gate=new Promise(r=>{release=r;});
  await page.route('**/*.js*',async route=>{await gate;await route.continue().catch(()=>{});});
  await page.goto(base,{waitUntil:'commit'});
  await page.locator('.app-launch-mark svg').waitFor();
  assert.equal(await page.locator('.app-launch').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 33, 38)');
  assert.equal(await page.locator('.app-launch-mark').evaluate(el=>getComputedStyle(el).animationName),'none');
  release(); await page.locator('.app-launch').waitFor({state:'detached',timeout:20000});
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  assert.equal(await page.locator('.app-launch').count(),0);
  await context.close();
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const plain=await nojs.newPage();await plain.goto(base);
  assert.equal(await plain.locator('.app-launch').isVisible(),false);
  await nojs.close();
  console.log('PASS mobile launch before hydration, readiness dismissal, reduced motion, no repeat, and JavaScript-disabled escape');
} finally {await browser?.close();server.kill('SIGTERM');}
