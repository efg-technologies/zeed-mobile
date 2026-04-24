import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRun, getRun, getResult, waitForCompletion } from './client.ts';

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Error): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const r = handler(String(url), init);
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseOpts = {
  endpoint: 'https://autopilot.zeed.run',
  bearerToken: 'test-token-12345',
};

test('startRun: rejects empty goal', async () => {
  const r = await startRun({ goal: '' }, baseOpts);
  assert.match(r.error ?? '', /at least 3 chars/);
});

test('startRun: rejects too-short goal', async () => {
  const r = await startRun({ goal: 'hi' }, baseOpts);
  assert.match(r.error ?? '', /at least 3 chars/);
});

test('startRun: posts to /v1/runs with goal + Bearer', async () => {
  let seenUrl = '', seenBody: string | null = null, seenAuth = '';
  const fetchImpl = mockFetch((url, init) => {
    seenUrl = url;
    seenBody = (init?.body as string) ?? null;
    seenAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
    return jsonResponse({ runId: 'run_abc' });
  });
  const r = await startRun({ goal: 'Search for restaurants' }, { ...baseOpts, fetchImpl });
  assert.equal(r.runId, 'run_abc');
  assert.equal(r.error, null);
  assert.equal(seenUrl, 'https://autopilot.zeed.run/v1/runs');
  assert.equal(seenAuth, 'Bearer test-token-12345');
  const body = JSON.parse(seenBody!);
  assert.equal(body.goal, 'Search for restaurants');
  assert.equal(body.constraints.maxSteps, 30);
  assert.equal(body.constraints.allowLogin, false);
});

test('startRun: passes custom constraints', async () => {
  let seenBody = '';
  const fetchImpl = mockFetch((_u, init) => {
    seenBody = (init?.body as string) ?? '';
    return jsonResponse({ runId: 'r1' });
  });
  await startRun(
    { goal: 'do a thing', constraints: { maxSteps: 10, maxSeconds: 60, allowLogin: true } },
    { ...baseOpts, fetchImpl },
  );
  const body = JSON.parse(seenBody);
  assert.equal(body.constraints.maxSteps, 10);
  assert.equal(body.constraints.maxSeconds, 60);
  assert.equal(body.constraints.allowLogin, true);
});

test('startRun: HTTP error returns error', async () => {
  const fetchImpl = mockFetch(() => new Response('', { status: 401 }));
  const r = await startRun({ goal: 'go now' }, { ...baseOpts, fetchImpl });
  assert.equal(r.error, 'HTTP 401');
});

test('startRun: network error returns error', async () => {
  const fetchImpl = mockFetch(() => new Error('ENETDOWN'));
  const r = await startRun({ goal: 'go now' }, { ...baseOpts, fetchImpl });
  assert.match(r.error ?? '', /network.*ENETDOWN/);
});

test('startRun: missing runId in response returns error', async () => {
  const fetchImpl = mockFetch(() => jsonResponse({}));
  const r = await startRun({ goal: 'go now' }, { ...baseOpts, fetchImpl });
  assert.match(r.error ?? '', /missing runId/);
});

test('getRun: fetches run status', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ runId: 'run_abc', status: 'running', startedAt: 1234567890 }),
  );
  const r = await getRun('run_abc', { ...baseOpts, fetchImpl });
  if ('error' in r) throw new Error('unexpected error');
  assert.equal(r.status, 'running');
  assert.equal(r.runId, 'run_abc');
});

test('getRun: URL-encodes runId', async () => {
  let seenUrl = '';
  const fetchImpl = mockFetch((url) => {
    seenUrl = url;
    return jsonResponse({ runId: 'r1', status: 'running', startedAt: 0 });
  });
  await getRun('with/slash', { ...baseOpts, fetchImpl });
  assert.match(seenUrl, /with%2Fslash/);
});

test('getResult: returns full result', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({
      ok: true,
      runId: 'r1',
      summary: 'done',
      facts: [{ text: 'fact 1', sourceUrl: 'https://example.com' }],
    }),
  );
  const r = await getResult('r1', { ...baseOpts, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.summary, 'done');
  assert.equal(r.facts.length, 1);
});

test('waitForCompletion: polls until terminal', async () => {
  let call = 0;
  const fetchImpl = mockFetch((url) => {
    call++;
    if (url.endsWith('/result')) {
      return jsonResponse({ ok: true, runId: 'r1', summary: 's', facts: [] });
    }
    if (call <= 2) return jsonResponse({ runId: 'r1', status: 'running', startedAt: 0 });
    return jsonResponse({ runId: 'r1', status: 'succeeded', startedAt: 0, endedAt: 1 });
  });
  const progress: string[] = [];
  const r = await waitForCompletion('r1', {
    ...baseOpts,
    fetchImpl,
    pollMs: 1,
    deadlineMs: 5000,
    onProgress: (run) => progress.push(run.status),
  });
  assert.equal(r.ok, true);
  assert.equal(r.summary, 's');
  assert.ok(progress.length >= 2);
  assert.equal(progress[progress.length - 1], 'succeeded');
});

test('waitForCompletion: respects deadline', async () => {
  const fetchImpl = mockFetch(() =>
    jsonResponse({ runId: 'r1', status: 'running', startedAt: 0 }),
  );
  const r = await waitForCompletion('r1', {
    ...baseOpts,
    fetchImpl,
    pollMs: 30,
    deadlineMs: 80,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /deadline exceeded/);
});

test('waitForCompletion: respects abort signal', async () => {
  const ac = new AbortController();
  const fetchImpl = mockFetch(() =>
    jsonResponse({ runId: 'r1', status: 'running', startedAt: 0 }),
  );
  setTimeout(() => ac.abort(), 20);
  const r = await waitForCompletion('r1', {
    ...baseOpts,
    fetchImpl,
    pollMs: 5,
    deadlineMs: 5000,
    signal: ac.signal,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /aborted/);
});
