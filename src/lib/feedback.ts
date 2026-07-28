import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

export type FeedbackHost = { id: string; name: string; email: string };

// Who feedback goes to: the first ADMIN_EMAILS address with an account.
//
// It's a real user row rather than a mailbox on purpose. A thread needs an
// owner to hang off, and routing it to an account means the reply comes back
// through the same inbox as everything else instead of turning into email.
//
// Null when no admin has signed up yet. Callers hide the door rather than
// offering one with nobody behind it.
export async function feedbackHost(): Promise<FeedbackHost | null> {
  const emails = adminEmails();
  if (!emails.length) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.email, emails));
  // Keep ADMIN_EMAILS order: the first one listed is the one who wants these.
  for (const e of emails) {
    const hit = rows.find((r) => r.email.toLowerCase() === e);
    if (hit) return hit;
  }
  return null;
}
