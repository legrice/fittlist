// "I teach too": the switch the whole account model rests on. One kind of
// account, and teaching is a thing it carries rather than a second signup.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/teach-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("TEACH FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(20000);
await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.getByPlaceholder("you@example.com").fill("kia@example.com");
await p.getByPlaceholder("Password").fill("member-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Kia Bright");
await p.getByRole("button", { name: "Claim it" }).click();
await skipSetup(p, "Montclair, NJ", false);
await p.waitForURL("**/feed");

const tabs = async () =>
  (await p.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

// Five tabs for everyone, by Matt's call: Home is Discover, then Calendar,
// Search (finding things earns its own place as the app fills in), Share,
// and Profile wearing the viewer's face.
let t = await tabs();
console.log("member tabs:", t.join(" | "));
if (t.length !== 5) fail("everyone gets five tabs, got " + t.join());
if (
  !t[0].includes("Discover") ||
  !t[1].includes("Calendar") ||
  !t[2].includes("Search") ||
  !t[3].includes("Share")
)
  fail("the bar is Discover, Calendar, Search, Share, Profile: " + t.join());
if (!(await p.locator(".navtab[data-tab='you'] .navface-initial, .navtab[data-tab='you'] .navface-photo").count()))
  fail("the Profile tab should wear the viewer's face");
await p.goto(BASE + "/calendar");
await p.waitForURL(/\/week/);
console.log("a member's /calendar lands on their own week");

// The Share tab opens the hub for a member too now: the Week alone, and
// the build flow leading because the week starts empty.
await p.goto(BASE + "/membershare");
await p.locator(".shstart h2", { hasText: "Add the classes you\u2019re taking this week" }).waitFor();
await p.getByRole("button", { name: "Add a class" }).waitFor();
if (await p.locator(".shseg").count()) fail("a member's hub has one subject and no segment row");
console.log("a member’s /membershare opens on the start block");

// The Profile tab opens your page, not a list of switches. Settings are
// the white circle in the corner the back button takes on somebody else's
// page, by Matt's call; the header carries no gear any more.
await p.locator(".navtab[data-tab='you']").click();
await p.waitForURL(/\/kiabright/);
await p.locator(".profname", { hasText: "Kia Bright" }).waitFor();
if (!(await p.locator(".navtab").count())) fail("your own profile keeps the tab bar");
if (await p.locator('.brandbar-actions [aria-label="Settings"]').count())
  fail("the header carries no gear any more");
await p.locator('.profback [aria-label="Settings"]').click();
await p.locator('.acctwrap[role="dialog"]').waitFor();
await p.locator(".setrow", { hasText: "I coach classes" }).waitFor();
console.log("Profile opens your page, and the gear slides settings up over it");
await p.locator(".acctclose").click();
await p.locator('.acctwrap[role="dialog"]').waitFor({ state: "detached" });
// The old address still lands on the profile: it was the settings screen for
// months and is in old links, in /app?acct=1 and in the OAuth callback.
await p.goto(BASE + "/you");
await p.waitForURL(/\/kiabright/);
console.log("/you still lands somewhere real");

// The Profile tab, for somebody who doesn't teach. Two counts rather than
// three, both opening the list they count, and nothing anywhere offering a
// picture of a week they haven't got.
await p.goto(BASE + "/settings");
const stats = p.locator(".acctstats .acctstat");
if ((await stats.count()) !== 2) fail("a member gets two counts, got " + (await stats.count()));
await p.locator(".acctstat", { hasText: "Followers" }).click();
await p.waitForURL(/\/followers/);
await p.getByText("No followers yet").waitFor();
console.log("Followers opens the list it counts, and it can empty");
await p.goto(BASE + "/settings");
await p.locator(".acctacts .btn.si", { hasText: "Share" }).click();
const shareRows = (await p.locator(".ownermenu .setrow .t").allInnerTexts()).map((s) => s.trim());
console.log("member share rows:", shareRows.join(" | "));
if (shareRows.some((s) => /story|week/i.test(s)))
  fail("a member has no week to draw: " + shareRows.join());
if (!shareRows.includes("Profile card") || !shareRows.includes("QR code"))
  fail("the page's own picture and code stay: " + shareRows.join());
await p.locator(".sheetclose").click();
// Wait for the scrim to actually go: the next click is on a row underneath it,
// and a tap that lands on a closing sheet does nothing at all.
await p.locator(".sheet-scrim").waitFor({ state: "detached", timeout: 10000 });

// Turn teaching on: the Calendar tab arrives without a reload.
const row = p.locator(".setrow", { hasText: "I coach classes" });
await row.waitFor();
if (await row.locator(".switch.on").count()) fail("a member starts with it off");
await row.click();
// Wait for the tab, not for a stopwatch. The switch flips optimistically and
// the bar redraws on router.refresh(), which is a round trip: a fixed sleep
// passes on a warm server and fails on a cold one, and it did.
await p.locator(".navtab", { hasText: "Calendar" }).waitFor({ timeout: 15000 });
if (!(await row.locator(".switch.on").count())) fail("the switch should read on");
// No reload. The bar is rendered by the layout above this screen, so a switch
// that adds a tab and leaves the bar alone until the next navigation has
// plainly not worked; router.refresh() has to reach the whole shell.
t = await tabs();
console.log("after turning it on:", t.join(" | "));
if (t.length !== 5 || !t[0].includes("Discover") || !t[1].includes("Calendar") || !t[2].includes("Search") || !t[3].includes("Share"))
  fail("expected Discover, Calendar, Search, Share, got " + t.join());
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-teach-on.png" });

// ...and the calendar is real: it loads, and offers the first class.
await p.locator(".navtab", { hasText: "Calendar" }).click();
await p.waitForURL(/\/calendar/);
await p.locator(".wkempty-t", { hasText: "Your calendar is empty" }).waitFor();
console.log("the Calendar tab opens a real, empty week");

// Turn it off again: the tab goes, and nothing else is harmed.
await p.goto(BASE + "/settings");
await p.locator(".setrow", { hasText: "I coach classes" }).click();
// The Calendar tab stays (everyone has one now); only where it points
// changes, so wait for the bar to settle rather than for a tab to leave.
await p.waitForTimeout(2500);
t = await tabs();
console.log("after turning it off:", t.join(" | "));
if (t.length !== 5 || !t[1].includes("Calendar"))
  fail("turning it off keeps five tabs, got " + t.join());

await b.close();
console.log("ALL TEACH CHECKS PASSED");
