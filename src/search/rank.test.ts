import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSuggestions, type Suggestion } from './rank.ts';

function base() {
  return {
    bookmarks: [],
    likes: [],
    history: [],
    googleSuggestions: [],
  };
}

test('empty query → []', () => {
  assert.deepEqual(rankSuggestions({ ...base(), query: '' }), []);
});

test('direct entry: URL-like query becomes "Go to site"', () => {
  const r = rankSuggestions({ ...base(), query: 'github.com' });
  assert.equal(r[0]!.source, 'direct');
  assert.equal(r[0]!.url, 'https://github.com');
  assert.equal(r[0]!.title, 'Go to site');
});

test('direct entry: plain word becomes Google search', () => {
  const r = rankSuggestions({ ...base(), query: 'qiita' });
  assert.equal(r[0]!.source, 'direct');
  assert.ok(r[0]!.url.includes('google.com/search'));
  assert.ok(r[0]!.title.includes('qiita'));
});

test('ordering: direct → bookmark → like → history → google', () => {
  const r = rankSuggestions({
    query: 'z',
    bookmarks: [{ url: 'https://z-bm.example', title: 'Zeed BM', addedAt: 1 }],
    likes: [{ url: 'https://z-like.example', title: 'Zeed Like', addedAt: 1 }],
    history: [
      { url: 'https://z-hist.example', title: 'Zeed Hist', visitCount: 1, lastVisited: 1 },
    ],
    googleSuggestions: ['zeed app'],
  });
  const sources = r.map((s) => s.source);
  assert.deepEqual(sources, ['direct', 'bookmark', 'like', 'history', 'google']);
});

test('dedupe: bookmark wins over history for same URL', () => {
  const shared = 'https://shared.example';
  const r = rankSuggestions({
    query: 'shared',
    bookmarks: [{ url: shared, title: 'BM', addedAt: 1 }],
    likes: [],
    history: [{ url: shared, title: 'Hist', visitCount: 5, lastVisited: 9 }],
    googleSuggestions: [],
  });
  const forShared = r.filter((s) => s.url === shared);
  assert.equal(forShared.length, 1);
  assert.equal(forShared[0]!.source, 'bookmark');
  assert.equal(forShared[0]!.title, 'BM');
});

test('dedupe: like wins over history', () => {
  const shared = 'https://shared.example';
  const r = rankSuggestions({
    query: 'shared',
    bookmarks: [],
    likes: [{ url: shared, title: 'Liked', addedAt: 1 }],
    history: [{ url: shared, title: 'H', visitCount: 1, lastVisited: 1 }],
    googleSuggestions: [],
  });
  const forShared = r.filter((s) => s.url === shared);
  assert.equal(forShared.length, 1);
  assert.equal(forShared[0]!.source, 'like');
});

test('bookmark substring match on title', () => {
  const r = rankSuggestions({
    ...base(),
    query: 'cool',
    bookmarks: [{ url: 'https://a.example', title: 'A Cool Thing', addedAt: 1 }],
  });
  assert.ok(r.some((s) => s.source === 'bookmark'));
});

test('limit respected', () => {
  const manyHist = Array.from({ length: 20 }, (_, i) => ({
    url: `https://h${i}.example`,
    title: `Hist ${i}`,
    visitCount: 1,
    lastVisited: i,
  }));
  const r = rankSuggestions({
    ...base(), query: 'hist', history: manyHist, limit: 5,
  });
  assert.equal(r.length, 5);
});

test('google suggestions: URL is google search', () => {
  const r = rankSuggestions({ ...base(), query: 'foo', googleSuggestions: ['foo bar'] });
  const g = r.find((s: Suggestion) => s.source === 'google');
  assert.ok(g);
  assert.ok(g.url.startsWith('https://www.google.com/search?q='));
  assert.equal(g.title, 'foo bar');
});

test('case-insensitive matching for bookmarks', () => {
  const r = rankSuggestions({
    ...base(),
    query: 'GITHUB',
    bookmarks: [{ url: 'https://github.com', title: 'GitHub', addedAt: 1 }],
  });
  assert.ok(r.some((s) => s.source === 'bookmark'));
});
