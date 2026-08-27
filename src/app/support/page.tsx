import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/PublicInfoShell";

export const metadata: Metadata = {
  title: "Support · FittList",
  description: "Get help with your FittList account, calendar, or class listing.",
};

export default function SupportPage() {
  return (
    <PublicInfoShell>
      <p className="about-kicker">Support</p>
      <h1>How can we help?</h1>
      <p>Tell us what&rsquo;s happening with your account, calendar, a class listing, or another person on FittList. We&rsquo;ll help sort it out.</p>
      <a className="btn si info-page-action" href="mailto:hello@fittlist.co?subject=FittList%20support">Email support</a>
      <p className="info-page-note">Already signed in? You can also <Link href="/feedback">send feedback in the app</Link>.</p>
      <h2>Safety or abuse</h2>
      <p>For harassment, impersonation, unsafe content, or another urgent community concern, email <a href="mailto:hello@fittlist.co?subject=FittList%20safety%20report">hello@fittlist.co</a> with the profile or content link. Do not include sensitive health information.</p>
    </PublicInfoShell>
  );
}
