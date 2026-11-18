// Story-graph logic, independent of the UI.
import { asList, entityName, normalizeRequires, type Entity } from './schema';

export type StoryEdgeKind = 'all' | 'any' | 'excludes';

export interface StoryEdge {
  id: string;
  kind: StoryEdgeKind;
  source: string; // for requires: the prerequisite; for excludes: alphabetically first
  target: string;
}

export function storyEdges(nodes: Entity[]): StoryEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: StoryEdge[] = [];
  const seenExcl = new Set<string>();
  for (const n of nodes) {
    const r = normalizeRequires(n.data.requires);
    for (const p of r.all) if (ids.has(p)) out.push({ id: `all:${p}>${n.id}`, kind: 'all', source: p, target: n.id });
    for (const p of r.any) if (ids.has(p)) out.push({ id: `any:${p}>${n.id}`, kind: 'any', source: p, target: n.id });
    for (const x of asList(n.data.excludes)) {
      if (!ids.has(x)) continue;
      const [a, b] = [n.id, x].sort();
      const key = `x:${a}~${b}`;
      if (seenExcl.has(key)) continue;
      seenExcl.add(key);
      out.push({ id: key, kind: 'excludes', source: a, target: b });
    }
  }
  return out;
}

const prereqs = (n: Entity) => {
  const r = normalizeRequires(n.data.requires);
  return [...r.all, ...r.any];
};

/** Would making `target` require `source` create a cycle? (i.e. is target already an ancestor of source) */
export function wouldCycle(nodes: Entity[], source: string, target: string): boolean {
  if (source === target) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stack = [source];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = byId.get(cur);
    if (n) stack.push(...prereqs(n));
  }
  return false;
}

/** Left-to-right layered layout: column = longest chain of prerequisites. */
export function autoLayout(nodes: Entity[]): Record<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const n = byId.get(id);
    const ps = n ? prereqs(n).filter((p) => byId.has(p)) : [];
    const v = ps.length ? Math.max(...ps.map(d)) + 1 : 0;
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  nodes.forEach((n) => d(n.id));

  const columns = new Map<number, Entity[]>();
  for (const n of nodes) {
    const c = depth.get(n.id)!;
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c)!.push(n);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  const rowOf = new Map<string, number>();
  for (const c of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(c)!;
    // Order by the average row of prerequisites to reduce crossings.
    const score = (n: Entity) => {
      const rows = prereqs(n).map((p) => rowOf.get(p)).filter((r): r is number => r !== undefined);
      return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
    };
    col.sort((a, b) => score(a) - score(b) || entityName(a).localeCompare(entityName(b)));
    const offset = -((col.length - 1) * 150) / 2;
    col.forEach((n, i) => {
      rowOf.set(n.id, i - (col.length - 1) / 2);
      pos[n.id] = { x: c * 320, y: offset + i * 150 };
    });
  }
  return pos;
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  nodeId?: string;
  message: string;
}

/** Sanity checks on the story graph. */
export function analyzeStory(nodes: Entity[]): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => (byId.get(id) ? `“${entityName(byId.get(id)!)}”` : `“${id}”`);

  if (nodes.length && !nodes.some((n) => n.data.kind === 'start'))
    issues.push({ level: 'info', message: 'No node has kind “start”. Nodes without requirements are available from the beginning.' });

  const excl = new Map<string, Set<string>>();
  const addEx = (a: string, b: string) => {
    if (!excl.has(a)) excl.set(a, new Set());
    excl.get(a)!.add(b);
  };

  for (const n of nodes) {
    const r = normalizeRequires(n.data.requires);
    for (const p of [...r.all, ...r.any])
      if (!byId.has(p)) issues.push({ level: 'error', nodeId: n.id, message: `${label(n.id)} requires missing node “${p}”.` });
    for (const x of asList(n.data.excludes)) {
      if (!byId.has(x)) issues.push({ level: 'error', nodeId: n.id, message: `${label(n.id)} excludes missing node “${x}”.` });
      addEx(n.id, x);
      addEx(x, n.id);
    }
    if (r.any.length === 1)
      issues.push({ level: 'info', nodeId: n.id, message: `${label(n.id)} has only one “any of” requirement — it behaves like “all of”.` });
    if (wouldCycleSelf(n.id, byId))
      issues.push({ level: 'error', nodeId: n.id, message: `${label(n.id)} is part of a requirement cycle — it can never be reached.` });
  }

  // Must-have ancestors: every node reachable through "all of" edges.
  const must = new Map<string, Set<string>>();
  const mustOf = (id: string, stack = new Set<string>()): Set<string> => {
    if (must.has(id)) return must.get(id)!;
    if (stack.has(id)) return new Set();
    stack.add(id);
    const s = new Set<string>();
    const n = byId.get(id);
    if (n)
      for (const p of normalizeRequires(n.data.requires).all) {
        s.add(p);
        mustOf(p, stack).forEach((x) => s.add(x));
      }
    stack.delete(id);
    must.set(id, s);
    return s;
  };

  for (const n of nodes) {
    const m = new Set([...mustOf(n.id), n.id]);
    let found = false;
    for (const a of m) {
      for (const b of excl.get(a) ?? []) {
        if (m.has(b)) {
          issues.push({
            level: 'error',
            nodeId: n.id,
            message: `${label(n.id)} is unreachable: it needs both ${label(a)} and ${label(b)}, which exclude each other.`,
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  const hasDependents = new Set(nodes.flatMap(prereqs));
  for (const n of nodes) {
    if (n.data.kind !== 'ending' && !hasDependents.has(n.id) && nodes.length > 1)
      issues.push({ level: 'warning', nodeId: n.id, message: `${label(n.id)} leads nowhere (no node requires it and it isn't an ending).` });
  }
  return issues;
}

function wouldCycleSelf(id: string, byId: Map<string, Entity>): boolean {
  const start = byId.get(id);
  if (!start) return false;
  const stack = [...prereqs(start)];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = byId.get(cur);
    if (n) stack.push(...prereqs(n));
  }
  return false;
}
