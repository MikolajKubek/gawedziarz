import { Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TypeIcon } from '../icons';
import { hasMap } from '../maps';
import { TYPES } from '../schema';
import { useVault } from '../store';

export function Home() {
  const { entities, vaultPath } = useVault();
  const count = (t: string) => entities.filter((e) => e.type === t).length;
  return (
    <div className="page">
      <header className="home-hero">
        <h1 className="hero-title">Your world</h1>
        <p className="hero-sub">{entities.length} entries in the codex</p>
      </header>
      <ul className="tile-grid">
        {TYPES.map((t) => (
          <li key={t.type}>
            <Link to={`/${t.route}`} className={`tile tile-${t.type}`}>
              <TypeIcon type={t.type} size={22} className="tile-icon" />
              <span className="tile-name">{t.type === 'story' ? 'Story graph' : t.plural}</span>
              <span className="tile-count">{count(t.type)}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link to="/maps" className="tile tile-maps">
            <MapIcon size={22} strokeWidth={1.75} className="tile-icon" />
            <span className="tile-name">Maps</span>
            <span className="tile-count">{entities.filter(hasMap).length}</span>
          </Link>
        </li>
      </ul>
      {vaultPath && <p className="vault-path">Vault · <code>{vaultPath}</code></p>}
    </div>
  );
}
