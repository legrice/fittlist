// What happens to a Going mark when the coach changes their mind.
//
// Three things that all live on the same code path: an edit must keep the
// marks, a delete must be possible at all (a mark points at the class row, so
// the delete used to fail on the foreign key), and whoever was coming has to
// be told. Plus the two things built alongside it: the week as pasteable text,
// and a member's own calendar feed.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/going-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("GOING FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const c1 = await b.newContext({ viewport: { width: 390, height: 844 } });
const co = await c1.newPage();
co.setDefaultTimeout(15000);
await co.goto(BASE + "/");
await co.getByRole("button", { name: "Sign up with email" }).click();
await co.getByPlaceholder("you@example.com").fill("coach@example.com");
await co.getByPlaceholder("Password").fill("coach-pass-123");
await co.getByRole("button", { name: "Create account" }).click();
await co.getByRole("button", { name: "Not now" }).click().catch(() => {});
await co.getByText("Pick your link.").waitFor();
await co.getByPlaceholder("Your name").fill("Carina");
await co.getByRole("button", { name: "Claim it" }).click();
await skipSetup(co);
await co.getByRole("button", { name: "Add your first class" }).click();
await co.getByPlaceholder("e.g. Barbell Strength").fill("HYROX");
for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
  await co.getByRole("button", { name: d, exact: true }).click();
}
await co.getByRole("button", { name: "Select or start typing a studio" }).click();
await co.getByRole("button", { name: "+ New studio" }).click();
await co.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound");
await co.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Way, Newark NJ");
await co.getByRole("button", { name: "Add studio" }).click();
await co.locator(".publishwrap .btn").click();
await co.waitForTimeout(900);

// a member follows and marks Going
const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const m = await c2.newPage();
m.setDefaultTimeout(15000);
await m.goto(BASE + "/");
await m.getByRole("button", { name: "Sign up with email" }).click();
await m.locator(".roleseg button", { hasText: "here to train" }).click();
await m.getByPlaceholder("you@example.com").fill("sarah@example.com");
await m.getByPlaceholder("Password").fill("member-pass-123");
await m.getByRole("button", { name: "Create account" }).click();
await m.getByRole("button", { name: "Not now" }).click().catch(() => {});
await m.getByText("Pick your link.").waitFor();
await m.getByPlaceholder("Your name").fill("Sarah");
await m.getByRole("button", { name: "Claim it" }).click();
await m.getByRole("heading", { name: "Add a photo." }).waitFor();
await m.getByRole("button", { name: "Continue" }).click();
await m.locator("#wLocation").fill("Jersey City, NJ");
await m.getByRole("button", { name: "Finish setup" }).click();
await m.waitForURL("**/feed");
await m.goto(BASE + "/carina");
await m.locator(".profacts .followpill").waitFor();
await m.waitForTimeout(500);
await m.locator(".profacts .followpill").click();
await m.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await m.goto(BASE + "/feed");
await m.locator(".feeditem, .ps-event").first().waitFor();
{
  const row = m.locator(".feedagenda .swiperow").first();
  await row.locator(".ps-event").waitFor();
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await m.mouse.move(from, y);
  await m.mouse.down();
  for (const step of [35, 70, 100, 120]) await m.mouse.move(from - step, y, { steps: 3 });
  await m.mouse.up();
  await row.locator(".ps-event.goingon").waitFor();
  console.log("member marked going");
}

// FIRST: the coach edits the class. The marks must survive that, and the edit
// must not fail on a foreign key.
await co.goto(BASE + "/app");
await co.locator(".ps-event").first().click();
await co.getByRole("heading", { name: /Edit class/ }).waitFor();
await co.locator("#fDesc").fill("Bring a mat.");
await co.locator(".publishwrap .btn").click();
await co.getByText("Saved", { exact: true }).waitFor();
await co.waitForTimeout(1200);
await m.goto(BASE + "/feed");
await m.waitForTimeout(900);
const stillGoing = await m.locator(".ps-event.goingon").count();
if (stillGoing !== 1) fail(`editing the class dropped the Going mark (${stillGoing} left)`);
console.log("an edit keeps the Going marks ok");

// --- the room introduces itself early. Ruth and Sarah agree to each other
// (mutual follows), Ruth marks the same occurrence, and three things follow:
// Sarah is told Ruth is going too, Ruth sees Sarah on the sheet, and a
// stranger who hasn't committed sees no list at all.
const c3 = await b.newContext({ viewport: { width: 390, height: 844 } });
const r = await c3.newPage();
r.setDefaultTimeout(15000);
await r.goto(BASE + "/");
await r.getByRole("button", { name: "Sign up with email" }).click();
await r.locator(".roleseg button", { hasText: "here to train" }).click();
await r.getByPlaceholder("you@example.com").fill("ruth@example.com");
await r.getByPlaceholder("Password").fill("member-pass-123");
await r.getByRole("button", { name: "Create account" }).click();
await r.getByRole("button", { name: "Not now" }).click().catch(() => {});
await r.getByText("Pick your link.").waitFor();
await r.getByPlaceholder("Your name").fill("Ruth");
await r.getByRole("button", { name: "Claim it" }).click();
await r.getByRole("heading", { name: "Add a photo." }).waitFor();
await r.getByRole("button", { name: "Continue" }).click();
await r.locator("#wLocation").fill("Jersey City, NJ");
await r.getByRole("button", { name: "Finish setup" }).click();
await r.waitForURL("**/feed");
// the agreement, both directions
await r.goto(BASE + "/sarah");
await r.locator(".profacts .followpill").waitFor();
await r.waitForTimeout(400);
await r.locator(".profacts .followpill").click();
await r.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await m.goto(BASE + "/ruth");
await m.locator(".profacts .followpill").waitFor();
await m.waitForTimeout(400);
await m.locator(".profacts .followpill").click();
await m.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
// Ruth follows Carina too and marks the same occurrence Sarah did: the
// feed's first row, which is the next one that hasn't run yet.
await r.goto(BASE + "/carina");
await r.locator(".profacts .followpill").waitFor();
await r.waitForTimeout(400);
await r.locator(".profacts .followpill").click();
await r.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await r.goto(BASE + "/feed");
await r.locator(".feedagenda .ps-event").first().click();
await r.locator(".ovcta-save").waitFor();
await r.locator(".ovcta-save").click();
// The note answers the heart: the favorites toast, with the door to the
// list it joined. No second screen.
await r.getByText("Added to your favorites").waitFor();
await r.locator(".ovcta-save.on").waitFor();
// the word leaves with the tap: just the filled heart now
if ((await r.locator(".ovcta-save").innerText()).trim()) fail("the saved heart should drop the word");
// reopening the overlay brings the room with it
await r.locator(".ovcircle-back").click();
await r.waitForTimeout(400);
await r.locator(".feedagenda .ps-event").first().click();
await r.getByText(/Also saved · 1/).waitFor();
await r.locator(".classsheet-roster", { hasText: "Sarah" }).waitFor();
await r.locator(".ovcircle-back").click();
console.log("fellow goer sees the room ok (Sarah on Ruth's sheet)");

// Ruth brings two friends who aren't on the app. Names, not accounts, and
// they show exactly where the roster shows: Sarah's sheet and the coach's
// roster, nowhere public.
await r.locator(".feedagenda .ps-event").first().click();
await r.locator(".withbtn", { hasText: "Bringing anyone" }).click();
await r.locator("#withNames").fill("Joanne, Dave");
await r.locator(".withsave").click();
await r.locator(".withbtn", { hasText: "With Joanne and Dave" }).waitFor();
await r.locator(".ovcircle-back").click();
await m.goto(BASE + "/feed");
await m.locator(".feedagenda .ps-event").first().click();
await m.locator(".rosterrow", { hasText: "Ruth" }).getByText("with Joanne and Dave").waitFor();
await m.locator(".ovcircle-back").click();
await co.goto(BASE + "/app");
await co.locator(".ps-event[data-cid]").first().click();
await co.getByRole("heading", { name: /Edit class/ }).waitFor();
await co.locator(".sheetclose").click().catch(() => {});
console.log("companions ok (named friends ride the roster, no accounts needed)");
// Sarah hears about it twice over: the automatic fellow-goer notice, and
// the ask Ruth sent on purpose.
await m.goto(BASE + "/updates");
await m.getByText("Ruth is going too").waitFor();
console.log("going-too ok (mutuals only, same occurrence)");
// a stranger who hasn't committed sees no list
const c4 = await b.newContext({ viewport: { width: 390, height: 844 } });
const n = await c4.newPage();
n.setDefaultTimeout(15000);
await n.goto(BASE + "/");
await n.getByRole("button", { name: "Sign up with email" }).click();
await n.locator(".roleseg button", { hasText: "here to train" }).click();
await n.getByPlaceholder("you@example.com").fill("nora@example.com");
await n.getByPlaceholder("Password").fill("member-pass-123");
await n.getByRole("button", { name: "Create account" }).click();
await n.getByRole("button", { name: "Not now" }).click().catch(() => {});
await n.getByText("Pick your link.").waitFor();
await n.getByPlaceholder("Your name").fill("Nora");
await n.getByRole("button", { name: "Claim it" }).click();
await n.getByRole("heading", { name: "Add a photo." }).waitFor();
await n.getByRole("button", { name: "Continue" }).click();
await n.locator("#wLocation").fill("Jersey City, NJ");
await n.getByRole("button", { name: "Finish setup" }).click();
await n.waitForURL("**/feed");
await n.goto(BASE + "/carina");
await n.locator(".profacts .followpill").waitFor();
await n.waitForTimeout(400);
await n.locator(".profacts .followpill").click();
await n.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await n.goto(BASE + "/feed");
await n.locator(".feedagenda .ps-event").first().click();
await n.locator(".ovcta-save").waitFor();
if (await n.getByText(/Also saved/).count())
  fail("someone who hasn't committed should see no roster");
await n.locator(".ovcircle-back").click();
console.log("no lurking ok (the price of the list is being on it)");

// --- Going on an event: the poster sees the room, a fellow goer sees the
// others, and the marker's mutuals hear about it without needing to be going.
await co.goto(BASE + "/discover");
await co.locator(".disseg button", { hasText: "Events" }).click();
await co.locator(".evpost").click();
await co.getByRole("heading", { name: "Post an event" }).waitFor();
const evDate = new Date();
evDate.setUTCDate(evDate.getUTCDate() + 5);
await co.locator("#evName").fill("Harbor Throwdown");
await co.locator("#evStart").fill(evDate.toISOString().slice(0, 10));
await co.locator("#evPlace").fill("Harborside, Jersey City");
await co.getByRole("button", { name: "Post event" }).click();
await co.getByText("Event posted").waitFor();
// Tapping the poster opens the overlay now; the href stays real for the
// page a link opens, which is what the rest of this block drives.
const evPath = await co.locator(".disposter", { hasText: "Harbor Throwdown" }).getAttribute("href");
if (!/^\/e\//.test(evPath ?? "")) fail("an event poster should link at its page: " + evPath);
const evUrl = BASE + evPath;
// Sarah goes; her mutual Ruth hears even though Ruth isn't going yet
await m.goto(evUrl);
await m.getByRole("button", { name: "I'm going" }).click();
await m.locator(".ovcta-save.on").waitFor();
// first one in: the empty room offers the share
await m.locator(".emptyroom-btn", { hasText: "Share with friends" }).waitFor();
await r.goto(BASE + "/updates");
await r.getByText("Sarah is going to Harbor Throwdown").waitFor();
console.log("event going-notification ok (mutual told, without being marked)");
// Ruth goes too and sees Sarah; the poster sees the pair
await r.goto(evUrl);
await r.getByRole("button", { name: "I'm going" }).click();
await r.locator(".ovcta-save.on").waitFor();
await r.getByText(/Also going · 1/).waitFor();
await r.locator(".evwho", { hasText: "Sarah" }).waitFor();
await co.goto(evUrl);
await co.getByText(/Going · 2/).waitFor();
console.log("event room ok (goers see each other, the poster sees the list)");

// --- copy week as text, from Share on their own page
await co.goto(BASE + "/carina");
await co.locator(".profacts .actpill").first().waitFor();
await c1.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await co.locator(".profacts .actpill", { hasText: "Share" }).click();
await co.getByRole("button", { name: "Copy your week" }).click();
await co.getByText("Week copied", { exact: false }).waitFor();
const pasted = await co.evaluate(() => navigator.clipboard.readText());
if (!/HYROX/.test(pasted)) fail("the copied week has no classes in it");
if (!/6:00am/.test(pasted)) fail(`the copied week has no times: ${pasted.slice(0, 120)}`);
if (!/Ironbound/.test(pasted)) fail("the copied week doesn't say where");
if (!pasted.includes("fittlist.co/carina")) fail("the copied week drops the link");
console.log("week copies as text ok");

// --- the member's calendar feed is hidden for now (the subscribe flow needs
// work), so settings must NOT offer it; the endpoint stays for old links.
await m.goto(BASE + "/you");
await m.waitForTimeout(700);
await m.getByRole("button", { name: "Not right now" }).click().catch(() => {});
if (await m.getByText("Add classes to your calendar").count())
  fail("the calendar feed row should be hidden");
console.log("calendar feed door hidden ok");

// The token is the key, so a wrong one gets nothing.
const bad = await m.request.get(BASE + "/api/cal/me/not-a-real-token");
if (bad.status() !== 404) fail(`a bad calendar token returned ${bad.status()}, not 404`);
console.log("a bad calendar token gets nothing ok");

// coach deletes the whole class
await co.goto(BASE + "/app");
await co.locator(".ps-event").first().click();
await co.getByRole("heading", { name: /Edit class/ }).waitFor();
await co.getByRole("button", { name: "Delete this class" }).click();
await co.getByRole("dialog").waitFor();
const all = co.getByRole("button", { name: /All \d+ days it runs/ }).first();
if (await all.count()) await all.click();
else await co.getByRole("button", { name: /Every /}).first().click();
await co.waitForTimeout(1500);
await co.goto(BASE + "/app");
await co.waitForTimeout(800);
const left = await co.locator(".ps-event").count();
// This is the bug: a Going mark references the class row, so the delete used
// to fail on the foreign key and the class simply stayed.
if (left !== 0) fail(`deleting a class someone marked Going left ${left} of it behind`);
console.log("a class with Going marks can be deleted ok");

// and the member hears about it
await m.goto(BASE + "/updates");
await m.waitForTimeout(900);
const notifs = (await m.locator(".notifrow").allInnerTexts()).join(" | ");
if (!/cancelled HYROX/.test(notifs))
  fail(`nobody told the member their class was cancelled: ${notifs}`);
if (!/in your week/.test(notifs)) fail("the cancellation doesn't say why they got it");
console.log("the member is told their class was cancelled ok");
await b.close();
console.log("GOING CHECKS PASSED");
