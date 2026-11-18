# Gawędziarz

Desktop app (Tauri 2) for writing a non-linear RPG story. A project = a folder of markdown files. See README.md.

- Backend: Rust in `src-tauri/` (`lib.rs` commands, `vault.rs` file I/O, `yaml.rs` emitter). The FastAPI backend was removed when migrating to Tauri.
- Frontend: React 19 + TS + Vite in `src/`, HashRouter. All disk access goes through `src/api.ts` (`invoke`). Images use `convertFileSrc` (asset protocol; the project dir is allowed at runtime in `activate()`).
- Don't use window.prompt/confirm/alert/open: they are unreliable in the webview. Use `src/dialogs.tsx` (`ask`, `notify`, `promptText`, `openLightbox`).
- Uploads: raw-body `invoke('save_upload', bytes, {headers: {x-kind, x-filename (URI-encoded)}})`.
- Entity fields are schema-driven (`src/schema.ts`). Story-graph logic is in `src/story.ts`; edges are derived from `requires`/`excludes` and `story/layout.json` holds only positions.
- React Flow v13: `changes.applyTo(nodes)`.
- Maps: Leaflet `CRS.Simple`; `pin: {map, x, y}` uses image pixel coords. Never use the YAML key `on` (YAML 1.1 parses it as boolean).
- YAML output must stay byte-compatible: `cargo test` checks that every example-vault file round-trips exactly.
- Theme: dark; Inter for UI and titles, Source Serif for prose, Pixelify Sans only for tiny accents. Fonts come from @fontsource (offline).
- Checks: `npx tsc --noEmit`, `npm test`.

Next ideas: playthrough simulator, story events on maps, renaming an entry's id with link rewrite, cleanup of unused images, file watcher instead of reload-on-focus.
