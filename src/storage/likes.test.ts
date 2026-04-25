import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addLike, isLiked, loadLikes, removeLike, saveLikes, toggleLike,
  type Like, type KvBackend,
} from './likes.ts';

function memKv(initial: Record<string, string> = {}): KvBackend {
  const store: Record<string, string> = { ...initial };
  return {
    async getItem(k) { return store[k] ?? null; },
    async setItem(k, v) { store[k] = v; },
  };
}

const L = (url: string, title = url, addedAt = 1): Like => ({ url, title, addedAt });

test('loadLikes: empty → []', async () => {
  assert.deepEqual(await loadLikes(memKv()), []);
});

test('loadLikes: malformed → []', async () => {
  assert.deepEqual(await loadLikes(memKv({ 'zeed.likes.v1': 'bad' })), []);
});

test('save → load roundtrip', async () => {
  const kv = memKv();
  await saveLikes(kv, [L('https://a')]);
  assert.deepEqual((await loadLikes(kv)).map((x) => x.url), ['https://a']);
});

test('isLiked: true / false', () => {
  assert.equal(isLiked([L('https://a')], 'https://a'), true);
  assert.equal(isLiked([L('https://a')], 'https://b'), false);
});

test('addLike: prepends, dedupes', () => {
  const a = addLike([], 'https://a', 'A', 1);
  assert.equal(a.length, 1);
  const b = addLike(a, 'https://a', 'A', 2);
  assert.equal(b.length, 1);
});

test('removeLike: drops url', () => {
  const next = removeLike([L('https://a'), L('https://b')], 'https://a');
  assert.equal(next.length, 1);
  assert.equal(next[0]!.url, 'https://b');
});

test('toggleLike: add then remove', () => {
  const a = toggleLike([], 'https://a', 'A', 1);
  assert.equal(a.length, 1);
  const b = toggleLike(a, 'https://a', 'A', 2);
  assert.equal(b.length, 0);
});

test('likes + bookmarks use distinct storage keys', async () => {
  const kv = memKv();
  await saveLikes(kv, [L('https://a')]);
  const raw = await kv.getItem('zeed.likes.v1');
  assert.ok(raw && raw.includes('https://a'));
  assert.equal(await kv.getItem('zeed.bookmarks.v1'), null);
});
