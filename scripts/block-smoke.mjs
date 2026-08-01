// Removing someone, quietly. And a class you've missed.
//
// Blocking has one rule that every surface has to keep: the person who was
// removed is never told. Their follow goes, the page 404s, Discover stops
// listing the coach, the merged week loses their classes, and every action
// they could still POST answers the same way a page that isn't there would.
// The only screen where a block is visible at all is the blocker's own list.
//
// The second half is smaller: a class whose end time has gone by can't be
// added, and says so instead of showing a button that fails.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/block-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => {
  throw new Error("BLOCK FAIL: " + m);
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// --- a coach with a class on every day of the week
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

// --- a member who follows them
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
console.log("member follows the coach ok");

// --- the member adds a class, so the block has something to clean up
await m.goto(BASE + "/feed");
await m.locator(".feedagenda .swiperow").first().waitFor();
{
  const row = m.locator(".feedagenda .swiperow").first();
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await m.mouse.move(from, y);
  await m.mouse.down();
  for (const step of [35, 70, 100, 120]) await m.mouse.move(from - step, y, { steps: 3 });
  await m.mouse.up();
  await row.locator(".ps-event.goingon").waitFor();
}
console.log("member added a class ok");

// --- BEFORE: Discover lists the coach, the page loads
await m.goto(BASE + "/discover");
await m.locator(".disrow").first().waitFor();
if (!(await m.locator(".disrow", { hasText: "Carina" }).count()))
  fail("Discover doesn't list the coach before the block, so the after isn't a test");

// --- the coach removes them from their followers list
await co.goto(BASE + "/followers");
await co.locator(".disrow", { hasText: "Sarah" }).waitFor();
await co.locator(".disrow", { hasText: "Sarah" }).locator(".disblock").click();
await co.locator(".confirmsheet").waitFor();
await co.getByRole("button", { name: "Remove them" }).click();
await co.waitForTimeout(1200);
{
  const left = await co.locator(".disrow", { hasText: "Sarah" }).count();
  if (left !== 0) fail("the removed follower is still on the followers list");
}
console.log("coach removed the follower ok");

// --- AFTER, from the member's side: nothing says why, and nothing works
{
  const res = await m.request.get(BASE + "/carina", { failOnStatusCode: false });
  if (res.status() !== 404) fail(`a blocked viewer got ${res.status()} on the page, not 404`);
}
for (const path of ["/carina/about", "/carina/contact", "/carina/schedule"]) {
  const res = await m.request.get(BASE + path, { failOnStatusCode: false });
  if (res.status() !== 404) fail(`${path} answered ${res.status()} to a blocked viewer, not 404`);
}
console.log("every profile tab is simply not there ok");

await m.goto(BASE + "/discover");
await m.waitForTimeout(800);
if (await m.locator(".disrow", { hasText: "Carina" }).count())
  fail("Discover still lists a coach who blocked this member");
console.log("Discover drops the coach ok");

await m.goto(BASE + "/feed");
await m.waitForTimeout(900);
if ((await m.locator(".ps-event").count()) !== 0)
  fail("the blocked coach's classes are still in the merged week");
console.log("the merged week loses their classes ok");

// The follow row went with the block, and so did the mark on their class.
await m.goto(BASE + "/week");
await m.waitForTimeout(800);
if ((await m.locator(".ps-erow").count()) !== 0)
  fail("a class the blocked member had added is still in their week");
console.log("their added class is cleared ok");

// Nothing on the member's side names it. The word must not appear anywhere.
for (const path of ["/feed", "/discover", "/you", "/week"]) {
  await m.goto(BASE + path);
  await m.waitForTimeout(500);
  const txt = (await m.locator("body").innerText()).toLowerCase();
  if (/blocked|you were removed/.test(txt)) fail(`${path} tells the member they were blocked`);
}
console.log("nothing tells the member ok");

// --- the coach's own list is the one place it's visible, and it undoes
await co.goto(BASE + "/blocked");
await co.locator(".disrow", { hasText: "Sarah" }).waitFor();
console.log("the blocker sees their own list ok");
await co.locator(".disrow", { hasText: "Sarah" }).getByRole("button", { name: "Allow" }).click();
await co.waitForTimeout(1200);
{
  const res = await m.request.get(BASE + "/carina", { failOnStatusCode: false });
  if (res.status() !== 200) fail(`allowing them back left the page at ${res.status()}`);
}
// Undoing a block doesn't refollow: that was their choice to make.
await m.goto(BASE + "/carina");
await m.locator(".profacts .followpill").waitFor();
const pill = (await m.locator(".profacts .followpill").innerText()).trim();
if (/Following/.test(pill)) fail(`allowing someone back refollowed them for them (${pill})`);
console.log("allowing them back doesn't refollow ok");

// --- a class that has already run
//
// The share button hands back the real class URL, which is where the id comes
// from. Then open it dated a week back: the class runs every day, so that's a
// date it really ran on, and it's exactly the case an old shared link lands in.
await c2.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await m.locator(".ps-event").first().click();
await m.locator(".classoverlay-nm").waitFor();
await m.getByRole("button", { name: "Share this class" }).click();
const shareUrl = await m.evaluate(() => navigator.clipboard.readText());
const classId = shareUrl.match(
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
)?.[0];
if (!classId) fail(`couldn't get a class id out of the share link: ${shareUrl}`);

const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
await m.goto(`${BASE}/carina/${classId}?d=${weekAgo}`);
await m.getByText("This one has already run.").waitFor();
if (await m.locator(".ovcta-save").count())
  fail("a class that already ran still offers a way to add it");
console.log("a past class says so and offers no button ok");

// Today's occurrence still adds, so the rule is about the time and not the class.
await m.goto(`${BASE}/carina/${classId}`);
await m.locator(".classoverlay-nm").waitFor();
if (await m.getByText("This one has already run.").count())
  fail("the next occurrence of a daily class reads as already run");
if (!(await m.locator(".ovcta-save").count())) fail("a class still to come has no way to add it");
console.log("the next occurrence is still addable ok");

await b.close();
console.log("BLOCK CHECKS PASSED");
