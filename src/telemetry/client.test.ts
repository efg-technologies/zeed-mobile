import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateStringFor, getOrCreateInstallId,
  sendAgentRun, sendFeatureUsed, sendHeartbeatIfNewDay,
  sendInstallOnce, sendSessionStart, TELEMETRY_ENDPOINT,
  type KvBackend, type TelemetryDeps,
} from './client.ts';

function memKv(initial: Record<string, string> = {}): KvBackend {
  const store: Record<string, string> = { ...initial };
  return {
    async getItem(k) { return store[k] ?? null; },
    async setItem(k, v) { store[k] = v; },
  };
}

function makeDeps(overrides: Partial<TelemetryDeps> = {}): {
  deps: TelemetryDeps;
  posts: Array<{ url: string; body: unknown }>;
} {
  const posts: Array<{ url: string; body: unknown }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    // Unwrap the { events: [ev] } envelope for clearer assertions.
    const raw = JSON.parse(String(init?.body ?? '{}'));
    const body = raw.events?.[0] ?? raw;
    posts.push({ url: String(url), body });
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;
  const deps: TelemetryDeps = {
    kv: memKv(),
    fetch: fakeFetch,
    now: () => 1_700_000_000_000,
    randomHex: (n) => 'a'.repeat(n * 2),
    version: '0.1.0',
    os: 'ios',
    tierAEnabled: () => true,
    ...overrides,
  };
  return { deps, posts };
}

test('dateStringFor: zero-pads months and days', () => {
  assert.equal(dateStringFor(Date.UTC(2026, 0, 5, 12)), '2026-01-05');
});

test('getOrCreateInstallId: generates once and persists', async () => {
  const kv = memKv();
  const a = await getOrCreateInstallId(kv, () => 'deadbeefcafef00d');
  const b = await getOrCreateInstallId(kv, () => 'shouldnotbeused');
  assert.equal(a, 'deadbeefcafef00d');
  assert.equal(b, 'deadbeefcafef00d');
});

test('getOrCreateInstallId: rejects malformed stored id and regenerates', async () => {
  const kv = memKv({ 'zeed.telemetry.install_id': 'not hex!' });
  const id = await getOrCreateInstallId(kv, (n) => 'f'.repeat(n * 2));
  assert.match(id, /^f+$/);
});

test('sendInstallOnce: posts exactly once', async () => {
  const { deps, posts } = makeDeps();
  await sendInstallOnce(deps);
  await sendInstallOnce(deps);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.url, TELEMETRY_ENDPOINT);
  const body = posts[0]!.body as Record<string, unknown>;
  assert.equal(body.event, 'install');
  assert.equal(body.os, 'ios');
  assert.equal(body.version, '0.1.0');
  assert.ok(typeof body.install_id === 'string');
});

test('sendSessionStart: posts every call, no dedup', async () => {
  const { deps, posts } = makeDeps();
  await sendSessionStart(deps);
  await sendSessionStart(deps);
  assert.equal(posts.length, 2);
  assert.equal((posts[0]!.body as { event: string }).event, 'session_start');
});

test('sendHeartbeatIfNewDay: second same-day call is a no-op', async () => {
  const { deps, posts } = makeDeps();
  await sendHeartbeatIfNewDay(deps);
  await sendHeartbeatIfNewDay(deps);
  assert.equal(posts.length, 1);
});

test('sendHeartbeatIfNewDay: fires again on next day', async () => {
  const shared = memKv();
  const day1 = makeDeps({ kv: shared, now: () => Date.UTC(2026, 0, 1, 12) });
  await sendHeartbeatIfNewDay(day1.deps);
  const day2 = makeDeps({ kv: shared, now: () => Date.UTC(2026, 0, 2, 12) });
  await sendHeartbeatIfNewDay(day2.deps);
  assert.equal(day1.posts.length, 1);
  assert.equal(day2.posts.length, 1);
});

test('sendFeatureUsed: allowlisted feature posts', async () => {
  const { deps, posts } = makeDeps();
  await sendFeatureUsed(deps, 'bookmark_add');
  assert.equal(posts.length, 1);
  assert.equal((posts[0]!.body as { feature: string }).feature, 'bookmark_add');
});

test('sendFeatureUsed: unknown feature is dropped', async () => {
  const { deps, posts } = makeDeps();
  // @ts-expect-error intentionally off-allowlist
  await sendFeatureUsed(deps, 'exfiltrate_password');
  assert.equal(posts.length, 0);
});

test('sendAgentRun: clamps step_count to [0, 50]', async () => {
  const { deps, posts } = makeDeps();
  await sendAgentRun(deps, { success: false, stepCount: 1000, endReason: 'max_steps' });
  assert.equal((posts[0]!.body as { step_count: number }).step_count, 50);
});

test('sendAgentRun: allowlist drops any accidentally-added fields', async () => {
  const { deps, posts } = makeDeps();
  await sendAgentRun(deps, { success: true, stepCount: 3, endReason: 'finish' });
  const body = posts[0]!.body as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(body).sort(),
    ['end_reason', 'event', 'step_count', 'success', 'version'],
  );
});

test('tierAEnabled=false: nothing is posted', async () => {
  const { deps, posts } = makeDeps({ tierAEnabled: () => false });
  await sendInstallOnce(deps);
  await sendSessionStart(deps);
  await sendHeartbeatIfNewDay(deps);
  await sendFeatureUsed(deps, 'mode_auto');
  await sendAgentRun(deps, { success: true, stepCount: 1, endReason: 'finish' });
  assert.equal(posts.length, 0);
});

test('post wraps event in { events: [ev] } envelope (worker requires it)', async () => {
  let bodyString = '';
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodyString = String(init?.body ?? '');
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;
  const { deps } = makeDeps({ fetch: fakeFetch });
  await sendSessionStart(deps);
  const parsed = JSON.parse(bodyString);
  assert.ok(Array.isArray(parsed.events));
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].event, 'session_start');
});

test('fetch error is swallowed (does not throw)', async () => {
  const badFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
  const { deps } = makeDeps({ fetch: badFetch });
  await assert.doesNotReject(sendSessionStart(deps));
});
