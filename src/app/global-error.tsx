"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#f7f8f7", color: "#020d08" }}>
        <main style={{ maxWidth: 420 }} role="alert">
          <h1>FittList couldn&rsquo;t open.</h1>
          <p>Check your connection and try again. Nothing you entered has been deleted.</p>
          <button type="button" onClick={reset} style={{ minHeight: 48, padding: "0 20px", border: 0, borderRadius: 16, background: "#9fe870", color: "#020d08", font: "inherit", fontWeight: 700 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
