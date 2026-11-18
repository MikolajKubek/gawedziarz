# Gawędziarz

A storyteller's codex for writing a non-linear RPG. It holds the glossary, characters, creatures, items and
locations, plus maps with pins and a **story graph**. Everything is stored as plain markdown files
that you can read, diff and edit by hand.

## Running

Gawędziarz is a desktop app (Tauri 2: Rust backend + React frontend). Each **project is a plain folder**
of markdown files, so you can keep each world in its own git repo, sync it, or edit it in any editor.

**One-time setup (Ubuntu/Debian):**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
npm install
```

You also need a Rust toolchain (`rustup`). For other systems, see https://tauri.app/start/prerequisites/.

```bash
npm run dev        # run the desktop app with hot reload
npm run build      # build installers / binaries into src-tauri/target/release/bundle
npm test           # Rust unit tests (vault & YAML)
```

On launch the app reopens the last project. Use **Switch** at the bottom of the sidebar to open
another folder, start an empty project, or create one from the bundled example world. You can also
pass a folder directly: `gawedziarz /path/to/my-world`.

## Vault file structure

```
my-world/                               ← a project folder
├── glossary/
│   ├── the-ashen-veil.md
│   └── hollowborn.md
├── characters/
│   ├── brother-aldric.md
│   └── mira-thornfield.md
├── creatures/
│   ├── marsh-wolf.md
│   └── ash-wraith.md
├── items/
│   └── lantern-seal.md
├── locations/
│   ├── greywater-reaches.md            ← the world (has `map: world.svg`)
│   ├── ostgard.md                      ← city inside the world, with its own map
│   ├── ostgard-tavern.md               ← building inside Ostgard, pinned on Ostgard's map
│   ├── greywater-marsh.md
│   └── burned-chapel.md
├── maps/                               ← uploaded map images
│   ├── world.svg
│   └── ostgard.svg
├── images/                             ← portraits, covers and inline images
│   ├── brother-aldric.svg
│   └── market-square.png
└── story/
    ├── nodes/                          ← one file per story node
    │   ├── arrival-in-ostgard.md
    │   ├── meet-aldric.md
    │   ├── buy-the-map.md
    │   ├── bribe-the-guard.md
    │   ├── enter-the-chapel.md
    │   ├── join-the-cult.md
    │   ├── ending-sealed.md
    │   └── ending-torn.md
    └── layout.json                     ← node positions in the graph only (cosmetic)
```

The file name is the entry's id (`brother-aldric.md` → `brother-aldric`). Ids are unique across the
whole project. Structured fields go in YAML frontmatter and free text goes below it. Link to any entry
from text with `[[id]]` or `[[id|label]]` (type `[[` in the editor to get autocomplete). The app watches
the folder, so edits made in other tools (a text editor, `git pull`, …) show up immediately.

### A character

```markdown
---
name: Brother Aldric
image: brother-aldric.svg                # portrait (file in images/)
race: Human
role: Disgraced priest
faction: Order of the Lantern
status: Alive
location: ostgard-tavern
traits: [pious, secretive, guilt-ridden]
pin: {map: ostgard, x: 1000, y: 700}
---

## Backstory
Once keeper of the [[burned-chapel]], Aldric fled the night it burned…

![Aldric's old sketch](images/aldric-sketch.png)
```

### A location with its own map

```markdown
---
name: Ostgard
kind: City
parent: greywater-reaches                       # it is inside the world…
map: ostgard.svg                                # …has its own map (file in maps/)…
pin: {map: greywater-reaches, x: 862, y: 455}   # …and sits here on the world map
---
```

### A story node

```markdown
---
name: Enter the Burned Chapel
kind: checkpoint            # start | event | quest | checkpoint | ending
location: burned-chapel
characters: [brother-aldric]
requires:
  all: [meet-aldric]                    # every one of these must be completed
  any: [buy-the-map, bribe-the-guard]   # …and at least one of these
excludes: [join-the-cult]   # completing one closes the other (stored on both nodes)
---

What the player experiences here…
```

## Images

Every entry type (characters, creatures, items, locations, glossary terms and story nodes) has an
`image` field for a portrait or cover. It is shown next to the entry's fields, on list cards, on story
graph nodes, and as the avatar on character map pins. Upload it in edit mode, or drop a file onto the field.

Inside any description you can **paste** an image, **drag & drop** it into the text, or click
**Image** above the editor. The file is saved to `images/` and the text gets a standard markdown
reference: `![caption](images/file.png)`. Click an image to open it at full size.

Removing or replacing an image only unlinks it, and the file stays in the folder. To tidy up, use
**Housekeeping → Find unused images** on the home page. It lists files in `images/` and `maps/` that no
entry mentions any more and deletes them after you confirm.

## Maps

Any location can have a map image (open it → **Edit** → *Upload map image*, or use **Maps → Upload**
to create a new top-level map).

- Each location is shown on the map of its nearest ancestor (via `parent`) that has a map.
- Each character is shown on the map of their `location`, or of the nearest ancestor of it that has a map.
- `pin` holds pixel coordinates on that map's image, and `pin.map` records which map it was placed on.
  If you later change the hierarchy, e.g. give the marsh its own map, entries inside it show up as
  *not placed yet* instead of at the wrong spot.

On a map you can use **Edit pins** to drag pins around and to place entries from the *Not placed yet* list.
**New location** creates a location at the spot you click. Double-click a pin that has the map badge to open
its sub-map. The breadcrumbs take you back up.

## Story graph

A node becomes available once its requirements are met, so several branches can be open at once.
`requires: [a, b]` (a plain list) is shorthand for `all`. The graph's arrows are drawn from
`requires`/`excludes` and are not stored anywhere else.

- **Linking nodes:** drag from a node's right handle to another node to add a requirement, or an
  exclusion, depending on the *Link* mode. Click a link to switch it between all and any, or to remove it.
- **Focus:** dims everything not connected to the selected node.
- **Problems:** lists links to missing nodes, loops, nodes that are unreachable because they need two
  mutually exclusive branches, and dead ends.

## Project structure

```
src-tauri/        Rust backend (Tauri 2)
  src/lib.rs      commands: open/create/switch project, recent projects, entity CRUD, uploads
  src/vault.rs    reading & writing the project folder (markdown + YAML frontmatter)
  src/yaml.rs     readable YAML emitter (inline short lists like `traits: [a, b]`)
src/
  api.ts          the bridge to Rust (Tauri `invoke`); images load through Tauri's asset protocol
  project.tsx     the open project; pages/Welcome.tsx is the project picker
  schema.ts       entity types and their fields (add a field here and it appears in the editor)
  story.ts        story-graph logic: edges, auto-layout, validation
  maps.ts         map hierarchy and pin helpers
  pages/          Home, EntityList, EntityPage, StoryGraph, Maps, Welcome
  components/     EntityView, field editors, markdown renderer and editor, sidebar
  styles.css      theme (colours, fonts and the pixel shadow are CSS variables at the top)
example-vault/    sample world, embedded in the app binary for "New from example"
```

**Stack:** Tauri 2 (Rust) · React 19 + TypeScript + Vite · React Flow (graph) · Leaflet (maps) · Lucide icons ·
fonts bundled locally (Inter, Source Serif 4, Pixelify Sans), so the app works fully offline.
