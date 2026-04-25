import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAssistantMessage, parseGraphBlock } from './render.ts';

test('plain text → single markdown segment', () => {
  const r = parseAssistantMessage('hello world');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.type, 'markdown');
});

test('empty → []', () => {
  assert.deepEqual(parseAssistantMessage(''), []);
});

test('graph block alone', () => {
  const input = '```zeed-graph\n{"nodes":[{"id":"a","label":"A"}],"edges":[]}\n```';
  const r = parseAssistantMessage(input);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.type, 'graph');
});

test('markdown before + graph + markdown after', () => {
  const input = 'Intro\n\n```zeed-graph\n{"nodes":[{"id":"a","label":"A"}],"edges":[]}\n```\n\nOutro';
  const r = parseAssistantMessage(input);
  assert.equal(r.length, 3);
  assert.equal(r[0]!.type, 'markdown');
  assert.equal(r[1]!.type, 'graph');
  assert.equal(r[2]!.type, 'markdown');
});

test('multiple graph blocks', () => {
  const input =
    '```zeed-graph\n{"nodes":[{"id":"a","label":"A"}],"edges":[]}\n```\n'
    + 'middle\n'
    + '```zeed-graph\n{"nodes":[{"id":"b","label":"B"}],"edges":[]}\n```';
  const r = parseAssistantMessage(input);
  const types = r.map((s) => s.type);
  assert.deepEqual(types, ['graph', 'markdown', 'graph']);
});

test('invalid JSON → graph_error keeps rendering possible', () => {
  const input = '```zeed-graph\nnot json\n```';
  const r = parseAssistantMessage(input);
  assert.equal(r[0]!.type, 'graph_error');
});

test('no nodes → graph_error', () => {
  const s = parseGraphBlock('{"nodes":[],"edges":[]}');
  assert.equal(s.type, 'graph_error');
});

test('edges referencing unknown nodes are silently dropped', () => {
  const s = parseGraphBlock(
    '{"nodes":[{"id":"a","label":"A"}],"edges":[{"from":"a","to":"nope"}]}',
  );
  assert.equal(s.type, 'graph');
  if (s.type === 'graph') {
    assert.equal(s.data.edges.length, 0);
  }
});

test('malformed node entries are dropped but valid ones survive', () => {
  const s = parseGraphBlock(
    '{"nodes":[{"id":"a","label":"A"},{"id":"b"},null,{"id":"c","label":"C"}],"edges":[]}',
  );
  assert.equal(s.type, 'graph');
  if (s.type === 'graph') {
    assert.deepEqual(s.data.nodes.map((n) => n.id), ['a', 'c']);
  }
});

test('edges with label pass through', () => {
  const s = parseGraphBlock(
    '{"nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b","label":"relates"}]}',
  );
  assert.equal(s.type, 'graph');
  if (s.type === 'graph') {
    assert.equal(s.data.edges[0]!.label, 'relates');
  }
});
