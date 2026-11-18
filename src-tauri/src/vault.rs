//! The vault: a project folder of markdown files with YAML frontmatter.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

use crate::yaml;

pub type R<T> = Result<T, String>;

/// Entity type -> folder inside the vault.
pub const TYPE_FOLDERS: [(&str, &str); 6] = [
    ("glossary", "glossary"),
    ("character", "characters"),
    ("creature", "creatures"),
    ("item", "items"),
    ("location", "locations"),
    ("story", "story/nodes"),
];
/// Upload kind -> folder inside the vault.
pub const UPLOAD_DIRS: [(&str, &str); 2] = [("maps", "maps"), ("images", "images")];
const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"];
const LAYOUT_FILE: &str = "story/layout.json";

static EXAMPLE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../example-vault");

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entity {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub data: Map<String, Value>,
    pub body: String,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn folder_for(kind: &str) -> R<&'static str> {
    TYPE_FOLDERS.iter().find(|(k, _)| *k == kind).map(|(_, f)| *f).ok_or_else(|| format!("Unknown entity type '{kind}'"))
}

fn upload_dir(kind: &str) -> R<&'static str> {
    UPLOAD_DIRS.iter().find(|(k, _)| *k == kind).map(|(_, f)| *f).ok_or_else(|| format!("Unknown upload kind '{kind}'"))
}

/// Lowercase slug: `[a-z0-9][a-z0-9-]*` — also what makes ids safe as file names.
pub fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn valid_file_name(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, ext)) => valid_id(stem) && IMAGE_EXTENSIONS.contains(&ext),
        None => false,
    }
}

pub fn slugify(text: &str) -> String {
    let translit: String = text
        .chars()
        .map(|c| match c {
            'ł' => "l".to_string(),
            'Ł' => "L".to_string(),
            'ø' => "o".to_string(),
            'Ø' => "O".to_string(),
            'đ' => "d".to_string(),
            'ß' => "ss".to_string(),
            'æ' => "ae".to_string(),
            c => c.to_string(),
        })
        .collect();
    let plain: String = translit.nfd().filter(|c| !is_combining_mark(*c)).collect::<String>().to_lowercase();
    let mut out = String::new();
    for c in plain.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "untitled".into() } else { out }
}

pub fn parse_markdown(text: &str) -> (Map<String, Value>, String) {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(rest) = t.strip_prefix("---\n").or_else(|| t.strip_prefix("---\r\n")) else {
        return (Map::new(), t.to_string());
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == "---" {
            let front = &rest[..offset];
            let body = rest[offset + line.len()..].trim_start_matches(['\r', '\n']);
            let data = match serde_yaml::from_str::<Value>(front) {
                Ok(Value::Object(m)) => m,
                _ => Map::new(),
            };
            return (data, body.to_string());
        }
        offset += line.len();
    }
    (Map::new(), t.to_string())
}

fn is_empty(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(m) => m.is_empty(),
        _ => false,
    }
}

pub fn render_markdown(data: &Map<String, Value>, body: &str) -> String {
    let clean: Map<String, Value> = data.iter().filter(|(_, v)| !is_empty(v)).map(|(k, v)| (k.clone(), v.clone())).collect();
    let mut out = String::from("---\n");
    yaml::emit_map(&clean, 0, &mut out);
    out.push_str("---\n");
    let body = body.trim();
    if !body.is_empty() {
        out.push('\n');
        out.push_str(body);
        out.push('\n');
    }
    out
}

fn write_atomic(path: &Path, content: &[u8]) -> R<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = path.with_extension("tmp~");
    fs::write(&tmp, content).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

/// Recursively sort object keys so layout.json diffs stay stable.
fn sorted(v: Value) -> Value {
    match v {
        Value::Object(m) => {
            let b: BTreeMap<String, Value> = m.into_iter().map(|(k, v)| (k, sorted(v))).collect();
            Value::Object(b.into_iter().collect())
        }
        Value::Array(a) => Value::Array(a.into_iter().map(sorted).collect()),
        v => v,
    }
}

/// What a folder looks like before opening it as a project.
pub struct FolderState {
    pub exists: bool,
    pub empty: bool,
    pub is_project: bool,
}

pub fn inspect(path: &Path) -> FolderState {
    let exists = path.is_dir();
    let empty = !exists || fs::read_dir(path).map(|mut d| d.next().is_none()).unwrap_or(false);
    let is_project = exists
        && TYPE_FOLDERS.iter().map(|(_, f)| f).chain(UPLOAD_DIRS.iter().map(|(_, f)| f)).any(|f| path.join(f).is_dir());
    FolderState { exists, empty, is_project }
}

/// Copy the bundled example world into an (empty) folder.
pub fn seed_example(path: &Path) -> R<()> {
    fs::create_dir_all(path).map_err(err)?;
    EXAMPLE.extract(path).map_err(err)
}

pub struct Vault {
    pub root: PathBuf,
}

impl Vault {
    pub fn open(path: impl AsRef<Path>) -> R<Self> {
        let path = path.as_ref();
        fs::create_dir_all(path).map_err(err)?;
        let root = path.canonicalize().map_err(err)?;
        for (_, f) in TYPE_FOLDERS.iter().chain(UPLOAD_DIRS.iter()) {
            fs::create_dir_all(root.join(f)).map_err(err)?;
        }
        Ok(Self { root })
    }

    pub fn name(&self) -> String {
        self.root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Untitled".into())
    }

    fn entity_path(&self, kind: &str, id: &str) -> R<PathBuf> {
        let folder = folder_for(kind)?;
        if !valid_id(id) {
            return Err(format!("Invalid id '{id}'"));
        }
        Ok(self.root.join(folder).join(format!("{id}.md")))
    }

    fn all_ids(&self) -> std::collections::HashSet<String> {
        let mut ids = std::collections::HashSet::new();
        for (_, f) in TYPE_FOLDERS {
            if let Ok(dir) = fs::read_dir(self.root.join(f)) {
                for e in dir.flatten() {
                    let p = e.path();
                    if p.extension().is_some_and(|x| x == "md") {
                        if let Some(stem) = p.file_stem() {
                            ids.insert(stem.to_string_lossy().into_owned());
                        }
                    }
                }
            }
        }
        ids
    }

    pub fn unique_id(&self, name: &str) -> String {
        let base = slugify(name);
        let taken = self.all_ids();
        let mut candidate = base.clone();
        let mut n = 2;
        while taken.contains(&candidate) {
            candidate = format!("{base}-{n}");
            n += 1;
        }
        candidate
    }

    pub fn list(&self) -> R<Vec<Entity>> {
        let mut out = Vec::new();
        for (kind, folder) in TYPE_FOLDERS {
            let Ok(dir) = fs::read_dir(self.root.join(folder)) else { continue };
            let mut paths: Vec<PathBuf> = dir.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "md")).collect();
            paths.sort();
            for p in paths {
                let id = p.file_stem().unwrap().to_string_lossy().into_owned();
                if !valid_id(&id) {
                    continue; // e.g. "My Notes.md" created by hand — not addressable by [[id]]
                }
                let text = fs::read_to_string(&p).map_err(err)?;
                let (data, body) = parse_markdown(&text);
                out.push(Entity { kind: kind.into(), id, data, body });
            }
        }
        Ok(out)
    }

    pub fn save(&self, e: &Entity) -> R<Entity> {
        let p = self.entity_path(&e.kind, &e.id)?;
        write_atomic(&p, render_markdown(&e.data, &e.body).as_bytes())?;
        Ok(e.clone())
    }

    pub fn create(&self, kind: &str, name: &str, extra: Option<Map<String, Value>>) -> R<Entity> {
        folder_for(kind)?;
        let name = name.trim();
        if name.is_empty() {
            return Err("Name is required".into());
        }
        let mut data = Map::new();
        data.insert("name".into(), Value::String(name.into()));
        for (k, v) in extra.unwrap_or_default() {
            data.insert(k, v);
        }
        let e = Entity { kind: kind.into(), id: self.unique_id(name), data, body: String::new() };
        self.save(&e)
    }

    pub fn delete(&self, kind: &str, id: &str) -> R<()> {
        fs::remove_file(self.entity_path(kind, id)?).map_err(err)
    }

    pub fn layout(&self) -> Value {
        fs::read_to_string(self.root.join(LAYOUT_FILE))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| Value::Object(Map::new()))
    }

    pub fn save_layout(&self, layout: Value) -> R<()> {
        let mut s = serde_json::to_string_pretty(&sorted(layout)).map_err(err)?;
        s.push('\n');
        write_atomic(&self.root.join(LAYOUT_FILE), s.as_bytes())
    }

    /// Store an uploaded image under maps/ or images/ with a unique slugged name.
    pub fn save_upload(&self, kind: &str, filename: &str, bytes: &[u8]) -> R<String> {
        let folder = self.root.join(upload_dir(kind)?);
        let (stem, ext) = filename.rsplit_once('.').unwrap_or((filename, ""));
        let mut ext = ext.to_ascii_lowercase();
        if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
            return Err(format!("Unsupported image type '{filename}'"));
        }
        if ext == "jpeg" {
            ext = "jpg".into();
        }
        let base = slugify(stem);
        let mut name = format!("{base}.{ext}");
        let mut n = 2;
        while folder.join(&name).exists() {
            name = format!("{base}-{n}.{ext}");
            n += 1;
        }
        debug_assert!(valid_file_name(&name));
        write_atomic(&folder.join(&name), bytes)?;
        Ok(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn slugs() {
        assert_eq!(slugify("Łucja Żółć"), "lucja-zolc");
        assert_eq!(slugify("  The Drowned Lantern! "), "the-drowned-lantern");
        assert_eq!(slugify("???"), "untitled");
        assert!(valid_id("ostgard-2") && !valid_id("../x") && !valid_id("Big") && !valid_id(""));
    }

    #[test]
    fn markdown_round_trip_of_example_vault() {
        // Every bundled example file must survive parse -> render unchanged.
        for (_, folder) in TYPE_FOLDERS {
            let Some(dir) = EXAMPLE.get_dir(folder) else { continue };
            for f in dir.files() {
                let text = f.contents_utf8().unwrap();
                let (data, body) = parse_markdown(text);
                assert_eq!(render_markdown(&data, &body), text, "{:?}", f.path());
            }
        }
    }

    #[test]
    fn vault_crud() {
        let tmp = tempfile::tempdir().unwrap();
        let v = Vault::open(tmp.path().join("world")).unwrap();
        let a = v.create("character", "Brother Aldric", None).unwrap();
        let b = v.create("character", "Brother Aldric", None).unwrap();
        assert_eq!((a.id.as_str(), b.id.as_str()), ("brother-aldric", "brother-aldric-2"));

        let mut e = a.clone();
        e.data.insert("traits".into(), json!(["pious", "secretive"]));
        e.data.insert("pin".into(), json!({"map": "ostgard", "x": 1, "y": 2}));
        e.data.insert("status".into(), json!(""));
        e.body = "Hello [[ostgard]]".into();
        v.save(&e).unwrap();
        let text = fs::read_to_string(v.root.join("characters/brother-aldric.md")).unwrap();
        assert_eq!(text, "---\nname: Brother Aldric\ntraits: [pious, secretive]\npin: {map: ostgard, x: 1, y: 2}\n---\n\nHello [[ostgard]]\n");

        let list = v.list().unwrap();
        assert_eq!(list.len(), 2);
        assert!(v.save(&Entity { id: "../evil".into(), ..e.clone() }).is_err());
        v.delete("character", "brother-aldric-2").unwrap();
        assert_eq!(v.list().unwrap().len(), 1);

        assert_eq!(v.save_upload("images", "My Portrait.JPEG", b"x").unwrap(), "my-portrait.jpg");
        assert_eq!(v.save_upload("images", "My Portrait.jpeg", b"x").unwrap(), "my-portrait-2.jpg");
        assert!(v.save_upload("images", "evil.exe", b"x").is_err());
        assert!(v.save_upload("../", "a.png", b"x").is_err());

        v.save_layout(json!({"nodes": {"b": {"y": 1, "x": 2}, "a": {"x": 0, "y": 0}}})).unwrap();
        assert_eq!(v.layout()["nodes"]["b"]["x"], 2);
    }

    #[test]
    fn seeding_and_inspecting() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("new");
        assert!(!inspect(&p).exists);
        seed_example(&p).unwrap();
        let st = inspect(&p);
        assert!(st.exists && !st.empty && st.is_project);
        let v = Vault::open(&p).unwrap();
        assert!(v.list().unwrap().iter().any(|e| e.id == "brother-aldric"));
    }
}
