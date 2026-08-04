import Link from "next/link";
import { initialOf } from "@/lib/avatar";
import type { HomeActivity } from "@/lib/home";

// One activity line. Home draws a few of these and /activity draws the lot,
// so it lives here rather than inside either: the same act has to read the
// same way wherever somebody meets it, which is the rule the class row
// learned the hard way.
export function ActivityRow({ a }: { a: HomeActivity }) {
  return (
    <Link className="hm-lrow" href={a.href}>
      <span className="hm-sq hm-round" style={{ background: a.actorColor }}>
        {a.actorPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={a.actorPhoto} alt="" />
        ) : (
          initialOf(a.actorName)
        )}
      </span>
      <span className="hm-lrowtxt">
        <span className="hm-lrownm">{a.title}</span>
        <span className="hm-lrowsub">{a.sub}</span>
      </span>
    </Link>
  );
}
