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
}

/** On the step that asks who you are, fill the one field that isn't optional. */
export async function fillLocation(page, city = "Jersey City, NJ") {
  await page.locator("#wLocation").fill(city);
}
