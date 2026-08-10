import Link from "next/link";

export default function ContactPage() {
  return <article className="aboutpage info-page">
    <p className="about-kicker">Contact</p><h1>We&rsquo;d love to hear from you.</h1>
    <p>Questions, partnerships, class corrections, or just want to say hello?</p>
    <a className="btn si info-page-action" href="mailto:hello@fittlist.co">Email FittList</a>
    <p className="info-page-note">Already using FittList? You can also <Link href="/feedback">send feedback in the app</Link>.</p>
  </article>;
}
