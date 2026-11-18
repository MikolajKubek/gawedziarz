import { Brush, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, fileUrl, type UnusedFile } from '../api';
import { ask, notify } from '../dialogs';

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Finds images/maps that no entry references any more and lets the user delete them. */
export function Housekeeping() {
  const [files, setFiles] = useState<UnusedFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    try {
      setFiles(await api.unusedFiles());
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (!files?.length) return;
    const total = kb(files.reduce((s, f) => s + f.size, 0));
    if (!(await ask(`Delete ${files.length} unused file${files.length === 1 ? '' : 's'} (${total})? This cannot be undone.`))) return;
    setBusy(true);
    try {
      await api.deleteFiles(files);
      setFiles([]);
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="housekeeping">
      <header>
        <h4 className="panel-section">Housekeeping</h4>
        <button className="btn btn-small btn-ghost" disabled={busy} onClick={scan}>
          <Brush size={13} /> {files ? 'Scan again' : 'Find unused images'}
        </button>
      </header>
      {files && files.length === 0 && <p className="hint small">Every image and map is used by some entry.</p>}
      {files && files.length > 0 && (
        <>
          <p className="hint small">
            These files in <code>images/</code> and <code>maps/</code> aren't referenced by any entry
            (e.g. after you replaced or removed an image).
          </p>
          <ul className="unused-grid">
            {files.map((f) => (
              <li key={f.kind + f.name} title={`${f.kind}/${f.name}`}>
                <img src={fileUrl(f.kind, f.name)} alt="" />
                <span>{f.name}</span>
                <small>{f.kind} · {kb(f.size)}</small>
              </li>
            ))}
          </ul>
          <button className="btn btn-danger btn-small" disabled={busy} onClick={removeAll}>
            <Trash2 size={13} /> Delete {files.length} file{files.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </section>
  );
}
