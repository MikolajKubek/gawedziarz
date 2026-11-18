// Map hierarchy helpers. A location with a `map` image is a "map host".
// Every location (via `parent`) and character (via `location`) is pinned on the map of its
// nearest ancestor that has a map; `pin: {map, x, y}` are pixel coordinates on that map's image.
// `map` names the map (location id) the pin was placed on, so a pin is ignored if the hierarchy later changes.
import { asList, type Entity } from './schema';

export interface Pin { map?: string; x: number; y: number }

export const hasMap = (e?: Entity) => !!e && e.type === 'location' && typeof e.data.map === 'string' && !!e.data.map;

/** The entity's pin on the given map (pins placed on a different map don't count). */
export function getPin(e: Entity, mapId: string): Pin | undefined {
  const p = e.data.pin;
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return undefined;
  if (p.map && p.map !== mapId) return undefined;
  return { map: mapId, x: p.x, y: p.y };
}

/** The location whose map this entity is shown on. */
export function hostMap(e: Entity, byId: Map<string, Entity>): Entity | undefined {
  let cur = asList(e.type === 'character' ? e.data.location : e.data.parent)[0];
  const seen = new Set<string>([e.id]);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const loc = byId.get(cur);
    if (!loc || loc.type !== 'location') return undefined;
    if (hasMap(loc)) return loc;
    cur = asList(loc.data.parent)[0];
  }
  return undefined;
}

/** Map hosts from the world down to `id` (inclusive), for breadcrumbs. */
export function mapTrail(id: string, byId: Map<string, Entity>): Entity[] {
  const trail: Entity[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur);
    cur = hostMap(cur, byId);
  }
  return trail;
}

export const mapEntities = (host: Entity, entities: Entity[], byId: Map<string, Entity>) =>
  entities.filter((e) => (e.type === 'location' || e.type === 'character') && hostMap(e, byId)?.id === host.id);
