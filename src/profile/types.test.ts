import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILES, defaultGroupFor } from './types.ts';

test('DEFAULT_PROFILES: Personal is public, Private is private', () => {
  const p = DEFAULT_PROFILES.find((x) => x.id === 'personal');
  const q = DEFAULT_PROFILES.find((x) => x.id === 'private');
  assert.equal(p?.private, false);
  assert.equal(q?.private, true);
});

test('defaultGroupFor: group belongs to profile, stable id', () => {
  const g = defaultGroupFor('personal');
  assert.equal(g.profileId, 'personal');
  assert.match(g.id, /personal:/);
});
