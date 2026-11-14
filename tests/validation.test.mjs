import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, normalizeLabels } from '../src/lib/validation.ts';

test('normalizes routing addresses before they are written', () => {
  assert.equal(normalizeEmail('  Research@NCAT.edu  '), 'research@ncat.edu');
});
test('rejects invalid and empty routing addresses', () => {
  for (const input of ['', ' ', 'person', 'person@', 'person @ncat.edu', 'person@ncat', 'a@@ncat.edu']) {
    assert.throws(() => normalizeEmail(input), /valid email/);
  }
});
test('preserves multi-word topic categories and their display spelling', () => {
  assert.deepEqual(normalizeLabels([' Research Opportunities ', 'Internships & Co-ops', 'Scholarships & Funding']),
    ['Research Opportunities', 'Internships & Co-ops', 'Scholarships & Funding']);
});
test('deduplicates topic labels without regard to case', () => {
  assert.deepEqual(normalizeLabels(['Research Opportunities', 'research opportunities', ' RESEARCH OPPORTUNITIES ']), ['Research Opportunities']);
});
test('allows clearing all labels and rejects blank or excessive labels', () => {
  assert.deepEqual(normalizeLabels([]), []);
  assert.throws(() => normalizeLabels(['   ']), /empty/);
  assert.throws(() => normalizeLabels(['a'.repeat(101)]), /100 characters/);
});
