// Discover after the updates brief: Follow is the one relationship word,
// the This week rail is rings over the people you follow, the peek is a
// live week of coaching plus saved with the overlap marked, the filters
// are four value-showing chips, and the list is open-ended with series
// collapse. Replaces the favorites-era walk.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/discover-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("DISCOVER FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const stamp = Date.now().toString(36);

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("disc-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p, "Jersey City, NJ", !member);
  if (member) await p.waitForURL("**/feed");
  return p;
};

// One coach, three Monday classes at one studio and one Tuesday class:
// weekly, so the collapse has something to collapse.
const coach = await mk(`dc${stamp}@example.com`, `Drew ${stamp.slice(-3)}`, false);
const addClass = async (nm, day, t, firstStudio) => {
  await coach.goto(BASE + "/calendar");
  await coach.locator(".wkempty-cta, .wkfab").first().click();
  await coach
    .locator(".setrow", { hasText: /coaching/ })
    .click({ timeout: 4000 })
    .catch(() => {});
  await coach.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
  if (firstStudio) {
    await coach.getByRole("button", { name: "+ New studio" }).click();
    await coach.getByPlaceholder("e.g. Palisade Barbell").fill(`Drew Gym ${stamp.slice(-3)}`);
    await coach.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Drew St, Jersey City NJ");
    await coach.getByRole("button", { name: "Add studio" }).click();
  } else {
    await coach.getByPlaceholder("Start typing a studio…").fill("Drew Gym");
    await coach.locator(".studio-row", { hasText: "Drew Gym" }).click();
    await coach.getByRole("button", { name: "+ New class" }).click();
  }
  await coach.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await coach.getByRole("button", { name: day, exact: true }).click();
  await coach.locator("#fStart").fill(t);
  await coach.locator(".publishwrap .btn").click();
  await coach.waitForTimeout(1200);
  await coach.locator(".sheetclose").first().click().catch(() => {});
};
await addClass("Dawn Lift", "Mo", "06:00", true);
await addClass("Noon Lift", "Mo", "12:00", false);
await addClass("Dusk Lift", "Mo", "18:00", false);
await addClass("Tuesday Flow", "Tu", "09:00", false);
console.log("coach's week up: three Mondays, one Tuesday");

// A second member, for People near you's Everyone half.
const kai = await mk(`dk${stamp}@example.com`, `Kai ${stamp.slice(-3)}`, true);
await kai.context().close();

// The member the walk belongs to.
const m = await mk(`dm${stamp}@example.com`, `Demi ${stamp.slice(-3)}`, true);
const tabs = (await m.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
if (!tabs[0].includes("Home")) fail("Home leads the bar: " + tabs.join("|"));

// The landing: the magnifier in the header's corner right of the bell (the
// search bar came off the top, by Matt's call), the teaching rail
// (following nobody), and the three rails.
if (await m.locator(".dissearch-door").count()) fail("Home's search bar came off");
await m.locator('.brandbar-actions [aria-label="Search"]').waitFor();
// Messages and notifications are two doors, the way YouTube splits them.
await m.locator('.brandbar-actions [aria-label="Messages"]').waitFor();
await m.locator(".railbl", { hasText: "This week" }).waitFor();
await m.locator(".trayhint").waitFor();
if ((await m.locator(".trayav-ghost").count()) !== 2) fail("a bare rail gets two ghosts");
// The leading circle is your own face and the word You, by Matt's call.
await m.locator(".trayitem", { hasText: "You" }).first().waitFor();
if (!(await m.locator(".trayav-you .trayav-ini, .trayav-you img").count()))
  fail("the You circle wears the viewer's own face");

// Upcoming near you is a rail of event cards now, by Matt's call: the
// date leaf, no filters, no date tabs, and the head's arrow the door to
// Search's Classes segment.
await m.locator(".nearlbl", { hasText: "Upcoming near you" }).waitFor();
if (await m.locator(".fchips").count()) fail("the filter chips came off with the vertical list");
if (await m.locator(".daytabs").count()) fail("the date tabs came off with the vertical list");
await m.locator(".uprail-card").first().waitFor();
for (const nm of ["Dawn Lift", "Noon Lift", "Dusk Lift", "Tuesday Flow"])
  if (!(await m.locator(".uprail-nm", { hasText: nm }).count())) fail(nm + " must ride the rail");
if (!(await m.locator(".uprail-date .uprail-dom").count())) fail("every card wears its date leaf");
console.log("the landing: corner search, the faces, the Upcoming rail");

// The bare ribbon on a card saves in place. No toast, by Matt's call:
// the save lights your own circle at the top of the rail instead, brand
// ring plus a New badge on your face.
const firstSave = m.locator(".uprail-card .rowsave").first();
if (!(await firstSave.count())) fail("every card wears the bare ribbon");
await firstSave.click();
await m.locator(".uprail-card .rowsave.on").first().waitFor();
if (await m.locator(".toast.on", { hasText: "Saved" }).count())
  fail("a save lights the ring, never toasts, by Matt's call");
await m.locator(".trayav-you.trayav-ring").waitFor();
await m.locator(".younew", { hasText: "New" }).waitFor();
await m.locator(".uprail-card .rowsave.on").first().click();
await m.waitForFunction(() => !document.querySelector(".uprail-card .rowsave.on"), null, {
  timeout: 10000,
});
console.log("the card ribbon fills in place and lights the You ring");

// Under the schedule: the studios as rectangles, closest first, and the
// coaches with Follow one tap deep, by Matt's call. Every head's arrow
// lands on Search with that kind's segment already picked.
await m.locator(".nearlbl", { hasText: "Studios near you" }).waitFor();
await m.locator(".strail-item", { hasText: "Drew Gym" }).first().waitFor();
await m.locator(".nearlbl", { hasText: "Find friends" }).waitFor();
const drewNear = m.locator(".ctrail-item", { hasText: "Drew" }).first();
await drewNear.locator(".ctrail-fl", { hasText: "Follow" }).waitFor();
if ((await m.locator(".nearhead-go").count()) !== 3) fail("three rails, three arrows");
await m.locator('.nearhead-go[href="/search?seg=classes"]').click();
await m.waitForURL(/\/search\?seg=classes/);
await m.locator(".srchseg button.sel", { hasText: "Classes" }).waitFor();
await m.locator(".dirclass, .peekempty, .callist, .clsday").first().waitFor().catch(() => {});
await m.goBack();
await m.locator(".uprail-card").first().waitFor();
console.log("the rails under the schedule, each arrow landing on its segment");

// The class peek: Follow (no star), and Save in the footer. Scoped to the
// sheet, because the Coaches near you rail behind it carries Follow too.
await m.locator(".uprail-nm", { hasText: "Dusk Lift" }).first().click();
await m.locator(".clsfull .peekfollow", { hasText: "Follow" }).waitFor();
if (await m.locator(".peekstar").count()) fail("no stars anywhere");
await m.locator(".clsfull .peekfollow").click();
await m.locator(".clsfull .peekfollow.on", { hasText: "Following" }).waitFor();
await m.locator(".clsfull-btn.save", { hasText: "Save" }).click();
await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).waitFor();
await m.locator(".clsfull-x").click();
console.log("followed and saved from the class");

// The rail: Drew's circle wears the fresh ring; Kai, quiet, is not on it.
await m.goto(BASE + "/feed");
await m.locator(".trayitem", { hasText: "Drew" }).waitFor();
if (!(await m.locator(".trayav-ring:not(.seen)").count())) fail("an unseen week rings in brand");
if (await m.locator(".trayitem", { hasText: "Kai" }).count()) fail("a week never touched stays off the rail");
if (await m.locator(".trayitem-next").count()) fail("no captions under the circles");
console.log("the ring is lit before the peek");

// The peek: the stacked head (the name clear of the close row, View
// profile and Following under the face, no Week of line and no overlap
// count), Coaching tags, the You-saved-this-too marker, the ribbon footer.
await m.locator(".trayitem", { hasText: "Drew" }).click();
await m.locator(".peekhead-stack .peekhead-nm", { hasText: "Drew" }).waitFor();
if (await m.locator(".peekhead-wk").count()) fail("the Week of line came off, by Matt's call");
if (await m.locator(".peeklead").count()) fail("the overlap count came off, by Matt's call");
await m.locator(".peekacts .peekview", { hasText: "View profile" }).waitFor();
await m.locator(".peekacts .peekfollow.on", { hasText: "Following" }).waitFor();
if (!(await m.locator(".peektag", { hasText: "Coaching" }).count())) fail("coached rows tag Coaching");
if (!(await m.locator(".peektag-you", { hasText: "You saved this too" }).count()))
  fail("the overlap marker draws on the saved row");
await m.locator(".peekfoot", { hasText: "Ribbon anything here" }).waitFor();
await m.locator(".peekadd:not(.on)").first().click();
await m.locator(".peektag-you").nth(1).waitFor();
await m.locator(".peekclose").click();
console.log("the peek: live rows, tags, the overlap");

// Seen: the ring goes grey once the week has been opened. The repaint
// rides router.refresh(), which under a loaded machine sometimes lands
// late; a cold reload separates a slow repaint (tolerated, logged) from
// peekedAt never landing (a real failure).
try {
  await m.locator(".trayav-ring.seen").waitFor({ timeout: 15000 });
} catch {
  await m.goto(BASE + "/feed");
  await m.locator(".trayav-ring.seen").waitFor({ timeout: 15000 });
  console.log("(the seen ring needed a reload; refresh repaint was slow)");
}
console.log("the ring goes out on the peek, not the close");

// People near you: the segment, the Coach tag and next time, Follow rows.
await m.locator(".trayitem", { hasText: "Add" }).click();
await m.locator(".dissheet h2", { hasText: "People near you" }).waitFor();
const drewRow = m.locator(".nearrow", { hasText: "Drew" });
await drewRow.waitFor();
if (!(await drewRow.locator(".nearrow-tag", { hasText: "Coach" }).count())) fail("coach rows tag Coach");
if (!(await drewRow.locator(".nearrow-sub", { hasText: "next" }).count()))
  fail("coach rows say their next class");
await drewRow.locator(".peekfollow.on", { hasText: "Following" }).waitFor();
const kaiRow = m.locator(".nearrow", { hasText: "Kai" });
await kaiRow.waitFor();
if (await kaiRow.locator(".nearrow-tag").count()) fail("member rows carry no tag");
await m.locator(".whoseg button", { hasText: "Coaches only" }).click();
if (await m.locator(".nearrow", { hasText: "Kai" }).count()) fail("Coaches only hides members");
await m.locator(".whoseg button", { hasText: "Everyone" }).click();
await kaiRow.locator(".peekfollow", { hasText: "Follow" }).click();
await kaiRow.locator(".peekfollow.on", { hasText: "Following" }).waitFor();
console.log("People near you: segment, tags, Follow on every row");

// The lit ring is a door: tapping You lands on the Share screen, the
// first landing explains it once with Continue, and arriving is what
// puts the ring out. The About block ends the scroll, and the page
// behind it carries the Contribute sheet.
await m.goto(BASE + "/feed");
await m.locator(".uprail-card").first().waitFor();
await m.locator(".uprail-card .rowsave:not(.on)").first().click();
await m.locator(".trayav-you.trayav-ring").waitFor();
await m.locator(".trayitem", { hasText: "You" }).first().click();
await m.waitForURL(/\/membershare/);
await m.locator(".shareintro h2", { hasText: "Your week lives here" }).waitFor();
await m.locator(".shareintro .btn", { hasText: "Continue" }).click();
if (await m.locator(".shareintro").count()) fail("Continue closes the intro");
await m.goto(BASE + "/feed");
await m.locator(".uprail-card").first().waitFor();
if (await m.locator(".younew").count()) fail("arriving on the Share screen puts the ring out");
await m.locator(".abouthome-go", { hasText: "About FittList" }).click();
await m.waitForURL(/\/about/);
await m.locator(".aboutpage h1", { hasText: "What FittList is" }).waitFor();
await m.locator(".contribute-cta", { hasText: "Contribute" }).click();
await m.locator(".contribsheet .setrow", { hasText: "Add a class" }).waitFor();
await m.locator(".contribsheet .setrow", { hasText: "Add a studio" }).waitFor();
await m.locator(".contribsheet .setrow", { hasText: "Share fittlist with a coach" }).waitFor();
await m.locator(".contribsheet .sheetclose").click();
console.log("the ring is the door: Share intro, then out; About and Contribute stand");

// The saved class is real: it sits on the member's own week.
await m.goto(BASE + "/week");
await m.locator(".clline[data-cid]").first().waitFor();
console.log("the save landed on the calendar");

await b.close();
console.log("ALL DISCOVER CHECKS PASSED");
