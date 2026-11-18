import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { imageUrl } from '../api';
import { TypeIcon } from '../icons';
import { TYPE_BY_ROUTE, asList, entityName, entityUrl, type Entity } from '../schema';
import { useVault } from '../store';

const excerpt = (body: string, nameOf: (id: string) => string) =>
  body
    .replace(/^#+.*$/gm, '')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a, b) => b || nameOf(a))
    .replace(/[*_`>#]/g, '')
    .trim()
    .slice(0, 160);

/** Locations are shown as a tree using their `parent` field. */
function orderAsTree(list: Entity[]): { e: Entity; depth: number }[] {
  const ids = new Set(list.map((e) => e.id));
  const children = new Map<string, Entity[]>();
  const roots: Entity[] = [];
  for (const e of list) {
    const p = asList(e.data.parent)[0];
    if (p && ids.has(p) && p !== e.id) {
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(e);
    } else roots.push(e);
  }
  const out: { e: Entity; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (e: Entity, depth: number) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    out.push({ e, depth });
    (children.get(e.id) ?? []).sort(byName).forEach((c) => walk(c, depth + 1));
  };
  roots.sort(byName).forEach((r) => walk(r, 0));
  list.filter((e) => !seen.has(e.id)).forEach((e) => walk(e, 0)); // cycles
  return out;
}

const byName = (a: Entity, b: Entity) => entityName(a).localeCompare(entityName(b));

export function EntityList() {
  const { route = '' } = useParams();
  const def = TYPE_BY_ROUTE[route];
  const { entities, byId, create } = useVault();
  const nameOf = (id: string) => (byId.get(id) ? entityName(byId.get(id)!) : id);
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');

  const items = useMemo(() => {
    if (!def) return [];
    const f = filter.trim().toLowerCase();
    const list = entities
      .filter((e) => e.type === def.type)
      .filter(
        (e) =>
          !f ||
          entityName(e).toLowerCase().includes(f) ||
          asList(e.data.tags).some((t) => t.toLowerCase().includes(f)) ||
          asList(e.data.traits).some((t) => t.toLowerCase().includes(f)),
      );
    return def.type === 'location' && !f ? orderAsTree(list) : list.sort(byName).map((e) => ({ e, depth: 0 }));
  }, [entities, def, filter]);

  if (!def) return <div className="page"><h1>Unknown section</h1></div>;

  const onCreate = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!newName.trim()) return;
    const e = await create(def.type, newName.trim());
    setNewName('');
    navigate(entityUrl(e) + '?edit=1');
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><TypeIcon type={def.type} size={26} className="page-icon" /> {def.plural}</h1>
        <form className="new-form" onSubmit={onCreate}>
          <input value={newName} placeholder={`New ${def.label.toLowerCase()}…`} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn btn-primary" type="submit"><Plus size={15} /> Add</button>
        </form>
      </header>

      <input className="filter" value={filter} placeholder="Filter by name, tag or trait…" onChange={(e) => setFilter(e.target.value)} />

      {items.length === 0 ? (
        <p className="empty-note">No {def.plural.toLowerCase()} recorded yet.</p>
      ) : (
        <ul className={def.type === 'location' ? 'card-tree' : 'card-grid'}>
          {items.map(({ e, depth }) => {
            const sub = def.subtitle ? e.data[def.subtitle] : undefined;
            const chips = [...asList(e.data.traits), ...asList(e.data.tags)].slice(0, 4);
            return (
              <li key={e.id} style={{ marginLeft: depth * 28 }}>
                <Link to={entityUrl(e)} className={`card ${e.data.image ? 'has-image' : ''}`}>
                  {typeof e.data.image === 'string' && e.data.image && <img className="card-image" src={imageUrl(e.data.image)} alt="" />}
                  <div className="card-body">
                  <div className="card-title">
                    {depth > 0 && <span className="tree-branch">└</span>}
                    {entityName(e)}
                    {typeof e.data.map === 'string' && e.data.map && <span className="badge">map</span>}
                  </div>
                  {sub !== undefined && sub !== '' && (
                    <div className="card-sub">
                      {def.subtitle === 'danger' ? <span className="danger-pips">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= Number(sub) ? 'on' : ''} />)}</span> : String(sub)}
                    </div>
                  )}
                  {excerpt(e.body, nameOf) && <p className="card-excerpt">{excerpt(e.body, nameOf)}</p>}
                  {chips.length > 0 && (
                    <div className="chips">{chips.map((c) => <span className="chip tag" key={c}>{c}</span>)}</div>
                  )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
