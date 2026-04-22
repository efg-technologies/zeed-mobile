import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chat, DEFAULT_MODEL, SEARCH_MODEL, OPENROUTER_ENDPOINT } from './openrouter.ts';

function mockFetch(responses: Array<Response | Error>): typeof fetch {
  let i = 0;
  return (async () => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r as Response;
  }) as unknown as typeof fetch;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('chat: rejects empty API key', async () => {
  const r = await chat('', [{ role: 'user', content: 'hi' }]);
  assert.equal(r.error, 'OpenRouter API key missing or malformed');
  assert.equal(r.response, '');
});

test('chat: rejects too-short key', async () => {
  const r = await chat('short', [{ role: 'user', content: 'hi' }]);
  assert.match(r.error ?? '', /missing or malformed/);
});

test('chat: rejects empty messages array', async () => {
  const r = await chat('sk-or-v1-valid12345', []);
  assert.match(r.error ?? '', /non-empty array/);
});

test('chat: default model is z-ai/glm-5.1', async () => {
  let capturedBody = '';
  const fetchImpl: typeof fetch = (async (_url, init) => {
    capturedBody = (init?.body as string) ?? '';
    return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  }) as unknown as typeof fetch;
  await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  const body = JSON.parse(capturedBody);
  assert.equal(body.model, DEFAULT_MODEL);
});

test('chat: webSearch flag routes through sonar', async () => {
  let capturedBody = '';
  const fetchImpl: typeof fetch = (async (_u, init) => {
    capturedBody = (init?.body as string) ?? '';
    return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  }) as unknown as typeof fetch;
  await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], {
    webSearch: true,
    fetchImpl,
  });
  assert.equal(JSON.parse(capturedBody).model, SEARCH_MODEL);
});

test('chat: posts to correct endpoint', async () => {
  let capturedUrl = '';
  const fetchImpl: typeof fetch = (async (url) => {
    capturedUrl = String(url);
    return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  }) as unknown as typeof fetch;
  await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.equal(capturedUrl, OPENROUTER_ENDPOINT);
});

test('chat: attaches Authorization + referer headers', async () => {
  let capturedHeaders: Record<string, string> = {};
  const fetchImpl: typeof fetch = (async (_u, init) => {
    capturedHeaders = (init?.headers as Record<string, string>) ?? {};
    return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  }) as unknown as typeof fetch;
  await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.equal(capturedHeaders['Authorization'], 'Bearer sk-or-v1-dummy00');
  assert.equal(capturedHeaders['HTTP-Referer'], 'https://zeed.run');
  assert.equal(capturedHeaders['X-Title'], 'Zeed Mobile');
});

test('chat: returns response content on success', async () => {
  const fetchImpl = mockFetch([
    jsonResponse({
      choices: [{ message: { content: 'hello world' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }),
  ]);
  const r = await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.equal(r.response, 'hello world');
  assert.equal(r.error, null);
  assert.deepEqual(r.usage, { prompt_tokens: 5, completion_tokens: 2 });
});

test('chat: HTTP error returns error, no throw', async () => {
  const fetchImpl = mockFetch([
    new Response('rate limited', { status: 429 }),
  ]);
  const r = await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.equal(r.response, '');
  assert.match(r.error ?? '', /HTTP 429/);
});

test('chat: network failure returns error, no throw', async () => {
  const fetchImpl = mockFetch([new Error('ECONNREFUSED')]);
  const r = await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.match(r.error ?? '', /network.*ECONNREFUSED/);
});

test('chat: malformed JSON returns error', async () => {
  const fetchImpl: typeof fetch = (async () => {
    return new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  const r = await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.match(r.error ?? '', /invalid json/);
});

test('chat: missing choices[0].message.content → empty response, no error', async () => {
  const fetchImpl = mockFetch([jsonResponse({ choices: [] })]);
  const r = await chat('sk-or-v1-dummy00', [{ role: 'user', content: 'hi' }], { fetchImpl });
  assert.equal(r.response, '');
  assert.equal(r.error, null);
});
