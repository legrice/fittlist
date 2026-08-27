import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        <h1>That page isn&rsquo;t here.</h1>
        <p>The link may be old, the page may have moved, or you may not have access.</p>
        <Link className="btn" href="/">
          Go to FittList
        </Link>
      </div>
    </section>
  );
}
