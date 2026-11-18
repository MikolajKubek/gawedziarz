# Gawędziarz

Local web app for writing a non-linear RPG story. See README.md for format and running.

- Backend: FastAPI in `backend/` (venv in `.venv`, deps pinned in `backend/requirements.txt`). Generic CRUD over markdown+YAML files; it knows only the type→folder map.
- Frontend: React 19 + TS + Vite in `src/`. Entity fields are schema-driven (`src/schema.ts`). Story-graph logic (edges, layout, validation) is UI-independent in `src/story.ts`.
- React Flow is v13 (`@xyflow/react`): node changes use `changes.applyTo(nodes)`, not `applyNodeChanges`.
- Entity ids are globally unique slugs (file names) so `[[id]]` links need no type prefix.
- The graph never stores edges separately: edges are derived from `requires`/`excludes` in node frontmatter; `story/layout.json` holds positions only.
- Maps: Leaflet `CRS.Simple`; pins are image pixel coords `pin: {map, x, y}` (y from top). Never use the YAML key `on` (YAML 1.1 parses it as boolean true).
- Theme: dark; Inter for UI/titles, Source Serif for prose, Pixelify Sans ONLY for small accents (logo, section labels, kind tags) because it hurt readability. Tokens at the top of `src/styles.css`.
- Uploads: `POST/GET /api/{maps|images}/…` → `vault/maps`, `vault/images`. Markdown images use vault-relative `images/x.png`, rewritten to `/api/images/` when rendering.
- Type-check with `npx tsc --noEmit`.

Done: phases 1–4 (codex, story graph, maps, sub-maps). Next: playthrough simulator, items polish, story nodes on maps, entity rename (id) with link rewrite.
