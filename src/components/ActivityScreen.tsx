import Link from "next/link";
import { ActivityRow } from "@/components/ActivityRow";
import type { ActivityItem } from "@/lib/activity";

// Activity, as its own page: the same feed Home previews, with nothing taken
// off the end. A finite page that ends, like Home; no infinite scroll, and
// nothing ranked. Coach posts lead, then the going marks, newest first.
export function ActivityScreen({ items }: { items: ActivityItem[] }) {
  return (
    <div className="pad">
      <h1 className="acthead">Activity</h1>
      {items.length === 0 ? (
        <div className="empty-block">
          <h2>Nothing yet</h2>
          {/* The emptiness is actionable, so it says the action rather than
              apologising: this list is made of what the people you follow
              do, and following somebody is how it starts. */}
          <p>
            This is what the people you follow have been up to. Follow a few coaches and their
            weeks will show up here.
          </p>
          <Link className="btn si" href="/discover?half=coaches">
            Find coaches
          </Link>
        </div>
      ) : (
        <>
          <div className="hm-list">
            {items.map((a) => (
              <ActivityRow key={a.key} a={a} />
            ))}
          </div>
          {/* The same line Home closes its section with, for the same reason:
              the rule the whole social layer rests on is worth saying where
              the feed is rather than in a settings screen nobody opens. */}
          <p className="hm-foot">
            Only public actions appear here. Anything marked Personal stays private.
          </p>
        </>
      )}
    </div>
  );
}
