import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { googleConfigured } from "@/lib/gcal";
import { appleConfigured } from "@/lib/apple";
import { fansEnabled, landingHref } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { adminEmails } from "@/lib/admin";
import { pendingInviter } from "@/lib/joinlink";
import { AuthFlow } from "@/components/AuthFlow";
import { PublicPreview } from "@/components/PublicPreview";
import { publicPreview } from "@/lib/public-preview";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ via?: string; invited?: string; join?: string; city?: string }>;
}) {
  const { via, invited, join, city } = await searchParams;
  const viaHandle = via?.trim() || null;
  // Arrived from a beta invite email rather than stumbling on the site.
  const wasInvited = invited === "1";
  // Google login is off the door for the beta, by Matt's call: the credentials
  // are live in production for the Calendar sync, which is why "configured"
  // stopped being the right gate. Flip this back to googleConfigured() when
  // the beta opens up.
  const providers = { google: false, apple: appleConfigured() };
  void googleConfigured;
  // Or on somebody's share link, which /j/{code} left in a cookie on the way
  // through. Same gate, and this is who opened it for them. A link from the
  // admin lands as a plain "you're invited" with no name on it: a coach
  // vouching for a friend is social proof, the person running the site
  // appearing on the front door is just their name where it needn't be.
  const via_ = await pendingInviter();
  const viaAdmin = !!via_ && adminEmails().includes(via_.email.toLowerCase());
  const inviter =
    via_ && !viaAdmin
      ? { name: via_.name.trim() || "Someone", photo: via_.photo, color: avatarColor(via_) }
      : null;
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    // The front door only decides where to send an existing session. Avoid
    // pulling profile photos and every settings field before that redirect.
    const [user] = await db
      .select({ handle: schema.users.handle, kind: schema.users.kind })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    // A handle is what "set up" means now, for both sides. Once claimed, use
    // the same canonical landing as every auth callback and the onboarding
    // finish: the Calendar tab. Keeping a separate root redirect was how established
    // sessions and brand-new sessions ended up on different first screens.
    const pendingGroupToken=(await cookies()).get("fl_group_join")?.value;
    if(user?.handle&&pendingGroupToken&&/^[a-f0-9]{32,64}$/.test(pendingGroupToken))redirect(`/g/join/${pendingGroupToken}`);
    if (user?.handle) redirect(await landingHref());
    // Signed in but never claimed a handle. `kind` is "coach" by default — the
    // column default, not a choice anyone made — so when members can sign up,
    // ask which they are before demanding a URL. Someone who already answered
    // goes straight to the claim step rather than being asked twice.
    if (user)
      return (
        <AuthFlow
          startStage="claim"
          claimAs={user.kind === "fan" ? "fan" : "coach"}
          via={viaHandle}
          providers={providers}
          inviteOnly={false}
          invited={wasInvited || viaAdmin}
          invitedByLink={viaAdmin && !wasInvited}
          inviter={inviter}
          fans={fansEnabled()}
          landing={await landingHref()}
        />
      );
  }
  // The ordinary logged-out front door is the product, not an explanation of
  // it. Authentication appears only when somebody asks to save, follow, join,
  // publish, or explicitly signs in. Invite arrivals keep the focused auth
  // door they were sent to, and action links return here with `join` set.
  if (!join && !wasInvited && !via_ && !viaHandle) {
    return <PublicPreview data={await publicPreview(city)} />;
  }
  return (
    <AuthFlow
      startStage="email"
      via={viaHandle}
      providers={providers}
      inviteOnly={false}
      invited={wasInvited || viaAdmin}
      invitedByLink={viaAdmin && !wasInvited}
      inviter={inviter}
      fans={fansEnabled()}
      landing={await landingHref()}
    />
  );
}
