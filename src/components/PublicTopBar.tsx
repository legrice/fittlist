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
// Sign up is outlined rather than filled, because Subscribe sits directly
// under it and that is the page's actual job. Two solid pills in a column read
// as one decision with two answers.
export function PublicTopBar({ handle }: { handle: string }) {
  const via = `via=${encodeURIComponent(handle)}`;
  return (
    <div className="pubtop">
      <Link className="pubtop-home" href={`/?${via}`} aria-label="fittlist, home">
        <Wordmark variant="ink" className="wordmark pubtop-wm" />
      </Link>
      <div className="pubtop-act">
        <Link className="pubtop-login" href={`/?${via}&join=login`}>
          Log in
        </Link>
        <Link className="btn ghost pubtop-join" href={`/?${via}&join=signup`}>
          Sign up
        </Link>
      </div>
    </div>
  );
}
