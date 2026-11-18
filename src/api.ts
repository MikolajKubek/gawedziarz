// Bridge to the Rust side (src-tauri). Everything that touches the disk goes through here.
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { Entity, EntityType } from './schema';

export type Layout = { nodes?: Record<string, { x: number; y: number }> };
export interface ProjectInfo { path: string; name: string }
export interface FolderInfo { exists: boolean; empty: boolean; isProject: boolean }
export type UploadKind = 'maps' | 'images';

// Root of the open project, used to build image URLs synchronously.
let projectRoot = '';
export const setProjectRoot = (root: string) => { projectRoot = root.replace(/[\\/]+$/, ''); };

export const projects = {
  current: () => invoke<ProjectInfo | null>('current_project'),
  open: (path: string) => invoke<ProjectInfo>('open_project', { path }),
  create: (path: string, withExample: boolean) => invoke<ProjectInfo>('create_project', { path, withExample }),
  close: () => invoke<void>('close_project'),
  recent: () => invoke<string[]>('recent_projects'),
  forget: (path: string) => invoke<void>('forget_recent', { path }),
  inspect: (path: string) => invoke<FolderInfo>('inspect_folder', { path }),
  initialPath: () => invoke<string | null>('initial_path'),
};

export const api = {
  list: () => invoke<Entity[]>('list_entities'),
  create: (type: EntityType, name: string, data?: Record<string, unknown>) =>
    invoke<Entity>('create_entity', { entityType: type, name, data: data ?? null }),
  save: (e: Entity) => invoke<Entity>('save_entity', { entity: e }),
  remove: (type: EntityType, id: string) => invoke<void>('delete_entity', { entityType: type, id }),
  getLayout: () => invoke<Layout>('get_layout'),
  saveLayout: (layout: Layout) => invoke<void>('save_layout', { layout }),
};

const sep = () => (projectRoot.includes('\\') && !projectRoot.includes('/') ? '\\' : '/');
export const fileUrl = (kind: UploadKind, file: string) => convertFileSrc(`${projectRoot}${sep()}${kind}${sep()}${file}`);
export const mapUrl = (file: string) => fileUrl('maps', file);
export const imageUrl = (file: string) => fileUrl('images', file);

export async function uploadFile(kind: UploadKind, file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<string>('save_upload', bytes, {
    headers: { 'x-kind': kind, 'x-filename': encodeURIComponent(file.name || 'image.png') },
  });
}
export const uploadMap = (file: File) => uploadFile('maps', file);
export const uploadImage = (file: File) => uploadFile('images', file);
