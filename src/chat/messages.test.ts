import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLastUserMessageIndex, truncateBeforeIndex } from './messages.ts';
import type { ChatMsg } from './messages.ts';

const u = (content: string): ChatMsg => ({ role: 'user', content });
const a = (content: string): ChatMsg => ({ role: 'assistant', content });
const s = (content: string): ChatMsg => ({ role: 'system', content });

test('findLastUserMessageIndex: empty array → -1', () => {
  assert.equal(findLastUserMessageIndex([]), -1);
});

test('findLastUserMessageIndex: no user messages → -1', () => {
  assert.equal(findLastUserMessageIndex([s('boot'), a('hi')]), -1);
});

test('findLastUserMessageIndex: single user → 0', () => {
  assert.equal(findLastUserMessageIndex([u('hi')]), 0);
});

test('findLastUserMessageIndex: skips assistant/system after user', () => {
  // [user, system, system, assistant] — last user is index 0
  const arr = [u('go'), s('step 1'), s('step 2'), a('done')];
  assert.equal(findLastUserMessageIndex(arr), 0);
});

test('findLastUserMessageIndex: multi-turn returns latest user', () => {
  const arr = [u('first'), a('reply'), u('second'), a('reply2')];
  assert.equal(findLastUserMessageIndex(arr), 2);
});

test('truncateBeforeIndex: drops the message at idx and everything after', () => {
  const arr = [u('first'), a('reply'), u('second'), a('reply2')];
  const t = truncateBeforeIndex(arr, 2);
  assert.deepEqual(t, [u('first'), a('reply')]);
});

test('truncateBeforeIndex: idx 0 → empty array', () => {
  assert.deepEqual(truncateBeforeIndex([u('hi'), a('yo')], 0), []);
});

test('truncateBeforeIndex: out-of-range returns copy', () => {
  const arr = [u('a'), a('b')];
  assert.deepEqual(truncateBeforeIndex(arr, 99), arr);
  assert.deepEqual(truncateBeforeIndex(arr, -1), arr);
});

test('truncateBeforeIndex: returns a copy, not the original ref', () => {
  const arr = [u('a')];
  const t = truncateBeforeIndex(arr, 99);
  assert.notEqual(t, arr);
});
