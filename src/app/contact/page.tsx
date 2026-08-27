import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/PublicInfoShell";

export const metadata: Metadata = {
  title: "Contact · FittList",
  description: "Contact the FittList team.",
};

export default function ContactPage() {
  return (
    <PublicInfoShell>
      <p className="about-kicker">Contact</p>
      <h1>We&rsquo;d love to hear from you.</h1>
      <p>Questions, partnerships, class corrections, or just want to say hello?</p>
      <a className="btn si info-page-action" href="mailto:hello@fittlist.co">Email FittList</a>
      <p className="info-page-note">Need help with an account? Visit <Link href="/support">Support</Link>.</p>
    </PublicInfoShell>
  );
}
