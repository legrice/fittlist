// Dark-launch switches. The fan/discovery side ships in the codebase but stays
// invisible until FANS_ENABLED=true is set in the environment, so the coach
// beta is untouched until we flip it.
export function fansEnabled(): boolean {
  return process.env.FANS_ENABLED === "true";
}

// Same switch, plus an admin bypass: admins can walk the fan side in production
// while it's still dark for everyone else. Signed-out visitors and the signup
// role toggle stay on fansEnabled() alone — there's no session to check yet.
export async function fansVisible(): Promise<boolean> {
  if (fansEnabled()) return true;
  const { currentAdmin } = await import("@/lib/admin");
  return !!(await currentAdmin());
}
