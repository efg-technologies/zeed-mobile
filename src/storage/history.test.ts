import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadHistory, saveHistory, recordVisit, searchHistory,
  type HistoryEntry, type KvBackend,
} from './history.ts';

function memKv(initial: Record<string, string> = {}): KvBackend {
  const store: Record<string, string> = { ...initial };
  return {
    async getItem(k) { return store[k] ?? null; },
    async setItem(k, v) { store[k] = v; },
  };
}

const E = (url: string, title: string, visitCount = 1, lastVisited = 1): HistoryEntry =>
  ({ url, title, visitCount, lastVisited });

test('loadHistory: empty → []', async () => {
  assert.deepEqual(await loadHistory(memKv()), []);
});

test('loadHistory: malformed → []', async () => {
  assert.deepEqual(await loadHistory(memKv({ 'zeed.history.v1': 'bad' })), []);
});

test('save → load roundtrip', async () => {
  const kv = memKv();
  const list = [E('https://a', 'A')];
  await saveHistory(kv, list);
  assert.deepEqual(await loadHistory(kv), list);
});

test('recordVisit: inserts new entry at front', () => {
  const next = recordVisit([], 'https://a', 'A', 42);
  assert.equal(next.length, 1);
  assert.equal(next[0]!.visitCount, 1);
  assert.equal(next[0]!.lastVisited, 42);
});

test('recordVisit: increments visitCount and moves to front', () => {
  const list = [E('https://a', 'A', 1, 1), E('https://b', 'B', 5, 2)];
  const next = recordVisit(list, 'https://a', 'A', 99);
  assert.equal(next[0]!.url, 'https://a');
  assert.equal(next[0]!.visitCount, 2);
  assert.equal(next[0]!.lastVisited, 99);
  assert.equal(next[1]!.url, 'https://b');
});

test('recordVisit: updates title on revisit', () => {
  const next = recordVisit([E('https://a', 'Old', 1, 1)], 'https://a', 'New Title', 2);
  assert.equal(next[0]!.title, 'New Title');
});

test('recordVisit: keeps old title when new title empty', () => {
  const next = recordVisit([E('https://a', 'Kept', 1, 1)], 'https://a', '', 2);
  assert.equal(next[0]!.title, 'Kept');
});

test('recordVisit: ignores about:blank', () => {
  assert.deepEqual(recordVisit([], 'about:blank', '', 1), []);
});

test('recordVisit: caps at 1000 entries', () => {
  let list: HistoryEntry[] = [];
  for (let i = 0; i < 1005; i++) {
    list = recordVisit(list, `https://a${i}`, `A${i}`, i);
  }
  assert.equal(list.length, 1000);
  // Newest first
  assert.equal(list[0]!.url, 'https://a1004');
});

test('searchHistory: empty query → []', () => {
  assert.deepEqual(searchHistory([E('https://a', 'A')], ''), []);
});

test('searchHistory: substring match on url', () => {
  const list = [E('https://github.com', 'GitHub'), E('https://google.com', 'Google')];
  const r = searchHistory(list, 'git');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.url, 'https://github.com');
});

test('searchHistory: substring match on title', () => {
  const list = [E('https://a.example', 'Zeed Mobile'), E('https://b.example', 'Other')];
  const r = searchHistory(list, 'zeed');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.url, 'https://a.example');
});

test('searchHistory: host prefix outranks substring', () => {
  const list = [
    E('https://other.example/qiita', 'Other', 10, 100),
    E('https://qiita.com', 'Qiita', 1, 1),
  ];
  const r = searchHistory(list, 'qiita');
  assert.equal(r[0]!.url, 'https://qiita.com');
});

test('searchHistory: ranks by recency within same score bucket', () => {
  const list = [
    E('https://zeed.a', 'Zeed A', 1, 1),
    E('https://zeed.b', 'Zeed B', 1, 5),
  ];
  const r = searchHistory(list, 'zeed');
  assert.equal(r[0]!.url, 'https://zeed.b');
});

test('searchHistory: case-insensitive', () => {
  const r = searchHistory([E('https://GitHub.com', 'GitHub')], 'GITHUB');
  assert.equal(r.length, 1);
});

test('searchHistory: limit respected', () => {
  const list = Array.from({ length: 20 }, (_, i) => E(`https://z${i}.com`, `Z${i}`, 1, i));
  const r = searchHistory(list, 'z', 5);
  assert.equal(r.length, 5);
});
