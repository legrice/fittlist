"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("app route failed", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <section className="screen ob" style={{ justifyContent: "center" }} role="alert">
      <div className="pad" style={{ maxWidth: 440, width: "100%", margin: "0 auto" }}>
        <h1>Something didn&rsquo;t load.</h1>
        <p>Your information is still safe. Check your connection and try this screen again.</p>
        <button className="btn" type="button" onClick={reset}>Try again</button>
        <Link className="confirm-keep" href="/feed">Return to your calendar</Link>
      </div>
    </section>
  );
}
