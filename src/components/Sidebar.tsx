import { Map as MapIcon, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { TypeIcon } from '../icons';
import { hasMap } from '../maps';
import { TYPES, TYPE_BY_KEY, asList, entityName, entityUrl } from '../schema';
import { useVault } from '../store';

export function Sidebar() {
  const { entities } = useVault();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entities) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [entities]);
  const mapCount = useMemo(() => entities.filter(hasMap).length, [entities]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return entities
      .filter(
        (e) =>
          entityName(e).toLowerCase().includes(s) ||
          asList(e.data.aliases).some((a) => a.toLowerCase().includes(s)) ||
          e.body.toLowerCase().includes(s),
      )
      .sort((a, b) => Number(!entityName(a).toLowerCase().includes(s)) - Number(!entityName(b).toLowerCase().includes(s)))
      .slice(0, 12);
  }, [q, entities]);

  const rest = TYPES.filter((t) => t.type !== 'story');

  return (
    <nav className="sidebar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Gawędziarz</span>
      </Link>

      <div className="search">
        <Search size={15} className="search-icon" />
        <input
          value={q}
          placeholder="Search…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              navigate(entityUrl(results[0]));
              setQ('');
            } else if (e.key === 'Escape') setQ('');
          }}
        />
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((e) => (
              <li key={e.type + e.id}>
                <Link to={entityUrl(e)} onClick={() => setQ('')}>
                  <TypeIcon type={e.type} size={14} className="muted-icon" />
                  {entityName(e)}
                  <span className="ac-type">{TYPE_BY_KEY[e.type].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="nav-section">Story</div>
      <ul className="nav-list">
        <li>
          <NavLink to="/story">
            <TypeIcon type="story" size={17} />
            <span className="nav-label">Story graph</span>
            <span className="nav-count">{counts.story ?? 0}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/maps">
            <MapIcon size={17} strokeWidth={1.75} />
            <span className="nav-label">Maps</span>
            <span className="nav-count">{mapCount}</span>
          </NavLink>
        </li>
      </ul>

      <div className="nav-section">Codex</div>
      <ul className="nav-list">
        {rest.map((t) => (
          <li key={t.type}>
            <NavLink to={`/${t.route}`}>
              <TypeIcon type={t.type} size={17} />
              <span className="nav-label">{t.plural}</span>
              <span className="nav-count">{counts[t.type] ?? 0}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
