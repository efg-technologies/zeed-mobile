import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEYS,
  setSecureBackend,
  getSecret,
  setSecret,
  clearSecret,
  createMemoryBackend,
} from './secure.ts';

test('getSecret: throws before backend initialized', async () => {
  setSecureBackend(null as never);
  // Reset via re-init with memory to keep test isolated
  try {
    await getSecret(KEYS.openrouterApiKey);
    assert.fail('expected throw');
  } catch (e) {
    assert.match((e as Error).message, /not initialized/);
  }
});

test('setSecret + getSecret: round-trip', async () => {
  setSecureBackend(createMemoryBackend());
  await setSecret(KEYS.openrouterApiKey, 'sk-or-v1-abc');
  assert.equal(await getSecret(KEYS.openrouterApiKey), 'sk-or-v1-abc');
});

test('getSecret: returns null when empty', async () => {
  setSecureBackend(createMemoryBackend());
  assert.equal(await getSecret(KEYS.openrouterApiKey), null);
});

test('setSecret with empty string deletes', async () => {
  setSecureBackend(createMemoryBackend());
  await setSecret(KEYS.openrouterApiKey, 'v');
  await setSecret(KEYS.openrouterApiKey, '');
  assert.equal(await getSecret(KEYS.openrouterApiKey), null);
});

test('clearSecret: removes', async () => {
  setSecureBackend(createMemoryBackend());
  await setSecret(KEYS.autopilotToken, 'tok');
  await clearSecret(KEYS.autopilotToken);
  assert.equal(await getSecret(KEYS.autopilotToken), null);
});

test('setSecret: non-string throws', async () => {
  setSecureBackend(createMemoryBackend());
  await assert.rejects(
    () => setSecret(KEYS.openrouterApiKey, 123 as unknown as string),
    /must be a string/,
  );
});

test('keys are isolated', async () => {
  setSecureBackend(createMemoryBackend());
  await setSecret(KEYS.openrouterApiKey, 'a');
  await setSecret(KEYS.autopilotToken, 'b');
  assert.equal(await getSecret(KEYS.openrouterApiKey), 'a');
  assert.equal(await getSecret(KEYS.autopilotToken), 'b');
});
