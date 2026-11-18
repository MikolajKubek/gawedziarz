import { Check, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../api';
import { TypeIcon } from '../icons';
import { backlinks } from '../links';
import { TYPE_BY_KEY, entityName, entityUrl, type Entity } from '../schema';
import { useVault } from '../store';
import { FieldDisplay, FieldEditor, isEmptyValue } from './Fields';
import { Markdown } from './Markdown';
import { MarkdownEditor } from './MarkdownEditor';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface Props {
  entity: Entity;
  onDeleted?: () => void;
  startEditing?: boolean;
}

export function EntityView({ entity, onDeleted, startEditing = false }: Props) {
  const { entities, byId, save, remove } = useVault();
  const def = TYPE_BY_KEY[entity.type];
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<Entity>(entity);
  const [state, setState] = useState<SaveState>('saved');
  const timer = useRef<number | undefined>(undefined);
  const key = `${entity.type}/${entity.id}`;

  // Switching to another entity: reset the draft.
  useEffect(() => {
    setDraft(entity);
    setState('saved');
    setEditing(startEditing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Not editing: follow outside changes (e.g. edits made in the story graph or by hand).
  useEffect(() => {
    if (!editing) setDraft(entity);
  }, [entity, editing]);

  const update = (next: Entity) => {
    setDraft(next);
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setState('saving');
      try {
        await save(next);
        setState('saved');
      } catch {
        setState('error');
      }
    }, 600);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setField = (k: string, v: unknown) => {
    const data = { ...draft.data };
    if (v === undefined) delete data[k];
    else data[k] = v;
    update({ ...draft, data });
  };

  const links = useMemo(() => backlinks(entity, entities, byId), [entity, entities, byId]);
  const grouped = useMemo(() => {
    const g = new Map<string, { from: Entity; via: string[] }>();
    for (const l of links) {
      const k = l.from.id;
      if (!g.has(k)) g.set(k, { from: l.from, via: [] });
      g.get(k)!.via.push(l.via);
    }
    return [...g.values()];
  }, [links]);

  const onDelete = async () => {
    const warn = grouped.length ? `\n\n${grouped.length} other entr${grouped.length === 1 ? 'y refers' : 'ies refer'} to it; those links will break.` : '';
    if (!confirm(`Burn the page “${entityName(entity)}”? This deletes the file.${warn}`)) return;
    await remove(entity);
    onDeleted?.();
  };

  const shown = editing ? draft : entity;
  const extraFields = Object.keys(shown.data).filter((k) => !def.fields.some((f) => f.key === k));

  return (
    <article className={`entity-view entity-${entity.type}`}>
      <header className="entity-header">
        <div className="entity-kind"><TypeIcon type={entity.type} size={14} /> {def.label}</div>
        {editing ? (
          <input
            className="title-input"
            value={String(draft.data.name ?? '')}
            onChange={(e) => setField('name', e.target.value)}
          />
        ) : (
          <h1>{entityName(shown)}</h1>
        )}
        <div className="entity-actions">
          {editing && <span className={`save-state ${state}`}>{{ saved: 'Saved', dirty: 'Unsaved…', saving: 'Saving…', error: 'Save failed!' }[state]}</span>}
          <button className={`btn ${editing ? 'btn-primary' : ''}`} onClick={() => setEditing(!editing)}>
            {editing ? <><Check size={15} /> Done</> : <><Pencil size={15} /> Edit</>}
          </button>
          {editing && <button className="btn btn-danger btn-icon" onClick={onDelete} title="Delete"><Trash2 size={15} /></button>}
        </div>
      </header>

      <div className={`entity-top ${!editing && shown.data.image ? 'with-image' : ''}`}>
      {!editing && typeof shown.data.image === 'string' && shown.data.image && (
        <a className="entity-figure" href={imageUrl(shown.data.image)} target="_blank" rel="noreferrer">
          <img src={imageUrl(shown.data.image)} alt={entityName(shown)} />
        </a>
      )}
      <section className="fields">
        {def.fields.filter((f) => f.key !== 'name' && f.type !== 'hidden').map((f) =>
          editing ? (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <FieldEditor field={f} value={draft.data[f.key]} entity={draft} onChange={(v) => setField(f.key, v)} />
            </div>
          ) : (
            f.type !== 'image' && !isEmptyValue(f, shown.data[f.key]) && (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <FieldDisplay field={f} value={shown.data[f.key]} entityId={entity.id} />
              </div>
            )
          ),
        )}
        {extraFields.map((k) => (
          <div className="field" key={k} title="Field not in the schema — edit it in the markdown file">
            <label>{k}</label>
            <code>{JSON.stringify(shown.data[k])}</code>
          </div>
        ))}
      </section>
      </div>

      <div className="divider" />

      <section className="body">
        {editing ? (
          <MarkdownEditor value={draft.body} onChange={(body) => update({ ...draft, body })} />
        ) : (
          <div onDoubleClick={() => setEditing(true)}>
            <Markdown text={shown.body} />
          </div>
        )}
      </section>

      {grouped.length > 0 && (
        <section className="backlinks">
          <h3>Referenced by</h3>
          <ul>
            {grouped.map(({ from, via }) => (
              <li key={from.id}>
                <TypeIcon type={from.type} size={14} className="bl-icon" />
                <Link to={entityUrl(from)}>{entityName(from)}</Link>
                <span className="bl-via">{via.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
