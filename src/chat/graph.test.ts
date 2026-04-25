import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutCircular } from './graph.ts';

test('single node centered', () => {
  const l = layoutCircular(
    { nodes: [{ id: 'a', label: 'A' }], edges: [] },
    { width: 200, height: 200 },
  );
  assert.equal(l.nodes[0]!.x, 100);
  assert.equal(l.nodes[0]!.y, 100);
});

test('n nodes placed on circle, first at top', () => {
  const l = layoutCircular(
    { nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ], edges: [] },
    { width: 200, height: 200, padding: 20 },
  );
  const [a, b, c, d] = l.nodes;
  // First node at top (y small), third at bottom (y large).
  assert.ok(a!.y < b!.y);
  assert.ok(c!.y > a!.y);
  // b is on the right, d on the left.
  assert.ok(b!.x > d!.x);
});

test('edges carry coordinates of endpoints', () => {
  const l = layoutCircular(
    { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [{ from: 'a', to: 'b', label: 'x' }] },
    { width: 100, height: 100 },
  );
  const e = l.edges[0]!;
  assert.equal(e.x1, l.nodes[0]!.x);
  assert.equal(e.y1, l.nodes[0]!.y);
  assert.equal(e.x2, l.nodes[1]!.x);
  assert.equal(e.y2, l.nodes[1]!.y);
  assert.equal(e.label, 'x');
});

test('edges referencing missing nodes are dropped', () => {
  const l = layoutCircular(
    { nodes: [{ id: 'a', label: 'A' }],
      edges: [{ from: 'a', to: 'missing' }] },
    { width: 100, height: 100 },
  );
  assert.equal(l.edges.length, 0);
});
