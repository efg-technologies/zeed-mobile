// Circular graph layout — pure function. Places nodes evenly around a
// circle centred in (w, h), leaving padding for labels.

import type { GraphData, GraphEdge, GraphNode } from './render.ts';

export interface LaidOutNode extends GraphNode {
  x: number;
  y: number;
}
export interface LaidOutEdge extends GraphEdge {
  x1: number; y1: number;
  x2: number; y2: number;
}
export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

export function layoutCircular(
  data: GraphData,
  opts: { width: number; height: number; padding?: number } = { width: 320, height: 320 },
): Layout {
  const w = opts.width;
  const h = opts.height;
  const pad = opts.padding ?? 48;
  const radius = Math.max(0, Math.min(w, h) / 2 - pad);
  const cx = w / 2;
  const cy = h / 2;
  const n = data.nodes.length;

  const nodes: LaidOutNode[] = data.nodes.map((node, i) => {
    if (n === 1) return { ...node, x: cx, y: cy };
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  const byId = new Map(nodes.map((n_) => [n_.id, n_]));
  const edges: LaidOutEdge[] = [];
  for (const e of data.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    edges.push({ ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  return { nodes, edges, width: w, height: h };
}
