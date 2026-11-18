import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Entity, EntityType } from './schema';

interface VaultState {
  entities: Entity[];
  byId: Map<string, Entity>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (e: Entity) => Promise<Entity>;
  create: (type: EntityType, name: string, data?: Record<string, unknown>) => Promise<Entity>;
  remove: (e: Entity) => Promise<void>;
}

const Ctx = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntities(await api.list());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // Pick up files edited by hand outside the app.
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const upsert = (e: Entity) =>
    setEntities((list) => {
      const i = list.findIndex((x) => x.type === e.type && x.id === e.id);
      if (i === -1) return [...list, e];
      const copy = list.slice();
      copy[i] = e;
      return copy;
    });

  const save = useCallback(async (e: Entity) => {
    upsert(e); // optimistic
    return api.save(e);
  }, []);

  const create = useCallback(async (type: EntityType, name: string, data?: Record<string, unknown>) => {
    const e = await api.create(type, name, data);
    upsert(e);
    return e;
  }, []);

  const remove = useCallback(async (e: Entity) => {
    await api.remove(e.type, e.id);
    setEntities((list) => list.filter((x) => !(x.type === e.type && x.id === e.id)));
  }, []);

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const value = { entities, byId, loading, error, reload, save, create, remove };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault outside VaultProvider');
  return v;
}
