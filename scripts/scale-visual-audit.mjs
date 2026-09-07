import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const fixturePath=process.env.AUDIT_FIXTURES;
if(!fixturePath) throw new Error("Set AUDIT_FIXTURES to scale-audit-fixtures.ts output.");
const f=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
assert(f.dataDir.startsWith(f.directory+"/"),"Only the disposable fixture DB is allowed");
const mode=process.env.AUDIT_MODE||"all";
assert(["all","accessibility","scale","visual"].includes(mode));
const port=Number(process.env.AUDIT_PORT||3114),base=`http://localhost:${port}`;
const report={mode,fixture:f.counts,checks:[],errors:[],limits:["Synthetic PGlite fixture, not production PostgreSQL/network measurements.","Keyboard, DOM reflow and reduced-motion checks do not replace VoiceOver or physical-device Dynamic Type.","No production accounts, external messages, integrations, or uploads were used."]};
const reportSuffix=process.env.AUDIT_CHECK_FILTER?`-${process.env.AUDIT_CHECK_FILTER.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`:"";
const output=`${f.directory}/${mode}${reportSuffix}-report.json`;
const log=fs.openSync(`${f.directory}/${mode}-server.log`,"w");
// Reads an already-built .next without building or modifying it.
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port)],{env:{...process.env,DATABASE_URL:"",PGLITE_DATA_DIR:f.dataDir,ALLOW_EMBEDDED_DB_IN_PRODUCTION:"true",SESSION_SECRET:f.secret,ADMIN_EMAILS:"",BLOB_READ_WRITE_TOKEN:"",RESEND_API_KEY:"",INVITE_ONLY:"false",FANS_ENABLED:"true",NEXT_PUBLIC_ORIGIN:base},stdio:["ignore",log,log]});
let browser;
async function checked(name,fn) {
  if(process.env.AUDIT_CHECK_FILTER&&!name.includes(process.env.AUDIT_CHECK_FILTER))return;
  const started=performance.now();
  try {const detail=await fn();const status=detail?.violations?.length?"failed":"passed";report.checks.push({name,status,elapsedMs:Math.round(performance.now()-started),...detail});console.log(`${status==="passed"?"PASS":"FAIL"} ${name}`);}
  catch(error) {report.checks.push({name,status:"failed",message:String(error),elapsedMs:Math.round(performance.now()-started)});console.log(`FAIL ${name}: ${error.message}`);}
  fs.writeFileSync(output,JSON.stringify(report,null,2));
}
const signed=async()=>{const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});await context.addCookies([{name:"fl_session",value:f.viewer.token,url:base,httpOnly:true,sameSite:"Lax"}]);return context;};
const routes=["/scalecoach0","/scalecoach1","/scalecoach2","/s/scale-studio-0","/g/scale-group-0","/g/scale-group-1","/discover","/support","/privacy","/terms"];
async function settle(page) {await page.waitForTimeout(250);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function expandFollowing(page) {
  await page.goto(base+"/calendar/following");
  await page.getByRole("navigation",{name:"Calendar view",exact:true}).waitFor();
  // Returning to this route can intentionally restore its expanded state.
  const reveal=page.getByRole("button",{name:"Show Explore calendar",exact:true});
  if(await reveal.isVisible())await reveal.click();
}
async function dimensions(page) {return page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.images].filter(img=>img.getBoundingClientRect().width).map(img=>({className:img.className,width:Math.round(img.getBoundingClientRect().width),height:Math.round(img.getBoundingClientRect().height),fit:getComputedStyle(img).objectFit,broken:img.complete&&img.naturalWidth===0})),smallTargets:[...document.querySelectorAll("button,a[href],input,select,textarea")].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&(r.width<24||r.height<24);}).map(el=>({tag:el.tagName,label:(el.getAttribute("aria-label")||el.textContent||"").trim().slice(0,70),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)}))}));}
try {
  let ready=false;
  for(let i=0;i<90;i++){if(server.exitCode!==null) throw new Error("Audit server exited; inspect its local log");try{const r=await fetch(base);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert(ready,"Audit server ready");
  browser=await chromium.launch({channel:"chrome"});
  if(mode==="all"||mode==="accessibility") {
    const context=await signed(),page=await context.newPage();page.setDefaultTimeout(12000);
    for(const route of routes) await checked(`Accessibility ${route}`,async()=>{
      const response=await page.goto(base+route);assert(response.status()<400);
      if(route==="/discover")await page.locator(".discover-person-tile").first().waitFor();
      await settle(page);
      const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
      const violations=result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,12)}));
      report.errors.push(...violations.map(v=>({route,...v})));
      return {violations,ruleCount:result.passes.length,layout:await dimensions(page)};
    });
    for(const route of ["/discover","/g/scale-group-0","/s/scale-studio-0"])await checked(`Segmented keyboard navigation ${route}`,async()=>{
      await page.goto(base+route);const tabs=page.getByRole("tablist").first().getByRole("tab");
      await tabs.first().focus();await page.keyboard.press("ArrowRight");
      assert(await tabs.nth(1).evaluate(el=>el===document.activeElement),"Right arrow moves to the next tab");
      await page.keyboard.press("Home");assert(await tabs.first().evaluate(el=>el===document.activeElement),"Home moves to first tab");
      await page.keyboard.press("End");assert(await tabs.last().evaluate(el=>el===document.activeElement),"End moves to last tab");
      return {tabs:await tabs.count()};
    });
    await checked("Profile overflow keyboard and reduced motion",async()=>{
      await page.goto(base+"/scalecoach0");await page.getByRole("button",{name:"More profile actions",exact:true}).click();
      const dialog=page.getByRole("dialog",{name:"Profile actions",exact:true});await dialog.waitFor();
      for(let i=0;i<12;i++){await page.keyboard.press("Tab");assert(await dialog.evaluate(el=>el.contains(document.activeElement)),"Focus remains within dialog");}
      const animations=await dialog.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations===Infinity).length);
      await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
      const restored=await page.getByRole("button",{name:"More profile actions",exact:true}).evaluate(el=>el===document.activeElement);
      assert(restored,"Focus restored to trigger");return {infiniteAnimationsWithReducedMotion:animations};
    });
    await context.close();
    const anon=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"}),login=await anon.newPage();
    await checked("Signed-out welcome accessibility",async()=>{await login.goto(base);await settle(login);const result=await new AxeBuilder({page:login}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));report.errors.push(...violations.map(v=>({route:"/",...v})));return {violations};});
    await anon.close();
  }
  if(mode==="all"||mode==="scale") {
    const context=await signed(),page=await context.newPage();
    page.setDefaultTimeout(60000);
    await page.addInitScript(()=>{window.__scaleAudit={lcp:null,cls:0,longTasks:[]};new PerformanceObserver(list=>{for(const e of list.getEntries())window.__scaleAudit.lcp=e.startTime;}).observe({type:"largest-contentful-paint",buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__scaleAudit.cls+=e.value;}).observe({type:"layout-shift",buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())window.__scaleAudit.longTasks.push(Math.round(e.duration));}).observe({type:"longtask",buffered:true});});
    for(const route of ["/calendar/following","/discover","/s/scale-studio-0","/g/scale-group-0"])await checked(`Scale ${route}`,async()=>{
      const started=performance.now(),response=await page.goto(base+route);assert(response.status()<400);
      if(route==="/discover")await page.locator(".discover-person-tile").first().waitFor();
      else if(route==="/calendar/following")await page.getByRole("navigation",{name:"Calendar view",exact:true}).waitFor();
      const readyMs=Math.round(performance.now()-started);await settle(page);
      const metrics=await page.evaluate(()=>({readyNavigation:performance.getEntriesByType("navigation").map(n=>({ttfbMs:Math.round(n.responseStart),domReadyMs:Math.round(n.domContentLoadedEventEnd),transferBytes:n.transferSize,decodedBytes:n.decodedBodySize})),...window.__scaleAudit,domNodes:document.getElementsByTagName("*").length,heapBytes:performance.memory?.usedJSHeapSize}));
      return {readyMs,...metrics};
    });
    await checked("Expanded following calendar: long scrolling session",async()=>{
      await expandFollowing(page);
      await settle(page);const before=await page.evaluate(()=>({heap:performance.memory?.usedJSHeapSize,nodes:document.getElementsByTagName("*").length,renderedDays:document.querySelectorAll(".cash-day").length}));
      for(let i=0;i<12;i++){await page.mouse.wheel(0,1600);await page.waitForTimeout(100);}
      const after=await page.evaluate(()=>({heap:performance.memory?.usedJSHeapSize,nodes:document.getElementsByTagName("*").length,renderedDays:document.querySelectorAll(".cash-day").length,scrollY,documentHeight:document.documentElement.scrollHeight}));
      await page.screenshot({path:`${f.directory}/scale-following-scrolled.png`,animations:"disabled"});return {before,after};
    });
    await checked("Following incremental dates and month-date reachability",async()=>{
      await expandFollowing(page);
      const sentinel=page.locator(".cash-days-more");await sentinel.waitFor();
      const initial=await page.locator(".cash-day").count();
      await sentinel.scrollIntoViewIfNeeded();
      console.log("Reachability sentinel",JSON.stringify(await page.evaluate(()=>({days:document.querySelectorAll(".cash-day").length,top:document.querySelector(".cash-days-more")?.getBoundingClientRect().top,scrollY,height:innerHeight}))));
      await page.waitForFunction(n=>document.querySelectorAll(".cash-day").length>n,initial,{timeout:15000});
      const afterScroll=await page.locator(".cash-day").count();
      console.log(`Reachability appended ${initial}→${afterScroll} days`);
      const firstDate=await page.locator(".cash-day").first().getAttribute("id");
      const target=new Date(`${f.iso}T12:00:00Z`);target.setUTCDate(target.getUTCDate()+10);const iso=target.toISOString().slice(0,10);
      await page.getByRole("button",{name:"Switch to month view",exact:true}).click();
      await page.getByRole("button",{name:`Open ${iso}`,exact:true}).click();
      const targetDay=page.locator(`#feed-day-${iso}`);await targetDay.waitFor();
      console.log("Reachability month target",iso,JSON.stringify(await targetDay.boundingBox()));
      await page.waitForFunction(id=>{const el=document.getElementById(id);return !!el&&el.getBoundingClientRect().top<innerHeight&&el.getBoundingClientRect().bottom>0;},`feed-day-${iso}`,{timeout:15000});
      assert.equal(await page.locator(".cash-day").first().getAttribute("id"),firstDate,"Earlier dates remain available");
      return {initialDays:initial,afterScrollDays:afterScroll,monthSelectedDate:iso,selectedDateReached:true};
    });
    await context.close();
  }
  if(mode==="all"||mode==="visual") {
    const context=await signed(),page=await context.newPage();
    await checked("Route loading foreground and background pairings",async()=>{
      await page.goto(base+"/support");
      const samples=await page.evaluate(()=>{
        const host=document.createElement("div");host.style.position="fixed";host.style.inset="0";host.style.zIndex="99999";
        host.innerHTML='<div class="route-loading-dots"><span class="loading-dots"><span></span><span></span><span></span></span></div><div class="route-loading-dots route-loading-calendar"><span class="loading-dots"><span></span><span></span><span></span></span></div>';
        document.body.appendChild(host);
        const result=[...host.children].map(el=>({background:getComputedStyle(el).backgroundColor,foreground:getComputedStyle(el.querySelector(".loading-dots > span")).backgroundColor}));host.remove();return result;
      });
      assert.deepEqual(samples,[{background:"rgb(246, 246, 244)",foreground:"rgb(0, 0, 0)"},{background:"rgb(17, 31, 36)",foreground:"rgb(255, 255, 255)"}]);return {samples};
    });
    for(const width of [320,390,1440]) for(const route of ["/scalecoach0","/scalecoach1","/scalecoach2","/s/scale-studio-0","/g/scale-group-0","/g/scale-group-1"])await checked(`Visual ${width}px ${route}`,async()=>{
      await page.setViewportSize({width,height:900});await page.goto(base+route);await settle(page);
      if(route==="/scalecoach2")await page.locator(".avzoom-trigger .profav-empty").waitFor({timeout:12000});
      const layout=await dimensions(page);
      await page.screenshot({path:`${f.directory}/visual-${width}-${route.replaceAll("/","-")}.png`,animations:"disabled"});
      if(layout.overflow){const offenders=await page.evaluate(()=>[...document.querySelectorAll("body *")].map(el=>({tag:el.tagName,className:el.className,right:Math.round(el.getBoundingClientRect().right),left:Math.round(el.getBoundingClientRect().left)})).filter(el=>el.right>innerWidth+1||el.left< -1).slice(0,15));throw new Error(`Horizontal overflow ${layout.document}px > ${layout.viewport}px: ${JSON.stringify(offenders)}`);}
      if(route==="/scalecoach2")assert.equal(await page.locator(".avzoom-trigger .profav-empty").count(),1,"Failed profile photo shows an initial fallback");
      return {layout};
    });
    await checked("Failed group photo uses the same initial in its overlay",async()=>{
      await page.goto(base+"/g/scale-group-1");
      const trigger=page.locator(".profile-photo-zoom-trigger");
      await trigger.locator("img").evaluate(img=>{img.src="/audit-missing-photo.png";});
      await trigger.locator("span").waitFor();await trigger.click();
      await page.locator(".photo-viewer-placeholder").waitFor();
      assert.equal(await page.getByRole("link",{name:"Open photo",exact:true}).count(),0,"Broken original photo is not offered as a link");
      await page.getByRole("button",{name:"Close photo",exact:true}).click();
      return {initialFallback:true,overlayFallback:true};
    });
    for(const route of ["/scalecoach0","/s/scale-studio-0","/g/scale-group-0","/support"])await checked(`200% text reflow ${route}`,async()=>{
      await page.setViewportSize({width:390,height:844});await page.goto(base+route);await settle(page);
      // Double computed text sizes, preserving geometry: a stress test for
      // fixed pixel layouts. Browser/device OS text scaling remains manual.
      await page.evaluate(()=>{const sizes=[...document.querySelectorAll("body *")].filter(el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())).map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size] of sizes)el.style.fontSize=`${size*2}px`;});
      const layout=await dimensions(page);await page.screenshot({path:`${f.directory}/large-text-${route.replaceAll("/","-")}.png`,animations:"disabled"});
      assert(!layout.overflow,`200% text overflows viewport (${layout.document}px > ${layout.viewport}px)`);
      const collisions=await page.evaluate(()=>{
        const pills=[...document.querySelectorAll(".profile-action-cluster button,.profile-action-cluster a")].filter(el=>el.getBoundingClientRect().width>0);
        const overflowingPills=pills.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent.trim());
        const title=document.querySelector(".profile-person-calendar-list .clline-nm")?.getBoundingClientRect();
        const time=document.querySelector(".profile-person-calendar-list .clline-t")?.getBoundingClientRect();
        const controls=[...document.querySelectorAll(".profile-seam-top .profback,.profile-seam-top .ownertop")].map(el=>el.getBoundingClientRect());
        return {overflowingPills,timeOverlapsTitle:!!title&&!!time&&time.right>title.left+1,clippedNavigation:controls.some(r=>r.left<0||r.right>innerWidth)};
      });
      assert.deepEqual(collisions,{overflowingPills:[],timeOverlapsTitle:false,clippedNavigation:false});return {layout,collisions};
    });
    await context.close();
  }
} finally {
  if(browser)await browser.close();server.kill("SIGTERM");fs.closeSync(log);
  fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(`Sanitized audit report: ${output}`);
}
if(report.checks.some(c=>c.status==="failed")||report.errors.length)process.exitCode=1;
