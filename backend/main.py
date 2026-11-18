"""Gawędziarz API. Run with: uvicorn backend.main:app --reload --port 4317"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .vault import TYPE_FOLDERS, UPLOAD_DIRS, Entity, Vault

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VAULT_DIR = Path(os.environ.get("VAULT_DIR", PROJECT_ROOT / "vault"))

vault = Vault(VAULT_DIR, seed=PROJECT_ROOT / "example-vault")
app = FastAPI(title="Gawędziarz")


class EntityIn(BaseModel):
    data: dict[str, Any]
    body: str = ""


class CreateIn(BaseModel):
    name: str
    data: dict[str, Any] | None = None


def _check_type(type_: str) -> None:
    if type_ not in TYPE_FOLDERS:
        raise HTTPException(404, f"Unknown entity type '{type_}'")


@app.get("/api/info")
def info() -> dict[str, Any]:
    return {"vault": str(vault.root), "types": list(TYPE_FOLDERS)}


@app.get("/api/entities")
def list_entities() -> list[dict[str, Any]]:
    return [e.to_json() for e in vault.list()]


@app.post("/api/entities/{type_}")
def create_entity(type_: str, payload: CreateIn) -> dict[str, Any]:
    _check_type(type_)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    return vault.create(type_, name, payload.data).to_json()


@app.put("/api/entities/{type_}/{id_}")
def save_entity(type_: str, id_: str, payload: EntityIn) -> dict[str, Any]:
    _check_type(type_)
    try:
        return vault.save(Entity(type_, id_, payload.data, payload.body)).to_json()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/entities/{type_}/{id_}")
def delete_entity(type_: str, id_: str) -> dict[str, bool]:
    _check_type(type_)
    try:
        if not vault.delete(type_, id_):
            raise HTTPException(404, "Not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/api/story/layout")
def get_layout() -> dict[str, Any]:
    return vault.get_layout()


@app.put("/api/story/layout")
def put_layout(layout: dict[str, Any]) -> dict[str, bool]:
    vault.save_layout(layout)
    return {"ok": True}


MAX_UPLOAD_BYTES = 40 * 1024 * 1024


@app.post("/api/{kind}")
async def upload_file(kind: str, file: UploadFile) -> dict[str, str]:
    """Upload an image into vault/maps or vault/images. Returns the stored file name."""
    if kind not in UPLOAD_DIRS:
        raise HTTPException(404, "Not found")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image is too large (max 40 MB)")
    try:
        return {"file": vault.save_file(kind, file.filename or "image.png", content)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/{kind}/{name}")
def get_file(kind: str, name: str) -> FileResponse:
    p = vault.file_path(kind, name)
    if not p:
        raise HTTPException(404, "Not found")
    return FileResponse(p)


# In production (`npm run build` first) serve the built frontend from the same server.
DIST = PROJECT_ROOT / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        return FileResponse(DIST / "index.html")
