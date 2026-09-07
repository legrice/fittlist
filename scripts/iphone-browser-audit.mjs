import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const fixturePath = execFileSync(process.execPath, ['--import','tsx','scripts/audit-fixtures.ts'], {env:{...process.env,DATABASE_URL:''},encoding:'utf8'}).trim().split('\n').at(-1);
const f=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const base='http://localhost:3193', report={checks:[],failures:[],limitations:['WebKit viewport tests do not substitute for physical iPhone keyboard, haptics, native sharing, or VoiceOver.']};
const log=fs.openSync(`${f.directory}/iphone-server.log`,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3193'],{env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:f.dataDir,SESSION_SECRET:f.secret,ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true',RESEND_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',INVITE_ONLY:'false',FANS_ENABLED:'true',NEXT_PUBLIC_ORIGIN:base},stdio:['ignore',log,log]});
let browser;
async function check(name,fn){if(process.env.IPHONE_CHECK_FILTER&&!name.includes(process.env.IPHONE_CHECK_FILTER))return;try{await fn();report.checks.push(name);console.log(`PASS ${name}`);}catch(e){report.failures.push({name,message:e.message});console.log(`FAIL ${name}: ${e.message}`);}}
try {
  for(let i=0;i<90;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await webkit.launch();
  for(const viewport of [{width:375,height:667},{width:393,height:852},{width:440,height:956}]) {
    const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.addCookies([{name:'fl_session',value:f.owner.token,url:base,httpOnly:true,sameSite:'Lax'}]);
    // The native document marker is present before CSS paints in WKWebView.
    await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.native='ios';}));
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const path of ['/calendar','/calendar/following','/discover','/search','/auditcoach','/auditmember','/s/audit-studio','/s/audit-studio/manage','/s/audit-studio/manage/calendar','/s/audit-studio/manage/staff','/g/audit-group','/settings','/inbox','/notifications','/saved','/followers','/following','/coachshare','/support','/privacy','/terms']) {
      await check(`${viewport.width}px ${path}`,async()=>{
        const response=await page.goto(base+path);assert(response.status()<400,'Route loads');
        await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
        assert((await page.locator('body').innerText()) || await page.locator('input:visible').count(),'Screen has text or a visible search field');
        if(path==='/inbox')assert(await page.locator('.brandbar').isVisible(),'Native header navigation remains visible');
        if(path==='/settings')await page.getByRole('button',{name:'Back to profile',exact:true}).waitFor();
        if(path==='/discover')await page.getByRole('button',{name:'Back to calendar',exact:true}).waitFor();
        if(['/calendar','/auditcoach','/settings','/coachshare'].includes(path))await page.screenshot({path:`${f.directory}/iphone-${viewport.width}-${path.slice(1)}.png`});
      });
    }
    await check(`${viewport.width}px dialogs and accessibility`,async()=>{
      await page.goto(base+'/auditcoach');
      await page.getByRole('button',{name:'More profile actions',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Profile actions',exact:true});await dialog.waitFor();
      const rect=await dialog.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=viewport.width+1&&rect.y>=0&&rect.y+rect.height<=viewport.height+1,'Sheet fits iPhone');
      const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.equal(results.violations.filter(v=>['serious','critical'].includes(v.impact)).length,0,JSON.stringify(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    });
    await check(`${viewport.width}px uncaught errors`,async()=>assert.deepEqual(errors,[]));
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();
  await check('Login labels, keyboard actions and invalid credentials',async()=>{
    await page.goto(base+'/?join=login');
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('absent@example.test');
    await page.getByRole('textbox',{name:'Email address',exact:true}).press('Enter');
    assert(await page.getByLabel('Password',{exact:true}).evaluate(el=>el===document.activeElement));
    await page.getByLabel('Password',{exact:true}).fill('intentionally-invalid');
    await page.getByLabel('Password',{exact:true}).press('Enter');
    await page.getByRole('alert').filter({hasText:'Wrong email or password'}).waitFor();
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.equal(results.violations.filter(v=>['serious','critical'].includes(v.impact)).length,0,JSON.stringify(results.violations.map(v=>v.id)));
  });
  await check('Native session: anonymous, current and malformed token',async()=>{
    assert.equal((await context.request.get(base+'/api/native/session')).status(),401);
    await context.addCookies([{name:'fl_session',value:f.owner.token,url:base,httpOnly:true}]);
    const response=await context.request.get(base+'/api/native/session');assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/no-store/);
    await context.addCookies([{name:'fl_session',value:'invalid',url:base,httpOnly:true}]);assert.equal((await context.request.get(base+'/api/native/session')).status(),401);
  });
  await check('Share preload read is private and rejects expired authentication',async()=>{
    assert.equal((await context.request.get(base+'/api/calendar/share-data')).status(),401);
    await context.addCookies([{name:'fl_session',value:f.owner.token,url:base,httpOnly:true}]);
    const result=await context.request.get(base+'/api/calendar/share-data');assert.equal(result.status(),200);assert.match(result.headers()['cache-control'],/private, no-store/);
  });
  await check('Stalled calendar client navigation recovers without duplicate history',async()=>{
    await context.addCookies([{name:'fl_session',value:f.owner.token,url:base,httpOnly:true}]);
    const held=[];
    const documents=[];
    let commits=0;
    const recordCommit=frame=>{if(frame===page.mainFrame() && new URL(frame.url()).pathname==='/calendar/following')commits++;};
    page.on('framenavigated',recordCommit);
    const started=Date.now();
    await page.route('**/calendar/following**',route=>{
      if(route.request().method()==='GET' && route.request().headers().rsc==='1') { held.push(route); return new Promise(()=>{}); }
      if(route.request().isNavigationRequest())documents.push({path:new URL(route.request().url()).pathname,type:route.request().resourceType(),elapsed:Date.now()-started});
      return route.continue();
    });
    await page.goto(base+'/calendar');
    await page.getByRole('link',{name:'Explore',exact:true}).first().click();
    await page.waitForURL('**/calendar/following',{timeout:14000,waitUntil:'domcontentloaded'});
    assert(held.length>0,'A real client calendar request was held');
    // Aborting the held RSC fetch can cause Next to attempt its own MPA
    // fallback as WebKit replaces the outgoing document. Count committed
    // destinations/history, not the cancelled network attempt.
    assert(documents.length>=1 && documents.length<=2,`Bounded document recovery: ${JSON.stringify(documents)}`);
    assert.equal(commits,1,'Recovery commits exactly one destination');
    page.off('framenavigated',recordCommit);
    for(const route of held)await route.abort().catch(()=>{});
    await page.unroute('**/calendar/following**');
    await page.goBack();await page.getByRole('navigation',{name:'Calendar view',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/calendar');
  });
  await check('Failed settings read is retryable and remains dismissible',async()=>{
    const manifest=JSON.parse(fs.readFileSync('.next/server/server-reference-manifest.json','utf8'));
    const settingsId=Object.entries(manifest.node).find(([,action])=>action.exportedName==='settingsSheetData')?.[0];
    assert(settingsId);
    let failed=false;
    await page.route('**/calendar',route=>{
      if(!failed && route.request().headers()['next-action']===settingsId){failed=true;return route.abort();}
      return route.continue();
    });
    await page.goto(base+'/calendar');
    await page.getByRole('button',{name:/Calendar & sync/}).click();
    await page.getByRole('alert').filter({hasText:'Couldn’t load settings'}).waitFor();
    assert(failed,'The settings transport actually failed');
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Couldn’t load settings'}).waitFor({state:'hidden'});
    await page.getByRole('heading',{name:'Calendar & sync',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('heading',{name:'Calendar & sync',exact:true}).waitFor({state:'hidden'});
    await page.unroute('**/calendar');
  });
  await check('Rapid Back taps return once and do not queue a second pop',async()=>{
    await page.goto(base+'/calendar');
    await page.getByRole('navigation',{name:'Calendar view',exact:true}).waitFor();
    await page.goto(base+'/discover');
    const back=page.getByRole('button',{name:'Back to calendar',exact:true});await back.waitFor();
    await back.evaluate(button=>{button.click();button.click();});
    await page.waitForURL('**/calendar');
    await page.getByRole('navigation',{name:'Calendar view',exact:true}).waitFor();
    await page.waitForTimeout(2300);
    assert.equal(new URL(page.url()).pathname,'/calendar');
  });
  await page.goto('about:blank');
  await context.clearCookies();
  await check('Browser calendar setup preserves login destination',async()=>{
    await page.goto(base+'/connect/google');assert(new URL(page.url()).searchParams.get('next')==='/connect/google');
  });
  await context.close();
} finally {
  await browser?.close();server.kill('SIGTERM');fs.closeSync(log);
  fs.writeFileSync(`${f.directory}/iphone-report.json`,JSON.stringify(report,null,2));
  console.log(`iPhone audit: ${report.checks.length} passed, ${report.failures.length} failed. Artifacts: ${f.directory}`);
}
if(report.failures.length)process.exitCode=1;
