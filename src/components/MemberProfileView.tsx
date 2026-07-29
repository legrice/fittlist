import { schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { viewerLook } from "@/lib/look";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { MemberProfileActions } from "@/components/MemberProfileActions";

// A member's public profile. Deliberately not the coach page: there's no
// schedule behind it, nothing to book, and nobody to email. It's who they are,
// which is what a coach seeing a new follower actually wants to know.
//
// It used to list the coaches they follow. That turned a profile into a
// scoreboard: two people side by side, one with six coaches and one with none,
// and the comparison is doing something nobody asked for. Who you train with
// is yours. You can see your own on Following; a coach sees their own
// followers; and that's the whole audience for it.
export async function MemberProfileView({
  user,
  isOwner,
  from,
}: {
  user: typeof schema.users.$inferSelect;
  isOwner: boolean;
  from?: string;
}) {
  const backTo =
    from === "discover"
      ? { href: "/discover", label: "Back to Discover" }
      : from === "home"
        ? { href: "/feed", label: "Back to Following" }
        : from === "followers"
          ? { href: "/followers", label: "Back to your followers" }
          : null;

  const name = user.name.trim() || user.email.split("@")[0];
  const initial = (name.charAt(0) || "?").toUpperCase();

  return (
    <div className="pub memberpub" data-mode={await viewerLook()}>
      <div className="profwrap">
        <div className="mempro-top">
          {backTo ? (
            <BackLink className="evback" href={backTo.href} label={backTo.label}>
              <Icon name="arrow_back" size={21} />
            </BackLink>
          ) : (
            <span />
          )}
          {isOwner && <MemberProfileActions />}
        </div>

        <div className="mempro-id">
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mempro-av" src={user.photo} alt="" />
          ) : (
            <span
              className="mempro-av mempro-av-empty"
              style={{ background: avatarColor(user) }}
              aria-hidden="true"
            >
              {initial}
            </span>
          )}
          <h1 className="mempro-nm">{name}</h1>
          {user.title?.trim() && <p className="mempro-title">{user.title}</p>}
          {user.location?.trim() && (
            <p className="mempro-loc">
              <Icon name="place" size={14} /> {user.location}
            </p>
          )}
        </div>

        {user.about?.trim() && <p className="mempro-about">{user.about}</p>}
      </div>
    </div>
  );
}
