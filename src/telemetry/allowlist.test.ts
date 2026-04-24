import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_FIELDS, ALLOWED_FEATURES, ALLOWED_END_REASONS, stripToAllowlist,
} from './allowlist.ts';

test('ALLOWED_FIELDS: install has install_id + version + os', () => {
  assert.deepEqual(
    [...ALLOWED_FIELDS.install].sort(),
    ['event', 'install_id', 'os', 'version'],
  );
});

test('ALLOWED_FIELDS: heartbeat / session_start have install_id + version only', () => {
  assert.deepEqual([...ALLOWED_FIELDS.heartbeat].sort(), ['event', 'install_id', 'version']);
  assert.deepEqual([...ALLOWED_FIELDS.session_start].sort(), ['event', 'install_id', 'version']);
});

test('ALLOWED_FIELDS: agent_run does not carry goal / url / pii', () => {
  const fields = [...ALLOWED_FIELDS.agent_run];
  for (const bad of ['goal', 'url', 'user', 'prompt', 'response']) {
    assert.ok(!fields.includes(bad), `agent_run allowlist leaks "${bad}"`);
  }
});

test('stripToAllowlist: unknown keys are dropped', () => {
  const r = stripToAllowlist({
    event: 'install',
    install_id: 'abc',
    version: 'mobile/0.1.0',
    os: 'ios',
    // Fields that must NOT survive:
    goal: 'remember me',
    url: 'https://example.com/private',
    email: 'a@b.c',
  } as unknown as { event: 'install' });
  assert.deepEqual(Object.keys(r).sort(), ['event', 'install_id', 'os', 'version']);
});

test('stripToAllowlist: heartbeat drops feature', () => {
  const r = stripToAllowlist({
    event: 'heartbeat', install_id: 'x', version: 'v', feature: 'bookmark_add',
  } as unknown as { event: 'heartbeat' });
  assert.ok(!('feature' in r));
});

test('stripToAllowlist: agent_run passes through declared fields', () => {
  const r = stripToAllowlist({
    event: 'agent_run', success: true, step_count: 3, end_reason: 'finish', version: 'v',
  } as unknown as { event: 'agent_run' });
  assert.equal(r.success, true);
  assert.equal(r.step_count, 3);
  assert.equal(r.end_reason, 'finish');
});

test('ALLOWED_FEATURES contains core mobile features', () => {
  for (const f of ['bookmark_add', 'tab_new', 'mode_auto', 'share']) {
    assert.ok((ALLOWED_FEATURES as readonly string[]).includes(f));
  }
});

test('ALLOWED_END_REASONS covers agent loop ends', () => {
  for (const r of ['finish', 'needs_autopilot', 'max_steps', 'aborted']) {
    assert.ok((ALLOWED_END_REASONS as readonly string[]).includes(r));
  }
});
