import type { Metadata } from "next";
import { PublicInfoShell } from "@/components/PublicInfoShell";

export const metadata: Metadata = {
  title: "Community Standards · FittList",
  description: "The rules that help keep the FittList community useful and safe.",
};

export default function CommunityStandardsPage() {
  return (
    <PublicInfoShell>
      <p className="about-kicker">Community Standards</p>
      <h1>People should feel safe showing up.</h1>
      <p>Profiles, schedules, groups, shoutouts, and messages should help people train together. These rules apply everywhere on FittList.</p>
      <h2>Be real and respectful</h2>
      <p>Do not impersonate somebody, harass or threaten people, target protected characteristics, or share another person&rsquo;s private information. Do not use FittList for unwanted sexual content or repeated unwanted contact.</p>
      <h2>Keep listings honest</h2>
      <p>Do not publish fake coaches, classes, studios, credentials, availability, or booking details. Correct mistakes in good faith and do not use class listings as spam.</p>
      <h2>Keep people safe</h2>
      <p>Do not promote illegal activity, exploitation, self-harm, dangerous misinformation, or conduct that creates a credible risk of physical harm.</p>
      <h2>Report a concern</h2>
      <p>Email <a href="mailto:hello@fittlist.co?subject=FittList%20safety%20report">hello@fittlist.co</a> with a link and a short description. We review reports, may remove content or restrict accounts, and will involve emergency or legal authorities when required. If someone is in immediate danger, contact local emergency services first.</p>
    </PublicInfoShell>
  );
}
