import { TYPE_BY_KEY, asList, normalizeRequires, type Entity } from './schema';

/** [[target]] or [[target|label]] */
export const WIKI_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

/** Resolve a wiki-link target by id, falling back to a case-insensitive name/alias match. */
export function resolveLink(target: string, entities: Entity[], byId: Map<string, Entity>): Entity | undefined {
  const t = target.trim();
  const direct = byId.get(t);
  if (direct) return direct;
  const lower = t.toLowerCase();
  return entities.find(
    (e) =>
      String(e.data.name ?? '').toLowerCase() === lower ||
      asList(e.data.aliases).some((a) => a.toLowerCase() === lower),
  );
}

/** Ids referenced by structured fields (refs) of an entity, with the field label. */
export function fieldRefs(e: Entity): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const f of TYPE_BY_KEY[e.type].fields) {
    const v = e.data[f.key];
    if (f.type === 'ref' || f.type === 'refs') asList(v).forEach((id) => out.push({ id, label: f.label }));
    if (f.type === 'requires') {
      const r = normalizeRequires(v);
      r.all.forEach((id) => out.push({ id, label: 'Requires' }));
      r.any.forEach((id) => out.push({ id, label: 'Requires (any)' }));
    }
  }
  return out;
}

export interface Backlink {
  from: Entity;
  via: string; // field label, or "Mentioned"
}

export function backlinks(target: Entity, entities: Entity[], byId: Map<string, Entity>): Backlink[] {
  const out: Backlink[] = [];
  for (const e of entities) {
    if (e === target) continue;
    const via = new Set<string>();
    for (const r of fieldRefs(e)) if (r.id === target.id) via.add(r.label);
    for (const m of e.body.matchAll(WIKI_RE)) {
      if (resolveLink(m[1], entities, byId) === target) {
        via.add('Mentioned');
        break;
      }
    }
    via.forEach((v) => out.push({ from: e, via: v }));
  }
  return out;
}
