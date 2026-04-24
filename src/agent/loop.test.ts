import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, observationToText, runAgent } from './loop.ts';
import type { AgentAction, PageObservation } from './loop.ts';

function obs(): PageObservation {
  return {
    url: 'https://example.com',
    title: 'Example',
    text: 'hello world',
    interactives: [
      { ref: 'r1', role: 'button', label: 'Sign in' },
      { ref: 'r2', role: 'link', label: 'About' },
    ],
  };
}

test('parseAction: plain JSON', () => {
  const r = parseAction('{"tool":"finish","summary":"done"}');
  assert.ok(!('error' in r));
  assert.equal((r as AgentAction).tool, 'finish');
});

test('parseAction: fenced JSON', () => {
  const r = parseAction('```json\n{"tool":"read_page"}\n```');
  assert.ok(!('error' in r));
  assert.equal((r as AgentAction).tool, 'read_page');
});

test('parseAction: unknown tool errors', () => {
  const r = parseAction('{"tool":"hax"}');
  assert.ok('error' in r);
  assert.match((r as { error: string }).error, /unknown tool/);
});

test('parseAction: invalid json errors', () => {
  const r = parseAction('not json');
  assert.ok('error' in r);
});

test('parseAction: missing tool errors', () => {
  const r = parseAction('{"label":"x"}');
  assert.ok('error' in r);
  assert.match((r as { error: string }).error, /missing tool/);
});

test('parseAction: accepts research tool', () => {
  const r = parseAction('{"tool":"research","query":"pen criteria"}');
  assert.ok(!('error' in r));
  if (!('error' in r)) {
    assert.equal(r.tool, 'research');
    assert.equal(r.query, 'pen criteria');
  }
});

test('observationToText: includes url + title + interactives', () => {
  const txt = observationToText(obs());
  assert.match(txt, /URL: https:\/\/example\.com/);
  assert.match(txt, /TITLE: Example/);
  assert.match(txt, /\[r1\] button: Sign in/);
});

test('runAgent: rejects short goal', async () => {
  const r = await runAgent('hi', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: '', error: null }),
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /at least 3 chars/);
});

test('runAgent: finish terminates ok', async () => {
  const r = await runAgent('search cats', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({
      response: '{"tool":"finish","summary":"found cats"}',
      error: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.summary, 'found cats');
  assert.equal(r.steps.length, 1);
});

test('runAgent: multi-step then finish', async () => {
  const responses = [
    '{"tool":"click_by_label","label":"Sign in","role":"button"}',
    '{"tool":"read_page"}',
    '{"tool":"finish","summary":"ok"}',
  ];
  let i = 0;
  const r = await runAgent('log in', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: responses[i++] ?? '{"tool":"finish"}', error: null }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.steps.length, 3);
});

test('runAgent: reason error halts', async () => {
  const r = await runAgent('do it', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: '', error: 'HTTP 429' }),
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /HTTP 429/);
});

test('runAgent: needs_autopilot suggests fallback', async () => {
  const r = await runAgent('hard task', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({
      response: '{"tool":"needs_autopilot","reason":"CAPTCHA"}',
      error: null,
    }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.suggestAutopilot, true);
  assert.match(r.error ?? '', /CAPTCHA/);
});

test('runAgent: 3 consecutive failures suggests autopilot', async () => {
  let i = 0;
  const r = await runAgent('do thing', {
    observe: async () => obs(),
    act: async () => ({ ok: false, error: 'element not found' }),
    reason: async () => ({
      response: `{"tool":"click_by_label","label":"try${i++}"}`,
      error: null,
    }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.suggestAutopilot, true);
  assert.equal(r.steps.length, 3);
});

test('runAgent: abort signal halts', async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await runAgent('go now', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: '{"tool":"finish"}', error: null }),
    signal: ac.signal,
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /aborted/);
});

test('runAgent: onStep callback fires', async () => {
  const steps: number[] = [];
  await runAgent('go now', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: '{"tool":"finish"}', error: null }),
    onStep: (s) => steps.push(s.index),
  });
  assert.deepEqual(steps, [0]);
});

test('runAgent: max steps bounded', async () => {
  const r = await runAgent('loop', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: '{"tool":"read_page"}', error: null }),
  }, { maxSteps: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.steps.length, 3);
  assert.match(r.error ?? '', /max steps/);
});

test('runAgent: research action feeds result back as user msg then finishes', async () => {
  const calls: string[] = [];
  const responses = [
    '{"tool":"research","query":"criteria for picking a pen"}',
    '{"tool":"finish","summary":"criteria: grip, ink, price"}',
  ];
  let i = 0;
  const r = await runAgent('pick the best pen for me', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    research: async (q) => { calls.push(q); return { result: 'grip, ink, price', error: null }; },
    reason: async () => ({ response: responses[i++]!, error: null }),
  });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /criteria for picking/);
  assert.match(r.summary, /criteria/);
});

test('runAgent: research with no dep wired is degraded, not fatal', async () => {
  const responses = [
    '{"tool":"research","query":"anything"}',
    '{"tool":"finish","summary":"did my best"}',
  ];
  let i = 0;
  const r = await runAgent('do a thing', {
    observe: async () => obs(),
    act: async () => ({ ok: true }),
    reason: async () => ({ response: responses[i++]!, error: null }),
    // no research dep
  });
  assert.equal(r.ok, true);
});
