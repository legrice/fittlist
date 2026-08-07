// Getting through the setup wizard in a test.
//
// The wizard is one shape for everyone now: Do you teach (the role question
// moved here from the signup sheet), About you (the city is the one required
// field), then Follow a few coaches (always drawn, empty state and all, so
// this walk never has to guess whether the step exists). Every suite that
// wants a set-up account goes through here rather than each one learning the
// wizard's shape again.
export async function skipSetup(page, city = "Jersey City, NJ", teach = true) {
  await page
    .locator(".teachcard", { hasText: teach ? "Yes, I teach" : "I just take classes" })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#wLocation").fill(city);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Follow a few coaches").waitFor();
  await page.getByRole("button", { name: /find people later/ }).click();
  // Wait for the wizard to actually be done, not just for the last click to
  // land: finishing saves the profile, flips the teaching switch, writes
  // onboardedAt and then navigates, all inside one transition, and a suite
  // that raced that write once cost an afternoon.
  await page.waitForURL((u) => !u.pathname.startsWith("/welcome"), { timeout: 20000 });
}

/** On the About step, fill the one field that isn't optional. */
export async function fillLocation(page, city = "Jersey City, NJ") {
  await page.locator("#wLocation").fill(city);
}
