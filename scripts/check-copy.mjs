// No em dashes in anything a user reads. House style, enforced rather than
// remembered — they creep back in one sentence at a time otherwise.
//
//   node scripts/check-copy.mjs
//
// Comments are exempt: they're for us, not for anyone using the app. Everything
// else in src/ is fair game — JSX text, string literals, email bodies.
//
// A line carrying `check-copy-ignore` (in the line itself or the comment above
// it) is skipped. There is one: the date header, "Wednesday — July 24", where a
// dash is the label's shape rather than punctuation in a sentence. Adding more
// exemptions should feel like a decision, not a convenience.
//
// An em dash almost always wants to be something else, and which one depends on
// what it was doing:
//   joining two independent clauses  ->  a full stop, or a semicolon
//   an aside in the middle           ->  a pair of commas, or parentheses
//   introducing a list or an answer  ->  a colon
//   a trailing afterthought          ->  a comma
// Reach for the one that fits. A hyphen is not a fix; it just looks like a typo.
import fs from "fs";
import path from "path";

const ROOT = "src";
const PRAGMA = "check-copy-ignore";
const BAD = [
  ["—", "em dash"],
  ["&mdash;", "&mdash; entity"],
  ["&#8212;", "&#8212; entity"],
];

/** Blank out comments so their contents don't count. Keeps offsets intact so
 *  reported columns still line up with the original line. */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode = "code"; // code | line | block | jsx | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (mode === "code") {
      if (two === "//") { mode = "line"; out += "  "; i += 2; continue; }
      if (two === "/*") { mode = "block"; out += "  "; i += 2; continue; }
      if (src.slice(i, i + 3) === "{/*") { mode = "jsx"; out += "   "; i += 3; continue; }
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      out += c; i += 1; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; i += 1; continue; }
      out += c === "\n" ? c : " "; i += 1; continue;
    }
    if (mode === "block") {
      if (two === "*/") { mode = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? c : " "; i += 1; continue;
    }
    if (mode === "jsx") {
      if (src.slice(i, i + 3) === "*/}") { mode = "code"; out += "   "; i += 3; continue; }
      out += c === "\n" ? c : " "; i += 1; continue;
    }
    // inside a string: copy through, honouring escapes so a quote in a URL or
    // an apostrophe doesn't end it early
    if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
      mode = "code";
    }
    out += c; i += 1;
  }
  return out;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

const hits = [];
for (const file of walk(ROOT)) {
  const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
  const raw = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, idx) => {
    // Match the pragma against the ORIGINAL line and the one above it: the
    // stripper has already blanked the comment it lives in.
    const exempt =
      raw[idx].includes(PRAGMA) || (idx > 0 && raw[idx - 1].includes(PRAGMA));
    if (exempt) return;
    for (const [needle, label] of BAD) {
      if (line.includes(needle)) hits.push({ file, line: idx + 1, label, text: raw[idx].trim() });
    }
  });
}

if (hits.length) {
  console.error(`\nNo em dashes in copy. ${hits.length} to rewrite:\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  (${h.label})\n    ${h.text}`);
  console.error(
    "\nRewrite the sentence rather than swapping in a hyphen. See the note at the" +
      "\ntop of scripts/check-copy.mjs for which punctuation fits which job.\n",
  );
  process.exit(1);
}
console.log("copy ok (no em dashes)");
