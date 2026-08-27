import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/PublicInfoShell";

export const metadata: Metadata = {
  title: "Terms of Use · FittList",
  description: "The terms for using FittList.",
};

export default function TermsPage() {
  return (
    <PublicInfoShell>
      <p className="about-kicker">Terms of Use · Updated August 27, 2026</p>
      <h1>Use FittList to make real-world fitness easier to find and plan.</h1>
      <p>These terms apply when you use FittList&rsquo;s website or app. By creating an account or using the service, you agree to them and to our Privacy Policy.</p>

      <h2>Your account</h2>
      <p>Give us accurate information, keep your sign-in methods secure, and tell us promptly if you think somebody else has accessed your account. You are responsible for activity performed through your account.</p>

      <h2>Schedules are information, not reservations</h2>
      <p>FittList helps people publish and organize fitness schedules. A listing can change, and marking a class on your calendar does not reserve a place or replace the studio&rsquo;s own booking, waiver, payment, or safety process. Confirm important details with the coach or venue.</p>

      <h2>What you post</h2>
      <p>You keep ownership of content you submit. You give FittList permission to host, format, and display it only as needed to operate and improve the service. Post only content you have the right to share, and do not publish private or sensitive information about somebody else.</p>

      <h2>Community conduct</h2>
      <p>Do not harass people, impersonate others, spam, misuse personal information, interfere with the service, or post illegal, hateful, sexually exploitative, dangerous, or misleading content. Our <Link href="/community-standards">Community Standards</Link> explain the rules in plain language. We may remove content, limit features, or suspend accounts to protect people or the service.</p>

      <h2>Service changes and availability</h2>
      <p>We work to keep FittList accurate and available, but we cannot promise uninterrupted service or that community-supplied information is always complete. Features may change as the product improves. If we end the service, we will provide reasonable notice when practical.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account in Settings. We may suspend or close an account that materially or repeatedly violates these terms, with notice when safety, law, or abuse prevention does not require immediate action.</p>

      <h2>Questions</h2>
      <p>Email <a href="mailto:hello@fittlist.co">hello@fittlist.co</a>. We may update these terms as the service changes and will publish a new effective date when we do.</p>
    </PublicInfoShell>
  );
}
