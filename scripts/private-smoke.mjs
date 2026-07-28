// Public vs private classes. Run the server with INVITE_ONLY=false.
// Verifies: a private item shows on the coach's own schedule (badged, with its
// free-form location) but is hidden from the public page.
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("PRIVATE SMOKE FAIL: " + m); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

await page.goto(BASE + "/");
await page.getByRole("button", { name: "Sign up with email" }).click();
await page.getByPlaceholder("you@example.com").fill("coach@example.com");
await page.getByPlaceholder("Password").fill("coach-pass-123");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
await page.getByText("Pick your link.").waitFor();
await page.getByPlaceholder("Your name").fill("Coach");
await page.getByRole("button", { name: "Claim it" }).click();
await page.getByRole("heading", { name: "Add a photo." }).waitFor();
await skipSetup(page);
await page.getByRole("heading", { name: "Your week is empty" }).waitFor();

// public class
await page.getByRole("button", { name: "Add your first class" }).click();
await page.getByRole("heading", { name: "New class" }).waitFor();
await page.getByPlaceholder("e.g. Barbell Strength").fill("Barbell Strength");
await page.getByRole("button", { name: "We", exact: true }).click();
await page.getByRole("button", { name: "Select or start typing a studio" }).click();
await page.getByRole("button", { name: "+ New studio" }).click();
await page.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
await page.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
await page.getByRole("button", { name: "Add studio" }).click();
await page.getByText("Added to the studio directory").waitFor();
await page.locator(".publishwrap .btn").click();
await page.getByText("Your page is live").waitFor();

// private class: no studio, free location
await page.getByRole("button", { name: "Add class" }).click();
await page.getByRole("heading", { name: "New class" }).waitFor();
await page.getByRole("button", { name: "Private", exact: true }).click();
await page.getByPlaceholder("e.g. Barbell Strength").fill("PT with Sarah");
await page.getByPlaceholder("e.g. Client's home, Online").fill("Client's home");
await page.getByRole("button", { name: "Th", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText(/Published|Saved|live/).waitFor();
await page.waitForTimeout(600);

await page.goto(BASE + "/app");
await page.locator(".ps-event", { hasText: "Barbell Strength" }).first().waitFor();
const priv = page.locator(".ps-event", { hasText: "PT with Sarah" }).first();
await priv.waitFor();
if (!(await priv.locator(".ps-private").isVisible())) fail("private badge missing on own schedule");
if (!(await priv.getByText("Client's home").isVisible())) fail("location missing on private item");
console.log("own schedule shows public + private (badged) ok");

await page.goto(BASE + "/coach/schedule");
await page.waitForFunction(() => document.querySelector(".ps-event"));
if ((await page.locator(".ps-event", { hasText: "Barbell Strength" }).count()) < 1)
  fail("public class missing from public page");
if ((await page.locator(".ps-event", { hasText: "PT with Sarah" }).count()) !== 0)
  fail("PRIVATE class leaked onto public page!");
console.log("public page hides the private class ok");

await browser.close();
console.log("done");
