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

// Where signing in lands, and where the wordmark goes.
//
// The calendar, since Following collapsed into it: there is no merged week to
// land on any more, because following delivers a circle rather than classes.
// It answers per kind rather than leaning on the two calendars' redirects,
// which would put a hop on every sign-in and every OAuth callback for the half
// of the app that lands on /app.
//
// It stays a function because the answer has changed three times now (/app,
// then /feed, then here) and every caller already asks rather than assuming.
export async function landingHref(): Promise<string> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return "/app";
  const { getDb, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return me?.kind === "fan" ? "/week" : "/app";
}
