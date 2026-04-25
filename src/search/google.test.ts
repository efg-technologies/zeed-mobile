import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGoogleSuggestions, parseSuggestions } from './google.ts';

test('parseSuggestions: canonical shape', () => {
  assert.deepEqual(parseSuggestions(['q', ['a', 'b', 'c']]), ['a', 'b', 'c']);
});

test('parseSuggestions: extra trailing arrays ignored', () => {
  assert.deepEqual(parseSuggestions(['q', ['a'], {}, []]), ['a']);
});

test('parseSuggestions: non-array → []', () => {
  assert.deepEqual(parseSuggestions(null), []);
  assert.deepEqual(parseSuggestions({}), []);
});

test('parseSuggestions: filters non-string', () => {
  assert.deepEqual(parseSuggestions(['q', ['a', 1, null, 'b']]), ['a', 'b']);
});

test('parseSuggestions: caps at 10', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `s${i}`);
  assert.equal(parseSuggestions(['q', twenty]).length, 10);
});

test('fetchGoogleSuggestions: empty query → []', async () => {
  const r = await fetchGoogleSuggestions('   ', {
    fetch: async () => { throw new Error('should not fetch'); },
  });
  assert.deepEqual(r, []);
});

test('fetchGoogleSuggestions: happy path', async () => {
  let capturedUrl = '';
  const fetchMock = async (url: string) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ['hello', ['hello world', 'hello fresh']],
    };
  };
  const r = await fetchGoogleSuggestions('hello', { fetch: fetchMock });
  assert.deepEqual(r, ['hello world', 'hello fresh']);
  assert.ok(capturedUrl.includes('client=firefox'));
  assert.ok(capturedUrl.includes('q=hello'));
});

test('fetchGoogleSuggestions: non-200 → []', async () => {
  const r = await fetchGoogleSuggestions('hi', {
    fetch: async () => ({ ok: false, status: 500, json: async () => null }),
  });
  assert.deepEqual(r, []);
});

test('fetchGoogleSuggestions: network error → []', async () => {
  const r = await fetchGoogleSuggestions('hi', {
    fetch: async () => { throw new Error('boom'); },
  });
  assert.deepEqual(r, []);
});

test('fetchGoogleSuggestions: URL-encodes query', async () => {
  let capturedUrl = '';
  await fetchGoogleSuggestions('日本 語', {
    fetch: async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ['', []] };
    },
  });
  assert.ok(capturedUrl.includes('%E6%97%A5%E6%9C%AC'));
  assert.ok(capturedUrl.includes('%20'));
});
