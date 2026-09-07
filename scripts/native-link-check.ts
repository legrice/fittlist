import assert from 'node:assert/strict';
import { nativeLinkDestination } from '../src/lib/native-navigation';
const origin = 'https://www.fittlist.co';
assert.equal(nativeLinkDestination('https://fittlist.co/calendar?day=2026-11-01#week', origin), `${origin}/calendar?day=2026-11-01#week`);
for (const link of ['https://evil.test/calendar', 'http://fittlist.co/', 'https://fittlist.co.evil.test/', 'https://user:pass@fittlist.co/', 'https://fittlist.co:444/', 'javascript:alert(1)', '/calendar', 'garbage']) {
  assert.equal(nativeLinkDestination(link, origin), null);
}
console.log('Native deep links: trusted paths preserved, eight unsafe/malformed links rejected');
