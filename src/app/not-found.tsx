import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <section className="screen ob" style={{ justifyContent: "center" }}>
      <Wordmark variant="cloud" className="mark" />
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        <h1>Nobody&rsquo;s here yet.</h1>
        <p>This page hasn&rsquo;t been claimed. Coach classes? It could be yours.</p>
        <Link className="btn" href="/">
          Claim your page
        </Link>
      </div>
    </section>
  );
}
