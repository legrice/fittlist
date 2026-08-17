// Dark-launch switches for the fan/discovery side.
//
//   FANS_ENABLED unset      coach beta exactly as it was; admins can still
//                           preview the member side
//   FANS_ENABLED=coaches    every signed-in coach can follow, browse the
//                           directory and keep a week — but the public signup
//                           has no "I'm here to train" option yet
//   FANS_ENABLED=true       members can sign up too — still behind INVITE_ONLY,
//                           same beta gate the coaches go through
//
// The value is compared exactly: "1" and "yes" are not "true".

export function fansEnabled(): boolean {
  return process.env.FANS_ENABLED === "true";
}

// Coach-to-coach testing: the member surface is live for anyone signed in,
// while public fan signup stays closed.
export function fansForCoaches(): boolean {
  const v = process.env.FANS_ENABLED;
  return v === "true" || v === "coaches";
}

// Whether this viewer gets the member surface at all: the flag, or an admin
// previewing it while it's still dark. Signed-out visitors and the signup role
// toggle stay on fansEnabled() alone — there's no session to check yet.
export async function fansVisible(): Promise<boolean> {
  if (fansForCoaches()) return true;
  const { currentAdmin } = await import("@/lib/admin");
  return !!(await currentAdmin());
}

// The canonical signed-in landing page. Account type no longer changes the
// first screen: everyone builds and shares the same fitness calendar.
export async function landingHref(): Promise<string> {
  return "/calendar";
}
