import { redirect } from "next/navigation";
import { currentUser } from "@/lib/current-user";

/** Keep old shared links working while using the current share hub. */
export default async function SharePage() {
  const me = await currentUser();
  if (!me) redirect("/");
  redirect(me.kind === "fan" ? "/membershare" : "/coachshare");
}
