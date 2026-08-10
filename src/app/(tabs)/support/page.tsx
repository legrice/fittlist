import Link from "next/link";

export default function SupportPage() {
  return <article className="aboutpage info-page">
    <p className="about-kicker">Support</p><h1>How can we help?</h1>
    <p>Tell us what&rsquo;s happening with your account, calendar, or a class listing and we&rsquo;ll help sort it out.</p>
    <Link className="btn si info-page-action" href="/feedback">Get help</Link>
    <p className="info-page-note">You can also review our <Link href="/privacy">privacy policy</Link> or update your <Link href="/settings">account settings</Link>.</p>
  </article>;
}
