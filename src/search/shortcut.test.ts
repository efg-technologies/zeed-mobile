import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShortcut, type ShortcutContext } from './shortcut.ts';

const emptyCtx: ShortcutContext = { bookmarks: [], likes: [], history: [] };

test('empty query → null', () => {
  assert.equal(resolveShortcut('', emptyCtx), null);
});

test('multi-word query → null', () => {
  assert.equal(resolveShortcut('google search', emptyCtx), null);
});

test('dot in query → null (let normalize handle)', () => {
  assert.equal(resolveShortcut('google.com', emptyCtx), null);
});

test('punctuation → null', () => {
  assert.equal(resolveShortcut('hello!', emptyCtx), null);
  assert.equal(resolveShortcut('foo/bar', emptyCtx), null);
});

test('KNOWN fallback: google → google.com', () => {
  assert.equal(resolveShortcut('google', emptyCtx), 'https://www.google.com');
});

test('KNOWN fallback: case-insensitive', () => {
  assert.equal(resolveShortcut('GitHub', emptyCtx), 'https://github.com');
});

test('KNOWN fallback: unknown word → null', () => {
  assert.equal(resolveShortcut('zzzunknownword', emptyCtx), null);
});

test('history host prefix match beats KNOWN', () => {
  const ctx: ShortcutContext = {
    bookmarks: [], likes: [],
    history: [
      { url: 'https://google.co.jp', visitCount: 50, lastVisited: 1000 },
    ],
  };
  assert.equal(resolveShortcut('google', ctx), 'https://google.co.jp');
});

test('history: prefers higher visitCount', () => {
  const ctx: ShortcutContext = {
    bookmarks: [], likes: [],
    history: [
      { url: 'https://google.co.jp', visitCount: 5, lastVisited: 100 },
      { url: 'https://google.com', visitCount: 50, lastVisited: 200 },
    ],
  };
  assert.equal(resolveShortcut('google', ctx), 'https://google.com');
});

test('history: www prefix matched', () => {
  const ctx: ShortcutContext = {
    bookmarks: [], likes: [],
    history: [{ url: 'https://www.example.com', visitCount: 3, lastVisited: 1 }],
  };
  assert.equal(resolveShortcut('example', ctx), 'https://www.example.com');
});

test('bookmarks beat KNOWN when history absent', () => {
  const ctx: ShortcutContext = {
    bookmarks: [{ url: 'https://google-internal.example' }],
    likes: [], history: [],
  };
  // Not a match — different host
  assert.equal(resolveShortcut('google', ctx), 'https://www.google.com');
});

test('history beats bookmarks', () => {
  const ctx: ShortcutContext = {
    bookmarks: [{ url: 'https://example.com' }],
    likes: [],
    history: [{ url: 'https://example.org', visitCount: 1, lastVisited: 1 }],
  };
  assert.equal(resolveShortcut('example', ctx), 'https://example.org');
});

test('likes fall back when history + bookmarks empty', () => {
  const ctx: ShortcutContext = {
    bookmarks: [],
    likes: [{ url: 'https://custom.example' }],
    history: [],
  };
  assert.equal(resolveShortcut('custom', ctx), 'https://custom.example');
});

test('no match anywhere → null', () => {
  assert.equal(resolveShortcut('foobarbaz', emptyCtx), null);
});

test('hyphen in query accepted', () => {
  // Lowercased; 'x' is in KNOWN, but "x-com" isn't.
  assert.equal(resolveShortcut('x-twitter', emptyCtx), null);
});
