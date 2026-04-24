import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, loadSettings, normalize, saveSettings,
  type KvBackend,
} from './settings.ts';

function memKv(initial: Record<string, string> = {}): KvBackend {
  const store: Record<string, string> = { ...initial };
  return {
    async getItem(k) { return store[k] ?? null; },
    async setItem(k, v) { store[k] = v; },
  };
}

test('loadSettings: empty → defaults', async () => {
  assert.deepEqual(await loadSettings(memKv()), DEFAULT_SETTINGS);
});

test('loadSettings: malformed → defaults', async () => {
  const kv = memKv({ 'zeed.settings.v1': 'not json' });
  assert.deepEqual(await loadSettings(kv), DEFAULT_SETTINGS);
});

test('normalize: unknown fields ignored', () => {
  assert.deepEqual(normalize({ foo: 'bar' }), DEFAULT_SETTINGS);
});

test('normalize: non-boolean googleSuggestEnabled ignored', () => {
  assert.deepEqual(normalize({ googleSuggestEnabled: 'yes' }), DEFAULT_SETTINGS);
});

test('save → load roundtrip', async () => {
  const kv = memKv();
  await saveSettings(kv, { googleSuggestEnabled: true, telemetryAggregateEnabled: false });
  assert.deepEqual(await loadSettings(kv), {
    googleSuggestEnabled: true, telemetryAggregateEnabled: false,
  });
});

test('default googleSuggestEnabled is false (opt-in)', () => {
  assert.equal(DEFAULT_SETTINGS.googleSuggestEnabled, false);
});

test('default telemetryAggregateEnabled is true (opt-out, matches browser)', () => {
  assert.equal(DEFAULT_SETTINGS.telemetryAggregateEnabled, true);
});
