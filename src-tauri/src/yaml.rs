//! A small YAML emitter for frontmatter.
//!
//! serde_yaml always writes block style. Hand-edited frontmatter is much more readable with short
//! lists and small maps inline (`traits: [pious, secretive]`, `pin: {map: ostgard, x: 1, y: 2}`),
//! so we emit it ourselves. Input is the limited shape the app produces: maps, lists and scalars.

use serde_json::{Map, Value};

const MAX_FLOW_LIST: usize = 8;
const MAX_FLOW_MAP: usize = 4;

fn is_scalar(v: &Value) -> bool {
    matches!(v, Value::String(_) | Value::Number(_) | Value::Bool(_))
}

fn needs_quotes(s: &str) -> bool {
    if s.is_empty() || s.trim() != s {
        return true;
    }
    let first = s.chars().next().unwrap();
    if "-?:,[]{}#&*!|>'\"%@`".contains(first) {
        return true;
    }
    if s.contains(": ") || s.contains(" #") || s.ends_with(':') {
        return true;
    }
    if s.chars().any(|c| matches!(c, ',' | '[' | ']' | '{' | '}' | '\n' | '\r' | '\t')) {
        return true;
    }
    let lower = s.to_ascii_lowercase();
    if matches!(lower.as_str(), "true" | "false" | "null" | "yes" | "no" | "on" | "off" | "~") {
        return true;
    }
    s.parse::<f64>().is_ok()
}

pub fn scalar(s: &str) -> String {
    if !needs_quotes(s) {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn inline(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => scalar(s),
        Value::Array(a) => format!("[{}]", a.iter().map(inline).collect::<Vec<_>>().join(", ")),
        Value::Object(m) => format!(
            "{{{}}}",
            m.iter().map(|(k, v)| format!("{}: {}", scalar(k), inline(v))).collect::<Vec<_>>().join(", ")
        ),
    }
}

fn flow_ok(v: &Value) -> bool {
    match v {
        Value::Array(a) => a.is_empty() || (a.len() <= MAX_FLOW_LIST && a.iter().all(is_scalar)),
        Value::Object(m) => m.is_empty() || (m.len() <= MAX_FLOW_MAP && m.values().all(is_scalar)),
        _ => true,
    }
}

fn emit_value_after_key(v: &Value, indent: usize, out: &mut String) {
    if flow_ok(v) {
        out.push(' ');
        out.push_str(&inline(v));
        out.push('\n');
        return;
    }
    out.push('\n');
    match v {
        Value::Object(m) => emit_map(m, indent + 2, out),
        Value::Array(a) => emit_seq(a, indent + 2, out),
        _ => unreachable!(),
    }
}

pub fn emit_map(map: &Map<String, Value>, indent: usize, out: &mut String) {
    for (k, v) in map {
        out.push_str(&" ".repeat(indent));
        out.push_str(&scalar(k));
        out.push(':');
        emit_value_after_key(v, indent, out);
    }
}

fn emit_seq(items: &[Value], indent: usize, out: &mut String) {
    for item in items {
        out.push_str(&" ".repeat(indent));
        out.push('-');
        match item {
            Value::Object(m) if !flow_ok(item) => {
                // First key on the dash line, the rest aligned under it.
                let mut inner = String::new();
                emit_map(m, indent + 2, &mut inner);
                out.push(' ');
                out.push_str(inner.trim_start());
            }
            Value::Array(a) if !flow_ok(item) => {
                out.push('\n');
                emit_seq(a, indent + 2, out);
            }
            _ => {
                out.push(' ');
                out.push_str(&inline(item));
                out.push('\n');
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn emit(v: Value) -> String {
        let mut s = String::new();
        emit_map(v.as_object().unwrap(), 0, &mut s);
        s
    }

    #[test]
    fn readable_frontmatter() {
        let out = emit(json!({
            "name": "Enter the Burned Chapel",
            "kind": "checkpoint",
            "characters": ["brother-aldric"],
            "requires": {"all": ["meet-aldric"], "any": ["buy-the-map", "bribe-the-guard"]},
            "pin": {"map": "ostgard", "x": 10, "y": 20},
            "danger": 3,
        }));
        assert_eq!(
            out,
            "name: Enter the Burned Chapel\nkind: checkpoint\ncharacters: [brother-aldric]\nrequires:\n  all: [meet-aldric]\n  any: [buy-the-map, bribe-the-guard]\npin: {map: ostgard, x: 10, y: 20}\ndanger: 3\n"
        );
    }

    #[test]
    fn quotes_ambiguous_strings_and_round_trips() {
        let v = json!({"a": "on", "b": "12", "c": "x: y", "d": "[weird]", "e": "-dash", "f": "line\nbreak", "g": "Mira's Map", "h": "Łucja Żółć"});
        let out = emit(v.clone());
        let back: Value = serde_yaml::from_str(&out).unwrap();
        assert_eq!(back, v);
        assert!(out.contains("h: Łucja Żółć\n"));
    }
}
