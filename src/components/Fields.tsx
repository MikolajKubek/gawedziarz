import { ImagePlus, Map as MapIcon, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl, mapUrl, uploadFile, type UploadKind } from '../api';
import { TypeIcon } from '../icons';
import {
  asList, entityName, entityUrl, normalizeRequires,
  type Entity, type EntityType, type Field,
} from '../schema';
import { useVault } from '../store';

// ---------- read-only display ----------

export function RefChip({ id, missingOk }: { id: string; missingOk?: boolean }) {
  const { byId } = useVault();
  const e = byId.get(id);
  if (!e) return <span className={'chip missing'} title={missingOk ? '' : 'Missing entry'}>{id}</span>;
  return (
    <Link className={`chip chip-${e.type}`} to={entityUrl(e)}>
      <TypeIcon type={e.type} size={13} className="chip-icon" />
      {entityName(e)}
    </Link>
  );
}

export function FieldDisplay({ field, value, entityId }: { field: Field; value: unknown; entityId?: string }) {
  switch (field.type) {
    case 'ref':
    case 'refs':
      return <div className="chips">{asList(value).map((id) => <RefChip key={id} id={id} />)}</div>;
    case 'tags':
      return <div className="chips">{asList(value).map((t) => <span key={t} className="chip tag">{t}</span>)}</div>;
    case 'requires': {
      const r = normalizeRequires(value);
      return (
        <div className="requires-display">
          {r.all.length > 0 && (
            <div><em>All of:</em> <span className="chips">{r.all.map((id) => <RefChip key={id} id={id} />)}</span></div>
          )}
          {r.any.length > 0 && (
            <div><em>Any of:</em> <span className="chips">{r.any.map((id) => <RefChip key={id} id={id} />)}</span></div>
          )}
        </div>
      );
    }
    case 'map':
      return <MapThumb file={String(value)} entityId={entityId} />;
    case 'image':
      return null; // shown as the entry's portrait/cover instead
    case 'hidden':
      return null;
    default:
      return <span>{String(value)}</span>;
  }
}

function MapThumb({ file, entityId }: { file: string; entityId?: string }) {
  return (
    <span className="map-thumb">
      <img src={mapUrl(file)} alt="" />
      <span className="map-thumb-name">{file}</span>
      {entityId && (
        <Link className="btn btn-small" to={`/maps/${entityId}`}>
          <MapIcon size={14} /> Open map
        </Link>
      )}
    </span>
  );
}

function FileEditor({ kind, value, onChange }: { kind: UploadKind; value?: string; onChange: (v: unknown) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await uploadFile(kind, f));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={`file-editor ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
    >
      {value && (kind === 'maps' ? <MapThumb file={value} /> : <img className="image-thumb" src={imageUrl(value)} alt="" />)}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
        <ImagePlus size={14} /> {busy ? 'Uploading…' : value ? 'Replace' : kind === 'maps' ? 'Upload map image' : 'Upload image'}
      </button>
      {value && (
        <button className="btn btn-small btn-ghost" onClick={() => onChange(undefined)} title={`Detach (the file stays in vault/${kind})`}>
          <X size={14} /> Remove
        </button>
      )}
      {!value && !busy && <span className="drop-hint">or drop a file here</span>}
      {err && <span className="error-text">{err}</span>}
    </div>
  );
}

export { MapThumb };

export function isEmptyValue(field: Field, v: unknown) {
  if (field.type === 'requires') {
    const r = normalizeRequires(v);
    return r.all.length + r.any.length === 0;
  }
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

// ---------- editors ----------

function RefPicker({
  refType, exclude, onPick, label = '+ add…',
}: { refType?: EntityType; exclude: string[]; onPick: (id: string) => void; label?: string }) {
  const { entities } = useVault();
  const options = entities
    .filter((e) => (!refType || e.type === refType) && !exclude.includes(e.id))
    .sort((a, b) => entityName(a).localeCompare(entityName(b)));
  return (
    <select className="ref-picker" value="" onChange={(ev) => ev.target.value && onPick(ev.target.value)}>
      <option value="">{label}</option>
      {options.map((e) => (
        <option key={e.id} value={e.id}>{entityName(e)}</option>
      ))}
    </select>
  );
}

function RefsEditor({
  value, onChange, refType, selfId,
}: { value: string[]; onChange: (v: string[]) => void; refType?: EntityType; selfId: string }) {
  return (
    <div className="chips editable">
      {value.map((id) => (
        <span key={id} className="chip-wrap">
          <RefChip id={id} />
          <button className="chip-x" title="Remove" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>
        </span>
      ))}
      <RefPicker refType={refType} exclude={[...value, selfId]} onPick={(id) => onChange([...value, id])} />
    </div>
  );
}

function TagsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="chips editable">
      {value.map((t) => (
        <span key={t} className="chip tag">
          {t}
          <button className="chip-x" onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button>
        </span>
      ))}
      <input
        className="tag-input"
        value={draft}
        placeholder="add…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

export function FieldEditor({
  field, value, onChange, entity,
}: { field: Field; value: unknown; onChange: (v: unknown) => void; entity: Entity }) {
  switch (field.type) {
    case 'text':
      return <input type="text" value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return (
        <input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'select': {
      const opts = field.options ?? [];
      const v = String(value ?? '');
      return (
        <select value={v} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          {v && !opts.includes(v) && <option value={v}>{v}</option>}
        </select>
      );
    }
    case 'tags':
      return <TagsEditor value={asList(value)} onChange={onChange} />;
    case 'ref': {
      const id = asList(value)[0];
      return id ? (
        <div className="chips editable">
          <span className="chip-wrap">
            <RefChip id={id} />
            <button className="chip-x" onClick={() => onChange(undefined)}><X size={12} /></button>
          </span>
        </div>
      ) : (
        <RefPicker refType={field.refType} exclude={[entity.id]} onPick={onChange} label="— choose —" />
      );
    }
    case 'refs':
      return <RefsEditor value={asList(value)} onChange={onChange} refType={field.refType} selfId={entity.id} />;
    case 'map':
      return <FileEditor kind="maps" value={value ? String(value) : undefined} onChange={onChange} />;
    case 'image':
      return <FileEditor kind="images" value={value ? String(value) : undefined} onChange={onChange} />;
    case 'hidden':
      return null;
    case 'requires': {
      const r = normalizeRequires(value);
      const set = (next: Partial<typeof r>) => {
        const merged = { ...r, ...next };
        onChange(merged.all.length + merged.any.length ? merged : undefined);
      };
      return (
        <div className="requires-editor">
          <label>All of</label>
          <RefsEditor value={r.all} onChange={(all) => set({ all })} refType="story" selfId={entity.id} />
          <label>Any of</label>
          <RefsEditor value={r.any} onChange={(any) => set({ any })} refType="story" selfId={entity.id} />
        </div>
      );
    }
  }
}
