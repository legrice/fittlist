import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/PublicInfoShell";

export const metadata: Metadata = {
  title: "Support · FittList",
  description: "Get help with your FittList account, calendar, class listings, privacy, or safety.",
};

export default function SupportPage() {
  return (
    <PublicInfoShell>
      <p className="about-kicker">Support</p>
      <h1>How can we help?</h1>
      <p>Get help with your account, calendar, class listings, groups, or another person on FittList.</p>
      <a className="btn si info-page-action" href="mailto:hello@fittlist.co?subject=FittList%20support">Email support</a>

      <h2>Contact support</h2>
      <p>Email <a href="mailto:hello@fittlist.co?subject=FittList%20support">hello@fittlist.co</a> and include the email address connected to your account, a short description of the problem, and any helpful screenshots. Never send your password or sign-in code.</p>
      <p>Already signed in? You can also <Link href="/feedback">send feedback in the app</Link>.</p>

      <h2>Account and sign-in help</h2>
      <p>FittList sends a secure sign-in link to your email address. If it does not arrive, check your spam folder, confirm the address is correct, and request a new link. Only the newest sign-in link will work.</p>

      <h2>Calendar and class help</h2>
      <p>If a class is missing or incorrect, contact the coach or studio that published it. For problems saving, sharing, or syncing a calendar, email support with the class or profile link and your device type.</p>

      <h2>Delete your account</h2>
      <p>In FittList, open your profile, choose <strong>Settings</strong>, then <strong>Delete account</strong>. Deletion removes your account, public profile, classes, and associated personal data as described in our <Link href="/privacy">Privacy Policy</Link>. If you cannot sign in, email support from the address connected to your account.</p>

      <h2>Safety or abuse</h2>
      <p>Use the report option beside content or a profile when available. For harassment, impersonation, unsafe content, or another urgent community concern, email <a href="mailto:hello@fittlist.co?subject=FittList%20safety%20report">hello@fittlist.co</a> with the profile or content link. Do not include sensitive health information.</p>

      <p className="info-page-note">FittList support is provided by FittList in the United States. Review our <Link href="/community-standards">Community Standards</Link>, <Link href="/terms">Terms</Link>, and <Link href="/privacy">Privacy Policy</Link>.</p>
    </PublicInfoShell>
  );
}
