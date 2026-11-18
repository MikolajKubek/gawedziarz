import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EntityView } from '../components/EntityView';
import { TYPE_BY_ROUTE } from '../schema';
import { useVault } from '../store';

export function EntityPage() {
  const { route = '', id = '' } = useParams();
  const [search] = useSearchParams();
  const { byId, loading } = useVault();
  const navigate = useNavigate();
  const def = TYPE_BY_ROUTE[route];
  const entity = byId.get(id);

  if (loading) return <div className="page"><p className="empty-note">Loading…</p></div>;
  if (!def || !entity || entity.type !== def.type)
    return (
      <div className="page">
        <h1>Lost page</h1>
        <p className="empty-note">No entry “{id}” in {def?.plural ?? 'the codex'}.</p>
        {def && <Link to={`/${def.route}`}>← Back to {def.plural}</Link>}
      </div>
    );

  return (
    <div className="page page-narrow">
      <Link className="back" to={`/${def.route}`}>← {def.plural}</Link>
      <EntityView entity={entity} startEditing={search.has('edit')} onDeleted={() => navigate(`/${def.route}`)} />
    </div>
  );
}
