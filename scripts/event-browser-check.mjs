import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {webkit, chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const fixture=execFileSync(process.execPath,['--import','tsx','scripts/event-fixtures.ts'],{env:{...process.env,DATABASE_URL:''},encoding:'utf8'}).trim().split('\n').at(-1);
const f=JSON.parse(fs.readFileSync(fixture,'utf8')),base='https://127.0.0.1:3196';
const log=fs.openSync(`${f.directory}/server.log`,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3195','-H','127.0.0.1'],{env:{...process.env,DATABASE_URL:'',PGLITE_DATA_DIR:f.dataDir,SESSION_SECRET:f.secret,ADMIN_EMAILS:'',ALLOW_EMBEDDED_DB_IN_PRODUCTION:'true',RESEND_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',INVITE_ONLY:'false',FANS_ENABLED:'true',NEXT_PUBLIC_ORIGIN:base},stdio:['ignore',log,log]});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',`${f.directory}/key.pem`,'-out',`${f.directory}/cert.pem`,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const proxy=https.createServer({key:fs.readFileSync(`${f.directory}/key.pem`),cert:fs.readFileSync(`${f.directory}/cert.pem`)},(req,res)=>{
  const upstream=http.request({hostname:'127.0.0.1',port:3195,path:req.url,method:req.method,headers:req.headers},response=>{
    const headers={...response.headers};if(headers.location && /^http:\/\/localhost:(3100|3195)\//.test(headers.location))headers.location=headers.location.replace(/^http:\/\/localhost:(3100|3195)/,base);
    res.writeHead(response.statusCode || 500,headers);response.pipe(res);
  });upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
});
await new Promise(resolve=>proxy.listen(3196,'127.0.0.1',resolve));
let browser;
try{
  for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error('Local event server could not start');try{if((await fetch('http://127.0.0.1:3195')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await (process.env.EVENT_BROWSER==='chromium' ? chromium : webkit).launch();
  const anon=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),page=await anon.newPage();
  await page.goto(`${base}/s/${f.slug}/register`);await page.locator('.app-launch').waitFor({state:'detached'});
  await page.getByRole('button').filter({hasText:'Morning Yoga'}).click();
  await page.getByLabel('Your name',{exact:true}).fill('Alex Rivera');await page.getByLabel('Email address',{exact:true}).fill('expo-browser-new@example.test');
  assert(await page.getByRole('button',{name:'Email my signup link'}).isVisible());
  assert.equal((await anon.request.get(`${base}/api/events/${f.slug}/export`)).status(),404);
  const denied=await anon.newPage();await denied.goto(`${base}/s/${f.slug}/manage/registrations`);await denied.waitForURL(base+'/');assert(!(await denied.locator('body').innerText()).includes('event-member@example.test'));await denied.close();
  assert((await anon.request.get(`${base}/api/events/${f.slug}/qr`)).ok());
  const disabledPage=await anon.newPage();await disabledPage.goto(base+'/s/pro-disabled/register');await disabledPage.getByRole('heading',{name:"That page isn’t here."}).waitFor();await disabledPage.close();
  for(const route of [`/api/events/pro-disabled/qr`,`/api/events/pro-disabled/export`]) assert.equal((await anon.request.get(base+route)).status(),404,'Unapproved space feature routes are unavailable');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.bringToFront();await page.evaluate(()=>document.fonts.ready);
  const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();assert.equal(a11y.violations.filter(v=>['serious','critical'].includes(v.impact)).length,0,JSON.stringify(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));
  await page.screenshot({path:`${f.directory}/phone-signup.png`,fullPage:true});
  // A different browser context represents the email app opening a fresh tab.
  const fresh=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},reducedMotion:'reduce'}),confirm=await fresh.newPage();
  await confirm.goto(`${base}/auth/magic?token=${f.magic}`);await confirm.locator('.app-launch').waitFor({state:'detached'});await confirm.getByRole('button',{name:'Continue securely'}).click();
  await confirm.getByRole('heading',{name:'You’re signed up'}).waitFor();
  assert.match(confirm.url(),new RegExp(`/s/${f.slug}/register`));
  await confirm.getByRole('button',{name:'Share that you’re going'}).click();await confirm.getByRole('heading',{name:'RSVP sent'}).waitFor();
  await confirm.goto(`${base}/s/${f.slug}/register?class=${f.classes[2].id}&d=${f.date}`);
  await confirm.getByRole('button',{name:'Join waitlist',exact:true}).click();await confirm.getByRole('heading',{name:'You’re on the waitlist'}).waitFor();
  await confirm.getByRole('button',{name:'Leave waitlist'}).click();await confirm.getByRole('button',{name:'Join waitlist',exact:true}).waitFor();
  await confirm.getByRole('button',{name:'Join waitlist',exact:true}).click();await confirm.getByRole('heading',{name:'You’re on the waitlist'}).waitFor();
  const memberCtx=await browser.newContext({ignoreHTTPSErrors:true});await memberCtx.addCookies([{name:'fl_session',value:f.member,url:base,httpOnly:true}]);const memberPage=await memberCtx.newPage();
  await memberPage.goto(`${base}/s/${f.slug}/register?class=${f.classes[2].id}&d=${f.date}`);await memberPage.getByText('Can’t make it?',{exact:true}).click();await memberPage.getByRole('button',{name:'Cancel registration'}).click();await memberPage.getByRole('button',{name:'Join waitlist',exact:true}).waitFor();await memberCtx.close();

  for(const viewport of [{width:820,height:1180},{width:1180,height:820}]){
    const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport,reducedMotion:'reduce'});await ctx.addCookies([{name:'fl_session',value:f.admin,url:base,httpOnly:true}]);const desk=await ctx.newPage();
    await desk.goto(`${base}/s/${f.slug}/manage/registrations`);await desk.locator('.app-launch').waitFor({state:'detached'});
    await desk.getByRole('heading',{name:'Attendees',exact:true}).waitFor();
    await desk.getByRole('combobox',{name:'Choose a signup QR',exact:true}).selectOption(f.classes[1].id);
    const signupLink=desk.getByRole('link',{name:'Open this signup page',exact:true});
    assert.equal(await signupLink.getAttribute('href'),`/s/${f.slug}/register?class=${f.classes[1].id}&d=${f.date}`);
    const classQr=desk.locator('.event-qr img').last();
    await classQr.evaluate(img=>img.decode());
    assert.match(await classQr.getAttribute('src'),new RegExp(`class=${f.classes[1].id}&d=${f.date}`));

    if(viewport.width===820) {
      await desk.getByRole('button',{name:'Confirm place',exact:true}).click();await desk.getByText('No one is waiting yet.',{exact:true}).waitFor();
      await confirm.reload();await confirm.getByRole('heading',{name:'You’re signed up'}).waitFor();

      await desk.locator('.event-walkup > summary').click();
      await desk.getByLabel('Attendee name',{exact:true}).fill('Walk Up');await desk.getByLabel('Attendee email',{exact:true}).fill('walkup@example.test');await desk.getByLabel('Choose a class',{exact:true}).selectOption(f.classes[1].id);await desk.getByRole('checkbox',{name:'The attendee has asked me to send this signup link to their email.'}).check();
      await desk.getByRole('button',{name:'Send attendee signup link'}).click();await desk.getByRole('status').filter({hasText:'couldn’t send'}).or(desk.getByRole('status').filter({hasText:"couldn't send"})).waitFor();
      assert.match(desk.url(),/manage\/registrations/,'A failed email request leaves the organizer signed in');
      await desk.locator('.event-walkup > summary').click();
    }
    await desk.bringToFront();
    await desk.getByLabel('Search attendees').fill('Jordan');
    await desk.getByRole('button',{name:'Check in',exact:true}).click();try{await desk.getByRole('button',{name:'Checked in · Undo'}).waitFor();}catch(error){console.log('Desk status:',await desk.getByRole('status').allTextContents());await desk.screenshot({path:`${f.directory}/desk-failure.png`,fullPage:true});throw error;}
    await desk.getByRole('button',{name:'Checked in · Undo'}).click();await desk.getByRole('button',{name:'Check in',exact:true}).waitFor();
    const response=await ctx.request.get(`${base}/api/events/${f.slug}/export`);assert(response.ok());assert.match(response.headers()['cache-control'],/no-store/);assert.match(await response.text(),/event-member@example.test/);
    assert(await desk.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert((await desk.locator('.event-roster article > div').first().boundingBox()).width>180,'Attendee details retain a readable width beside check-in');
    const result=await new AxeBuilder({page:desk}).withTags(['wcag2a','wcag2aa']).analyze();assert.equal(result.violations.filter(v=>['serious','critical'].includes(v.impact)).length,0,JSON.stringify(result.violations.map(v=>v.id)));
    await desk.screenshot({path:`${f.directory}/ipad-${viewport.width}.png`,fullPage:true});await ctx.close();
  }
  await fresh.close();
  console.log(`PASS waitlist join/leave and admin promotion, phone signup, fresh-browser email continuation, confirmed share, private export, QR, iPad portrait/landscape check-in and accessibility. Screenshots: ${f.directory}`);
}finally{await browser?.close();server.kill('SIGTERM');proxy.close();}
