# Why sign-in emails land in spam, and what to do about it

A beta coach's password-recovery email went to spam. Some of that was the
message; most of it is DNS. Both halves are here.

## What was wrong with the message (fixed)

The sign-in email was `text/plain` only, and its body was two sentences and a
bare URL. That is *precisely* the shape of a phishing mail, and Gmail and
Outlook both score it that way. Specifically:

- **No HTML part.** Almost no legitimate transactional mail is text-only in
  2026. Filters treat a text-only message carrying a link as suspicious by
  default.
- **A bare token URL as the payload.** A long opaque link with no surrounding
  context is the single strongest signal in a phishing heuristic.
- **No reason-for-receipt.** Real transactional mail says who it's for and why
  it arrived. Phishing doesn't bother.
- **No Reply-To.** An address nobody can answer looks automated in the bad way.

All four are fixed: `src/lib/email-html.ts` renders a proper HTML part with the
sender identity, a real button, the destination URL shown in full underneath,
and a footer naming the recipient and why they got it. `MAIL_REPLY_TO` sets a
reply address. The subject moved from "Your fittlist sign-in link" to "Sign in
to fittlist" — a subject that isn't *about* a link scores better.

## What matters more (check this)

Content is maybe a third of the problem. Authentication is the rest, and none
of it lives in this repo:

1. **DKIM must be verified in Resend for `fittlist.co`.** Open the Resend
   dashboard → Domains. If it isn't green, nothing else on this list matters —
   unsigned mail from a young domain goes to spam essentially every time.
2. **SPF.** Resend's TXT record on the sending domain, and *only one* SPF
   record on it — two SPF records is a hard fail, not a merge.
3. **DMARC.** At minimum `v=DMARC1; p=none; rua=mailto:you@fittlist.co`.
   Having a DMARC record at all is a positive signal, and `rua` reports tell
   you who's failing.
4. **`MAIL_FROM` must be on the verified domain.** `hello@fittlist.co` only
   works if `fittlist.co` is the domain Resend signed. A from-address on an
   unverified domain fails DKIM alignment even when DKIM itself is set up.
5. **Consider a subdomain for mail** — `mail.fittlist.co` or
   `notify.fittlist.co`. It keeps sending reputation separate from the apex
   domain, so a bad week of bounces can't hurt the main domain.

## Reputation, which takes time

A domain that has never sent mail has no reputation, and "no reputation" is
treated closer to "bad" than to "good". This improves on its own as real people
receive and open the mail. Two things speed it up and one thing wrecks it:

- **Ask beta coaches to mark it Not Spam** and, better, reply to it. A reply is
  the strongest positive signal there is.
- **Keep bounce rates near zero.** Never send to an address someone typed
  wrong twice.
- **Don't mix bulk and transactional on one domain** if the digests ever grow
  large. Sign-in mail must never be delayed behind a newsletter's reputation.

## Testing it

Send yourself a link and check the result at [mail-tester.com](https://www.mail-tester.com)
— it scores the message and names every failing check, including the DNS ones.
Anything below 8/10 will land in spam somewhere.
