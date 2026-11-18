"""Reading and writing the vault: a folder of markdown files with YAML frontmatter."""

from __future__ import annotations

import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

# Entity type -> folder inside the vault (relative path).
TYPE_FOLDERS: dict[str, str] = {
    "glossary": "glossary",
    "character": "characters",
    "creature": "creatures",
    "item": "items",
    "location": "locations",
    "story": "story/nodes",
}

LAYOUT_FILE = "story/layout.json"
# Uploaded files: kind -> folder inside the vault.
UPLOAD_DIRS = {"maps": "maps", "images": "images"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"}
FILE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.(png|jpe?g|webp|gif|svg|avif)$")

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
FRONTMATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", re.DOTALL)

# Polish (and a few other) letters that NFD normalisation does not decompose.
_TRANSLIT = str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "ß": "ss", "æ": "ae"})


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text.translate(_TRANSLIT))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "untitled"


class _Dumper(yaml.SafeDumper):
    """Keeps short lists of scalars inline (`traits: [a, b]`) for readable frontmatter."""


def _represent_list(dumper: yaml.SafeDumper, data: list) -> yaml.Node:
    flow = len(data) <= 8 and all(isinstance(x, (str, int, float, bool)) for x in data)
    return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=flow)


def _represent_dict(dumper: yaml.SafeDumper, data: dict) -> yaml.Node:
    flow = len(data) <= 4 and all(isinstance(v, (str, int, float, bool)) for v in data.values())
    return dumper.represent_mapping("tag:yaml.org,2002:map", data.items(), flow_style=flow)


_Dumper.add_representer(list, _represent_list)
_Dumper.add_representer(dict, _represent_dict)


def parse_markdown(text: str) -> tuple[dict[str, Any], str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    data = yaml.safe_load(m.group(1)) or {}
    if not isinstance(data, dict):
        data = {}
    return data, m.group(2).lstrip("\n")


def render_markdown(data: dict[str, Any], body: str) -> str:
    clean = {k: v for k, v in data.items() if v not in (None, "", [], {})}
    front = yaml.dump(clean, Dumper=_Dumper, sort_keys=False, allow_unicode=True, width=100)
    body = body.strip()
    return f"---\n{front}---\n\n{body}\n" if body else f"---\n{front}---\n"


@dataclass
class Entity:
    type: str
    id: str
    data: dict[str, Any]
    body: str

    def to_json(self) -> dict[str, Any]:
        return {"type": self.type, "id": self.id, "data": self.data, "body": self.body}


class Vault:
    def __init__(self, root: Path, seed: Path | None = None):
        self.root = root.resolve()
        if not self.root.exists() and seed and seed.exists():
            shutil.copytree(seed, self.root)
        for folder in [*TYPE_FOLDERS.values(), *UPLOAD_DIRS.values()]:
            (self.root / folder).mkdir(parents=True, exist_ok=True)

    # ---- helpers -------------------------------------------------------
    def _path(self, type_: str, id_: str) -> Path:
        if type_ not in TYPE_FOLDERS:
            raise ValueError(f"Unknown type: {type_}")
        if not ID_RE.match(id_):
            raise ValueError(f"Invalid id: {id_}")
        return self.root / TYPE_FOLDERS[type_] / f"{id_}.md"

    def _all_ids(self) -> set[str]:
        return {p.stem for folder in TYPE_FOLDERS.values() for p in (self.root / folder).glob("*.md")}

    def unique_id(self, name: str) -> str:
        base = slugify(name)
        taken = self._all_ids()
        candidate, n = base, 2
        while candidate in taken:
            candidate, n = f"{base}-{n}", n + 1
        return candidate

    # ---- entities ------------------------------------------------------
    def list(self) -> list[Entity]:
        out: list[Entity] = []
        for type_, folder in TYPE_FOLDERS.items():
            for p in sorted((self.root / folder).glob("*.md")):
                data, body = parse_markdown(p.read_text(encoding="utf-8"))
                out.append(Entity(type_, p.stem, data, body))
        return out

    def get(self, type_: str, id_: str) -> Entity | None:
        p = self._path(type_, id_)
        if not p.exists():
            return None
        data, body = parse_markdown(p.read_text(encoding="utf-8"))
        return Entity(type_, id_, data, body)

    def save(self, entity: Entity) -> Entity:
        p = self._path(entity.type, entity.id)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".md.tmp")
        tmp.write_text(render_markdown(entity.data, entity.body), encoding="utf-8")
        tmp.replace(p)
        return entity

    def create(self, type_: str, name: str, data: dict[str, Any] | None = None) -> Entity:
        id_ = self.unique_id(name)
        return self.save(Entity(type_, id_, {"name": name, **(data or {})}, ""))

    def delete(self, type_: str, id_: str) -> bool:
        p = self._path(type_, id_)
        if not p.exists():
            return False
        p.unlink()
        return True

    # ---- story layout --------------------------------------------------
    def get_layout(self) -> dict[str, Any]:
        p = self.root / LAYOUT_FILE
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_layout(self, layout: dict[str, Any]) -> None:
        p = self.root / LAYOUT_FILE
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(layout, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # ---- uploaded images (maps/, images/) ------------------------------
    def file_path(self, kind: str, name: str) -> Path | None:
        if kind not in UPLOAD_DIRS or not FILE_NAME_RE.match(name):
            return None
        p = self.root / UPLOAD_DIRS[kind] / name
        return p if p.exists() else None

    def save_file(self, kind: str, filename: str, content: bytes) -> str:
        if kind not in UPLOAD_DIRS:
            raise ValueError(f"Unknown upload kind '{kind}'")
        ext = Path(filename).suffix.lower()
        if ext not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image type '{ext or filename}'")
        if ext == ".jpeg":
            ext = ".jpg"
        base = slugify(Path(filename).stem)
        folder = self.root / UPLOAD_DIRS[kind]
        name, n = f"{base}{ext}", 2
        while (folder / name).exists():
            name, n = f"{base}-{n}{ext}", n + 1
        (folder / name).write_bytes(content)
        return name
