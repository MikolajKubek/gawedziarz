import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { projects, setProjectRoot, type ProjectInfo } from './api';

interface ProjectState {
  project: ProjectInfo | null;
  booting: boolean;
  open: (path: string) => Promise<void>;
  create: (path: string, withExample: boolean) => Promise<void>;
  close: () => Promise<void>;
}

const Ctx = createContext<ProjectState | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [booting, setBooting] = useState(true);

  const activate = (p: ProjectInfo) => {
    setProjectRoot(p.path);
    setProject(p);
  };

  // On launch: a folder given on the command line, else the project still open in the backend
  // (dev reload), else the most recently used project.
  useEffect(() => {
    (async () => {
      try {
        const cli = await projects.initialPath();
        const current = cli ? null : await projects.current();
        if (current) return activate(current);
        const target = cli ?? (await projects.recent())[0];
        if (target) activate(await projects.open(target));
      } catch (e) {
        console.error('Could not reopen project', e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const open = useCallback(async (path: string) => activate(await projects.open(path)), []);
  const create = useCallback(async (path: string, withExample: boolean) => activate(await projects.create(path, withExample)), []);
  const close = useCallback(async () => {
    await projects.close();
    setProject(null);
    window.location.hash = '#/';
  }, []);

  return <Ctx.Provider value={{ project, booting, open, create, close }}>{children}</Ctx.Provider>;
}

export function useProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject outside ProjectProvider');
  return v;
}
