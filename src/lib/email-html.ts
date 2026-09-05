import { siteOrigin } from "@/lib/format";

// One HTML wrapper for outbound mail.
//
// A text/plain-only message whose body is a bare URL is the exact shape of a
// phishing mail, and filters treat it that way — our sign-in links were landing
// in spam. A well-formed multipart message with a real sender identity, the
// destination shown in full, and a line saying why it arrived reads as
// legitimate to both the filter and the person.

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const INK = "#020d08";
const ACCENT = "#8CF25F";
const MUTED = "#626762";

export function emailHtml({
  heading,
  body,
  cta,
  footer,
}: {
  heading: string;
  /** Paragraphs, in order. Plain text; escaped for you. */
  body: string[];
  cta?: { label: string; url: string };
  /** Why this arrived. Filters and people both want to know. */
  footer: string;
}): string {
  const origin = siteOrigin();
  const paras = body
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK}">${esc(p)}</p>`,
    )
    .join("");
  const button = cta
    ? `<p style="margin:24px 0 10px">
         <a href="${esc(cta.url)}" style="display:inline-block;background:${ACCENT};color:${INK};text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${esc(cta.label)}</a>
       </p>
       <p style="margin:0 0 4px;font-size:12px;color:${MUTED}">Or paste this into your browser:</p>
       <p style="margin:0 0 8px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${esc(cta.url)}" style="color:${MUTED}">${esc(cta.url)}</a></p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f4">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f4">
    <tr><td align="center" style="padding:28px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;border:1px solid #e1e4e1">
        <tr><td style="padding:26px 26px 22px;font-family:Helvetica,Arial,sans-serif">
          <p style="margin:0 0 18px;font-size:17px;font-weight:600;letter-spacing:-.02em;color:${INK}">
            <a href="${origin}" style="color:${INK};text-decoration:none"><img src="${origin}/icon-192.png" alt="" width="36" height="36" style="display:inline-block;vertical-align:middle;margin-right:9px;border:0;border-radius:8px">FittList</a>
          </p>
          <h1 style="margin:0 0 12px;font-size:21px;line-height:1.2;font-weight:600;letter-spacing:-.02em;color:${INK}">${esc(heading)}</h1>
          ${paras}
          ${button}
        </td></tr>
        <tr><td style="padding:0 26px 24px;font-family:Helvetica,Arial,sans-serif">
          <p style="margin:0;padding-top:16px;border-top:1px solid #e1e4e1;font-size:12px;line-height:1.5;color:${MUTED}">${esc(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
