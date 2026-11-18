mod vault;
mod yaml;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{ipc::InvokeBody, AppHandle, Manager, State};

use vault::{Entity, Vault, R};

const MAX_RECENT: usize = 10;
const APP_TITLE: &str = "Gawędziarz";

struct AppState {
    vault: Mutex<Option<Vault>>,
    /// Folder passed on the command line (`gawedziarz /path/to/world`).
    initial_path: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct ProjectInfo {
    path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderInfo {
    exists: bool,
    empty: bool,
    is_project: bool,
}

fn with_vault<T>(state: &State<AppState>, f: impl FnOnce(&Vault) -> R<T>) -> R<T> {
    match state.vault.lock().unwrap().as_ref() {
        Some(v) => f(v),
        None => Err("No project is open".into()),
    }
}

// ───────────── recent projects (stored in the app config dir) ─────────────

fn recent_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("recent.json"))
}

fn read_recent(app: &AppHandle) -> Vec<String> {
    recent_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_recent(app: &AppHandle, list: &[String]) {
    if let Some(p) = recent_file(app) {
        let _ = std::fs::create_dir_all(p.parent().unwrap());
        let _ = std::fs::write(p, serde_json::to_string_pretty(list).unwrap_or_default());
    }
}

fn activate(app: &AppHandle, state: &State<AppState>, v: Vault) -> R<ProjectInfo> {
    // Let the webview load images from the project folder via the asset protocol.
    app.asset_protocol_scope().allow_directory(&v.root, true).map_err(|e| e.to_string())?;
    let info = ProjectInfo { path: v.root.to_string_lossy().into_owned(), name: v.name() };
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&format!("{} — {APP_TITLE}", info.name));
    }
    let mut recent = read_recent(app);
    recent.retain(|p| p != &info.path);
    recent.insert(0, info.path.clone());
    recent.truncate(MAX_RECENT);
    write_recent(app, &recent);
    *state.vault.lock().unwrap() = Some(v);
    Ok(info)
}

// ───────────── project commands ─────────────

#[tauri::command]
fn inspect_folder(path: String) -> FolderInfo {
    let s = vault::inspect(std::path::Path::new(&path));
    FolderInfo { exists: s.exists, empty: s.empty, is_project: s.is_project }
}

#[tauri::command]
fn open_project(app: AppHandle, state: State<AppState>, path: String) -> R<ProjectInfo> {
    activate(&app, &state, Vault::open(&path)?)
}

#[tauri::command]
fn create_project(app: AppHandle, state: State<AppState>, path: String, with_example: bool) -> R<ProjectInfo> {
    let p = std::path::Path::new(&path);
    if with_example {
        if !vault::inspect(p).empty {
            return Err("The example world can only be created in an empty folder.".into());
        }
        vault::seed_example(p)?;
    }
    activate(&app, &state, Vault::open(p)?)
}

#[tauri::command]
fn close_project(app: AppHandle, state: State<AppState>) {
    *state.vault.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(APP_TITLE);
    }
}

#[tauri::command]
fn current_project(state: State<AppState>) -> Option<ProjectInfo> {
    state.vault.lock().unwrap().as_ref().map(|v| ProjectInfo { path: v.root.to_string_lossy().into_owned(), name: v.name() })
}

#[tauri::command]
fn recent_projects(app: AppHandle) -> Vec<String> {
    read_recent(&app).into_iter().filter(|p| std::path::Path::new(p).is_dir()).collect()
}

#[tauri::command]
fn forget_recent(app: AppHandle, path: String) {
    let mut recent = read_recent(&app);
    recent.retain(|p| p != &path);
    write_recent(&app, &recent);
}

#[tauri::command]
fn initial_path(state: State<AppState>) -> Option<String> {
    state.initial_path.lock().unwrap().take()
}

// ───────────── vault commands ─────────────

#[tauri::command(async)]
fn list_entities(state: State<AppState>) -> R<Vec<Entity>> {
    with_vault(&state, |v| v.list())
}

#[tauri::command]
fn create_entity(state: State<AppState>, entity_type: String, name: String, data: Option<Map<String, Value>>) -> R<Entity> {
    with_vault(&state, |v| v.create(&entity_type, &name, data))
}

#[tauri::command]
fn save_entity(state: State<AppState>, entity: Entity) -> R<Entity> {
    with_vault(&state, |v| v.save(&entity))
}

#[tauri::command]
fn delete_entity(state: State<AppState>, entity_type: String, id: String) -> R<()> {
    with_vault(&state, |v| v.delete(&entity_type, &id))
}

#[tauri::command]
fn get_layout(state: State<AppState>) -> R<Value> {
    with_vault(&state, |v| Ok(v.layout()))
}

#[tauri::command]
fn save_layout(state: State<AppState>, layout: Value) -> R<()> {
    with_vault(&state, |v| v.save_layout(layout))
}

/// Raw-body upload: bytes in the body, `x-kind` (maps|images) and URI-encoded `x-filename` headers.
#[tauri::command(async)]
fn save_upload(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> R<String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes".into());
    };
    let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_owned);
    let kind = header("x-kind").ok_or("Missing x-kind header")?;
    let name = percent_decode(&header("x-filename").unwrap_or_else(|| "image.png".into()));
    with_vault(&state, |v| v.save_upload(&kind, &name, bytes))
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).ok();
            if let Some(n) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(n);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial = std::env::args().skip(1).find(|a| !a.starts_with('-'));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { vault: Mutex::new(None), initial_path: Mutex::new(initial) })
        .invoke_handler(tauri::generate_handler![
            inspect_folder,
            open_project,
            create_project,
            close_project,
            current_project,
            recent_projects,
            forget_recent,
            initial_path,
            list_entities,
            create_entity,
            save_entity,
            delete_entity,
            get_layout,
            save_layout,
            save_upload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gawędziarz");
}

#[cfg(test)]
mod tests {
    #[test]
    fn decodes_file_names() {
        assert_eq!(super::percent_decode("Market%20Square%20%C5%81%C3%B3d%C5%BA.png"), "Market Square Łódź.png");
        assert_eq!(super::percent_decode("100%"), "100%");
    }
}
