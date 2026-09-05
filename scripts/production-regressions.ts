import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordProblem, DUMMY_PASSWORD_HASH } from "../src/lib/password";
import { motionDuration, resistedSheetDistance, sheetShouldDismiss } from "../src/lib/motion";
import { withTimeout } from "../src/lib/async";
import { publicImageAddress, safeServerImage } from "../src/lib/server-image";
import { storeImage } from "../src/lib/storage";
import { readClientMemory, loadClientMemory, setClientMemoryScope, invalidateClientMemory } from "../src/lib/client-memory";
import { authOrigin } from "../src/lib/auth-origin";

async function main() {
  const originEnv={NEXT_PUBLIC_ORIGIN:process.env.NEXT_PUBLIC_ORIGIN,VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_URL:process.env.VERCEL_URL};
  try {
    process.env.NEXT_PUBLIC_ORIGIN="https://fittlist.co";
    process.env.VERCEL_ENV="preview";
    process.env.VERCEL_URL="fittlist-experiment-test.vercel.app";
    assert.equal(authOrigin(),"https://fittlist-experiment-test.vercel.app");
    process.env.VERCEL_URL="fittlist.vercel.app.attacker.example";
    assert.equal(authOrigin(),"https://fittlist.co");
    process.env.VERCEL_ENV="production";
    process.env.VERCEL_URL="fittlist.vercel.app";
    assert.equal(authOrigin(),"https://fittlist.co");
  } finally {
    for(const [key,value] of Object.entries(originEnv)) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
  for (const address of ["127.0.0.1","10.2.3.4","169.254.169.254","100.64.0.1","172.16.0.1","192.168.1.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2002:7f00:1::"]) assert.equal(publicImageAddress(address),false,address);
  assert(publicImageAddress("8.8.8.8"));
  assert(publicImageAddress("2606:4700:4700::1111"));
  assert.equal(await safeServerImage("https://127.0.0.1/secret"),null);
  assert.equal(await safeServerImage("http://example.com/a.png"),null);
  assert.equal(await safeServerImage("data:image/svg+xml;base64,PHN2Zy8+"),null);
  const password="long test password";
  const hash=await hashPassword(password);
  assert(await verifyPassword(password,hash));
  assert.equal(await verifyPassword("wrong",hash),false);
  assert.equal(await verifyPassword(password,DUMMY_PASSWORD_HASH),false);
  assert(passwordProblem("x".repeat(1025)));
  assert.equal(await verifyPassword("x".repeat(1025),hash),false);
  assert.equal(sheetShouldDismiss(119,0),false);
  assert.equal(sheetShouldDismiss(120,0),true);
  assert.equal(sheetShouldDismiss(45,.8),true);
  assert.equal(sheetShouldDismiss(20,3),false);
  assert(resistedSheetDistance(240)<240);
  assert.equal(motionDuration("sheet"),220);
  assert.equal(await withTimeout(Promise.resolve(42),100),42);
  await assert.rejects(withTimeout(new Promise(()=>{}),5),/timed out/);
  await assert.rejects(storeImage("data:image/svg+xml;base64,PHN2Zy8+","u"));
  await assert.rejects(storeImage("data:image/png;base64,PHN2Zy8+","u"));
  await assert.rejects(storeImage("javascript:alert(1)","u"));
  await assert.rejects(storeImage("https://user:pass@example.test/image.png","u"));
  const realImage="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MCEAAAAASUVORK5CYII=";
  assert.equal(await storeImage(realImage,"u"),realImage);
  // A late private response must not repopulate the next viewer's cache.
  Object.assign(globalThis,{window:{}});
  setClientMemoryScope("account-a");
  let release!: (value: string) => void;
  const old=loadClientMemory("private",()=>new Promise<string>(resolve=>{release=resolve;}));
  await Promise.resolve();
  setClientMemoryScope("account-b");release("private-a");await old;
  assert.equal(readClientMemory("private"),null);
  let calls=0;
  const loader=()=>{calls++;return Promise.resolve("b");};
  await Promise.all([loadClientMemory("private",loader),loadClientMemory("private",loader)]);
  assert.equal(calls,1);
  invalidateClientMemory("private");assert.equal(readClientMemory("private"),null);
  await assert.rejects(loadClientMemory("retry",()=>withTimeout(new Promise(()=>{}),5)));
  assert.equal(await loadClientMemory("retry",()=>Promise.resolve("recovered")),"recovered");
  console.log("Production regressions passed: password limits, image validation, sheet thresholds, bounded reads, account-scoped cache and retry.");
}
void main();
