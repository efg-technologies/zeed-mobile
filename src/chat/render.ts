// Parse an assistant message into a sequence of renderable segments.
// Markdown is the default; a fenced ```zeed-graph block carries a
// {nodes, edges} JSON payload that the UI renders as a node-edge diagram.

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type Segment =
  | { type: 'markdown'; text: string }
  | { type: 'graph'; data: GraphData }
  | { type: 'graph_error'; raw: string; error: string };

const GRAPH_RE = /```zeed-graph\s*\n([\s\S]*?)\n```/g;

export function parseAssistantMessage(input: string): Segment[] {
  if (!input) return [];
  const out: Segment[] = [];
  let lastIndex = 0;
  GRAPH_RE.lastIndex = 0;
  for (;;) {
    const m = GRAPH_RE.exec(input);
    if (!m) break;
    if (m.index > lastIndex) {
      const md = input.slice(lastIndex, m.index);
      if (md.trim()) out.push({ type: 'markdown', text: md });
    }
    out.push(parseGraphBlock(m[1] ?? ''));
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < input.length) {
    const tail = input.slice(lastIndex);
    if (tail.trim()) out.push({ type: 'markdown', text: tail });
  }
  if (out.length === 0) out.push({ type: 'markdown', text: input });
  return out;
}

export function parseGraphBlock(raw: string): Segment {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    return { type: 'graph_error', raw, error: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { type: 'graph_error', raw, error: 'not an object' };
  }
  const p = parsed as Record<string, unknown>;
  const nodes = Array.isArray(p.nodes) ? p.nodes.filter(isGraphNode) : [];
  const edges = Array.isArray(p.edges) ? p.edges.filter(isGraphEdge) : [];
  if (nodes.length === 0) return { type: 'graph_error', raw, error: 'no nodes' };
  // Drop edges that reference unknown nodes; a malformed edge shouldn't
  // blow up the whole render.
  const ids = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { type: 'graph', data: { nodes, edges: validEdges } };
}

function isGraphNode(x: unknown): x is GraphNode {
  return !!x && typeof x === 'object'
    && typeof (x as GraphNode).id === 'string'
    && typeof (x as GraphNode).label === 'string';
}
function isGraphEdge(x: unknown): x is GraphEdge {
  return !!x && typeof x === 'object'
    && typeof (x as GraphEdge).from === 'string'
    && typeof (x as GraphEdge).to === 'string'
    && (typeof (x as GraphEdge).label === 'string' || (x as GraphEdge).label === undefined);
}
