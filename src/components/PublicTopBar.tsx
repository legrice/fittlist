import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

// What a stranger sees first on a coach's page.
//
// Until now a visitor could read the whole page without learning what fittlist
// is or finding a way in: the only door was one line of footer text, aimed at
// coaches, below everything else. The mark says whose house this is, and the
// two controls opposite it are the way in for the person reading.
//
// Both carry `via`, so a coach gets the credit for anyone who joins off their
// page. That attribution is the growth loop; a door without it is a leak.
//
// One door, not two. "Sign in" rather than "Log in": it covers both coming
// back and arriving for the first time, which is what the sheet behind it
// offers. Log in and Sign up side by side made the visitor pick a
// side before they had read anything, and the pair sat directly above Message
// and Follow, so the top of a coach's page was four controls deep. The log-in
// sheet carries "Don't have an account? Sign up", which is where that choice
// actually belongs: at the point someone has decided to come in.
export function PublicTopBar({ handle, next }: { handle?: string; next?: string }) {
  // A studio has a slug rather than a handle, and the credit is a person's, so
  // that page's bar carries the door without the attribution rather than
  // crediting a coach who doesn't exist.
  const via = handle ? `via=${encodeURIComponent(handle)}` : "";
  return (
    <div className="pubtop">
      <Link className="pubtop-home" href={via ? `/?${via}` : "/"} aria-label="fittlist, home">
        <Wordmark variant="ink" className="wordmark pubtop-wm" />
      </Link>
      {/* `next` is this page. Signing in from here is part of doing something
          here, and the flow used to end on /feed with whatever they were part
          way through nowhere in sight. */}
      <Link
        className="pubtop-login"
        href={`/?${[via, "join=login", next ? `next=${encodeURIComponent(next)}` : ""]
          .filter(Boolean)
          .join("&")}`}
      >
        Sign in
      </Link>
    </div>
  );
}
