const BLOCKED_MESSAGE = "That text can’t be posted. Please rewrite it and try again.";

/**
 * A deliberately conservative, deterministic first-pass guard for user text.
 * It only catches high-confidence abuse that should never be published. It is
 * not a substitute for reports and human review (context and coded language
 * need those), which is why callers reject rather than silently rewriting.
 */
export function objectionableContentError(...values: Array<string | null | undefined>): string | null {
  const raw = values.filter(Boolean).join(" \n ");
  if (!raw) return null;
  const plain = raw
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[013457@$]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
      "@": "a", "$": "s",
    })[character] ?? character)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const directThreat = /\b(?:(?:i|we) (?:will|ll|am going to|are going to|m going to|re going to|m gonna|re gonna)|gonna) (?:kill|shoot|stab|rape|murder|hurt) (?:you|him|her|them)\b/.test(plain);
  const selfHarmAttack = /\b(?:go )?(?:kill yourself|kys)\b/.test(plain);
  const sexualizedMinor = /\b(?:child|kid|minor|underage|preteen|toddler)s?\b.{0,45}\b(?:nude|porn|sex|sexual|rape)\b|\b(?:nude|porn|sex|sexual|rape)\b.{0,45}\b(?:child|kid|minor|underage|preteen|toddler)s?\b/.test(plain);
  // Optional whitespace catches simple punctuation/spacing evasions, while
  // the word edges keep ordinary words such as "spicy" from matching.
  const explicitSlur = /(?:^|\s)(?:n\s*i\s*g\s*g\s*e\s*r|f\s*a\s*g\s*g\s*o\s*t|k\s*i\s*k\s*e|c\s*h\s*i\s*n\s*k|s\s*p\s*i\s*c)s?(?:\s|$)/.test(plain);

  return directThreat || selfHarmAttack || sexualizedMinor || explicitSlur ? BLOCKED_MESSAGE : null;
}
