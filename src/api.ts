import type { Entity, EntityType } from './schema';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `${method} ${url} failed (${res.status})`);
  }
  return res.json();
}

export type Layout = { nodes?: Record<string, { x: number; y: number }> };

export const api = {
  info: () => request<{ vault: string }>('GET', '/api/info'),
  list: () => request<Entity[]>('GET', '/api/entities'),
  create: (type: EntityType, name: string, data?: Record<string, unknown>) =>
    request<Entity>('POST', `/api/entities/${type}`, { name, data }),
  save: (e: Entity) => request<Entity>('PUT', `/api/entities/${e.type}/${e.id}`, { data: e.data, body: e.body }),
  remove: (type: EntityType, id: string) => request<{ ok: boolean }>('DELETE', `/api/entities/${type}/${id}`),
  getLayout: () => request<Layout>('GET', '/api/story/layout'),
  saveLayout: (layout: Layout) => request<{ ok: boolean }>('PUT', '/api/story/layout', layout),
};

export type UploadKind = 'maps' | 'images';

export const fileUrl = (kind: UploadKind, file: string) => `/api/${kind}/${encodeURIComponent(file)}`;
export const mapUrl = (file: string) => fileUrl('maps', file);
export const imageUrl = (file: string) => fileUrl('images', file);

export async function uploadFile(kind: UploadKind, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/${kind}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Upload failed');
  return (await res.json()).file;
}
export const uploadMap = (file: File) => uploadFile('maps', file);
export const uploadImage = (file: File) => uploadFile('images', file);
