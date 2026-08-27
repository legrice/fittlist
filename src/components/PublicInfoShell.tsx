import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export function PublicInfoShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-info-shell">
      <header className="public-info-head">
        <Link href="/" aria-label="FittList home"><Wordmark /></Link>
      </header>
      <article className="aboutpage info-page">{children}</article>
      <footer className="public-info-footer">
        <Link href="/support">Support</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/community-standards">Community standards</Link>
      </footer>
    </main>
  );
}
