"use server";
import { currentUser } from "@/lib/current-user";
import { inboxThreads } from "@/lib/inbox-threads";
export async function loadInboxSheet() {
  const me = await currentUser();
  if (!me) return [];
  return inboxThreads(me);
}
