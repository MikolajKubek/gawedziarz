// Entity types and the structured (frontmatter) fields each one has.
// Adding a field here is all it takes for it to appear in the editor.

export type EntityType = 'glossary' | 'character' | 'creature' | 'item' | 'location' | 'story';

export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'tags' // free-form list of strings
  | 'ref' // reference to one entity
  | 'refs' // references to many entities
  | 'requires' // story prerequisites: { all: [...], any: [...] }
  | 'map' // image file in vault/maps
  | 'image' // image file in vault/images (portrait / cover)
  | 'hidden'; // stored but edited elsewhere (e.g. map pins)

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  refType?: EntityType;
  placeholder?: string;
}

export interface TypeDef {
  type: EntityType;
  route: string;
  label: string;
  plural: string;
  /** Field shown as a subtitle in lists. */
  subtitle?: string;
  fields: Field[];
}

const name = (label = 'Name'): Field => ({ key: 'name', label, type: 'text' });
const tags: Field = { key: 'tags', label: 'Tags', type: 'tags' };
const image: Field = { key: 'image', label: 'Image', type: 'image' };

export const TYPES: TypeDef[] = [
  {
    type: 'story',
    route: 'story',
    label: 'Story node',
    plural: 'Story',
    subtitle: 'kind',
    fields: [
      name('Title'),
      image,
      { key: 'kind', label: 'Kind', type: 'select', options: ['start', 'event', 'quest', 'checkpoint', 'ending'] },
      { key: 'location', label: 'Location', type: 'ref', refType: 'location' },
      { key: 'characters', label: 'Characters', type: 'refs', refType: 'character' },
      { key: 'requires', label: 'Requires', type: 'requires', refType: 'story' },
      { key: 'excludes', label: 'Excludes', type: 'refs', refType: 'story' },
      tags,
    ],
  },
  {
    type: 'character',
    route: 'characters',
    label: 'Character',
    plural: 'Characters',
    subtitle: 'role',
    fields: [
      name(),
      image,
      { key: 'race', label: 'Race', type: 'text' },
      { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Blacksmith' },
      { key: 'faction', label: 'Faction', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Alive', 'Dead', 'Missing', 'Unknown'] },
      { key: 'location', label: 'Location', type: 'ref', refType: 'location' },
      { key: 'traits', label: 'Traits', type: 'tags' },
      tags,
      { key: 'pin', label: 'Pin', type: 'hidden' },
    ],
  },
  {
    type: 'creature',
    route: 'creatures',
    label: 'Creature',
    plural: 'Creatures',
    subtitle: 'danger',
    fields: [
      name(),
      image,
      { key: 'danger', label: 'Danger (1–5)', type: 'number' },
      { key: 'habitat', label: 'Habitat', type: 'refs', refType: 'location' },
      { key: 'traits', label: 'Traits', type: 'tags' },
      tags,
    ],
  },
  {
    type: 'location',
    route: 'locations',
    label: 'Location',
    plural: 'Locations',
    subtitle: 'kind',
    fields: [
      name(),
      image,
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: ['World', 'Region', 'City', 'Village', 'District', 'Building', 'Ruin', 'Dungeon', 'Landmark'],
      },
      { key: 'parent', label: 'Inside of', type: 'ref', refType: 'location' },
      { key: 'map', label: 'Map', type: 'map' },
      tags,
      { key: 'pin', label: 'Pin', type: 'hidden' },
    ],
  },
  {
    type: 'item',
    route: 'items',
    label: 'Item',
    plural: 'Items',
    subtitle: 'rarity',
    fields: [
      name(),
      image,
      { key: 'rarity', label: 'Rarity', type: 'select', options: ['Common', 'Uncommon', 'Rare', 'Legendary', 'Unique'] },
      tags,
    ],
  },
  {
    type: 'glossary',
    route: 'glossary',
    label: 'Term',
    plural: 'Glossary',
    subtitle: 'category',
    fields: [
      name('Term'),
      image,
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'aliases', label: 'Aliases', type: 'tags' },
      tags,
    ],
  },
];

export const TYPE_BY_KEY = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<EntityType, TypeDef>;
export const TYPE_BY_ROUTE = Object.fromEntries(TYPES.map((t) => [t.route, t])) as Record<string, TypeDef>;

export interface Entity {
  type: EntityType;
  id: string;
  data: Record<string, any>;
  body: string;
}

export const entityName = (e: Entity) => String(e.data.name ?? e.id);
export const entityUrl = (e: Pick<Entity, 'type' | 'id'>) => `/${TYPE_BY_KEY[e.type].route}/${e.id}`;

export interface Requires {
  all: string[];
  any: string[];
}

/** `requires` may be written by hand as a plain list (meaning "all of"). */
export function normalizeRequires(value: unknown): Requires {
  if (Array.isArray(value)) return { all: value.map(String), any: [] };
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
    return { all: list(v.all), any: list(v.any) };
  }
  return { all: [], any: [] };
}

export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
