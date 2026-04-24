import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBookmark, isBookmarked, loadBookmarks, removeBookmark, saveBookmarks,
  toggleBookmark, type Bookmark, type KvBackend,
} from './bookmarks.ts';

function memKv(initial: Record<string, string> = {}): KvBackend & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async getItem(k) { return store[k] ?? null; },
    async setItem(k, v) { store[k] = v; },
  };
}

const B = (url: string, title = url, addedAt = 1): Bookmark => ({ url, title, addedAt });

test('loadBookmarks: empty store → []', async () => {
  const kv = memKv();
  assert.deepEqual(await loadBookmarks(kv), []);
});

test('loadBookmarks: malformed JSON → []', async () => {
  const kv = memKv({ 'zeed.bookmarks.v1': 'not json' });
  assert.deepEqual(await loadBookmarks(kv), []);
});

test('loadBookmarks: non-array JSON → []', async () => {
  const kv = memKv({ 'zeed.bookmarks.v1': '{"x": 1}' });
  assert.deepEqual(await loadBookmarks(kv), []);
});

test('loadBookmarks: filters out malformed entries', async () => {
  const kv = memKv({
    'zeed.bookmarks.v1': JSON.stringify([
      { url: 'https://a', title: 'a', addedAt: 1 },
      { url: 'https://b' }, // missing fields
      null,
      { url: 'https://c', title: 'c', addedAt: 3 },
    ]),
  });
  const list = await loadBookmarks(kv);
  assert.equal(list.length, 2);
  assert.equal(list[0]!.url, 'https://a');
  assert.equal(list[1]!.url, 'https://c');
});

test('save → load roundtrip', async () => {
  const kv = memKv();
  const list = [B('https://a'), B('https://b')];
  await saveBookmarks(kv, list);
  assert.deepEqual(await loadBookmarks(kv), list);
});

test('isBookmarked: true for present url', () => {
  assert.equal(isBookmarked([B('https://a')], 'https://a'), true);
});

test('isBookmarked: false for absent url', () => {
  assert.equal(isBookmarked([B('https://a')], 'https://b'), false);
});

test('addBookmark: prepends new entry', () => {
  const next = addBookmark([B('https://a')], 'https://b', 'B', 42);
  assert.equal(next.length, 2);
  assert.equal(next[0]!.url, 'https://b');
  assert.equal(next[0]!.title, 'B');
  assert.equal(next[0]!.addedAt, 42);
});

test('addBookmark: dedupes', () => {
  const next = addBookmark([B('https://a')], 'https://a', 'A', 42);
  assert.equal(next.length, 1);
});

test('removeBookmark: drops matching url', () => {
  const next = removeBookmark([B('https://a'), B('https://b')], 'https://a');
  assert.deepEqual(next.map((x) => x.url), ['https://b']);
});

test('removeBookmark: no-op when absent', () => {
  const next = removeBookmark([B('https://a')], 'https://b');
  assert.equal(next.length, 1);
});

test('toggleBookmark: adds when absent', () => {
  const next = toggleBookmark([], 'https://a', 'A', 1);
  assert.equal(next.length, 1);
});

test('toggleBookmark: removes when present', () => {
  const next = toggleBookmark([B('https://a')], 'https://a', 'A', 1);
  assert.equal(next.length, 0);
});
