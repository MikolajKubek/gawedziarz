import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen, FolderPlus, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { projects } from '../api';
import { ask, notify } from '../dialogs';
import { useProject } from '../project';

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function Welcome() {
  const { open, create } = useProject();
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    projects.recent().then(setRecent).catch(() => {});
  }, []);

  const pickFolder = async (title: string) => {
    const dir = await openDialog({ directory: true, multiple: false, title });
    return typeof dir === 'string' ? dir : null;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      await notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onOpen = (path?: string) =>
    run(async () => {
      const dir = path ?? (await pickFolder('Open a project folder'));
      if (!dir) return;
      const info = await projects.inspect(dir);
      if (!info.exists) {
        await projects.forget(dir);
        setRecent((r) => r.filter((p) => p !== dir));
        throw new Error(`The folder no longer exists:\n${dir}`);
      }
      if (!info.isProject && !info.empty) {
        const ok = await ask(
          `“${folderName(dir)}” doesn't look like a Gawędziarz project yet.\n\nSet it up here? This adds folders like characters/, locations/ and story/ next to the existing files.`,
        );
        if (!ok) return;
      }
      await open(dir);
    });

  const onCreate = (withExample: boolean) =>
    run(async () => {
      const dir = await pickFolder(withExample ? 'Choose an empty folder for the example world' : 'Choose a folder for the new project');
      if (!dir) return;
      const info = await projects.inspect(dir);
      if (!info.empty) {
        if (withExample) throw new Error('The example world needs an empty folder. Create a new folder in the dialog and pick it.');
        if (!info.isProject && !(await ask(`“${folderName(dir)}” is not empty. Create the project inside it anyway?`))) return;
      }
      await create(dir, withExample);
    });

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          <span className="brand-mark big" aria-hidden />
          <div>
            <h1>Gawędziarz</h1>
            <p className="muted">A codex for your non-linear story. Every project is a plain folder of markdown files.</p>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="welcome-action" disabled={busy} onClick={() => onOpen()}>
            <FolderOpen size={22} />
            <span><b>Open project folder</b><small>Continue an existing world</small></span>
          </button>
          <button className="welcome-action" disabled={busy} onClick={() => onCreate(false)}>
            <FolderPlus size={22} />
            <span><b>New empty project</b><small>Start from a blank codex</small></span>
          </button>
          <button className="welcome-action" disabled={busy} onClick={() => onCreate(true)}>
            <Sparkles size={22} />
            <span><b>New from example</b><small>A small sample world with maps and a story graph</small></span>
          </button>
        </div>

        {recent.length > 0 && (
          <>
            <h4 className="panel-section">Recent</h4>
            <ul className="recent-list">
              {recent.map((p) => (
                <li key={p}>
                  <button className="recent-open" disabled={busy} onClick={() => onOpen(p)}>
                    <b>{folderName(p)}</b>
                    <small>{p}</small>
                  </button>
                  <button
                    className="chip-x"
                    title="Remove from list"
                    onClick={async () => {
                      await projects.forget(p);
                      setRecent((r) => r.filter((x) => x !== p));
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
