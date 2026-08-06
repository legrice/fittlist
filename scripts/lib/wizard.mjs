// Getting through the setup wizard in a test.
//
// Location is required now, so "Skip for now" no longer finishes from the
// photo step: it lands on the step that asks for a city and waits. Every suite
// that just wanted a set-up account goes through here rather than each one
// learning the wizard's shape again.
export async function skipSetup(page, city = "Jersey City, NJ") {
  const skip = page.getByRole("button", { name: "Skip for now" });
  await skip.click();
  const loc = page.locator("#wLocation");
  if (await loc.isVisible().catch(() => false)) {
    await loc.fill(city);
    await skip.click();
  }
  // Wait for the wizard to actually be done, not just for the last click to
  // land. Finishing saves the profile, writes onboardedAt and then navigates,
  // all inside one transition; a suite that carried straight on to its own
  // page.goto() was racing that write and sometimes winning, which left an
  // account that looked set up everywhere except the two screens that check
  // the column. It cost an afternoon: the coach's settings screen kept
  // bouncing to /welcome for no reason anybody could see on the calendar.
  await page.waitForURL((u) => !u.pathname.startsWith("/welcome"), { timeout: 20000 });
}

/** On the step that asks who you are, fill the one field that isn't optional. */
export async function fillLocation(page, city = "Jersey City, NJ") {
  await page.locator("#wLocation").fill(city);
}
