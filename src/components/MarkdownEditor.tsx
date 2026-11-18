import { ImagePlus } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { uploadImage } from '../api';
import { TypeIcon } from '../icons';
import { TYPE_BY_KEY, asList, entityName } from '../schema';
import { useVault } from '../store';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/** Pixel position of the caret inside a textarea, using a hidden mirror element. */
function caretCoords(ta: HTMLTextAreaElement, pos: number) {
  const div = document.createElement('div');
  const style = getComputedStyle(ta);
  for (const p of [
    'boxSizing', 'width', 'padding', 'border', 'fontFamily', 'fontSize', 'fontWeight',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'whiteSpace', 'wordWrap',
  ] as const) {
    (div.style as any)[p] = (style as any)[p];
  }
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';
  div.textContent = ta.value.slice(0, pos);
  const span = document.createElement('span');
  span.textContent = '​';
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop - ta.scrollTop + parseFloat(style.lineHeight || '20');
  const left = span.offsetLeft - ta.scrollLeft;
  document.body.removeChild(div);
  return { top, left };
}

export function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const { entities } = useVault();
  const ta = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Auto-grow.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 240) + 'px';
  }, [value]);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return entities
      .filter(
        (e) =>
          entityName(e).toLowerCase().includes(q) ||
          e.id.includes(q) ||
          asList(e.data.aliases).some((a) => a.toLowerCase().includes(q)),
      )
      .sort((a, b) => entityName(a).localeCompare(entityName(b)))
      .slice(0, 8);
  }, [query, entities]);

  const updateQuery = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/\[\[([^\]\[|\n]*)$/);
    if (m) {
      setQuery({ text: m[1], start: el.selectionStart - m[1].length });
      setActive(0);
      const c = caretCoords(el, el.selectionStart);
      setCoords({ top: c.top + el.offsetTop, left: c.left + el.offsetLeft });
    } else setQuery(null);
  };

  const insert = (id: string) => {
    const el = ta.current;
    if (!el || !query) return;
    const after = value.slice(el.selectionStart).replace(/^[^\]\n]*\]\]/, '');
    const next = value.slice(0, query.start) + id + ']]' + after;
    onChange(next);
    setQuery(null);
    const caret = query.start + id.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // ---- inline images: paste, drop or pick a file ----
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const insertImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    const el = ta.current;
    const at = el ? el.selectionStart : valueRef.current.length;
    setUploading((n) => n + images.length);
    try {
      const names = await Promise.all(images.map(uploadImage));
      const snippet = names
        .map((n, i) => `![${images[i].name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')}](images/${n})`)
        .join('\n');
      const cur = valueRef.current;
      const before = cur.slice(0, at);
      const pre = before && !before.endsWith('\n') ? '\n\n' : '';
      onChange(before + pre + snippet + '\n' + cur.slice(at));
    } catch (e) {
      alert(String(e));
    } finally {
      setUploading((n) => n - images.length);
    }
    return true;
  };

  const onPaste = (ev: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...ev.clipboardData.files];
    if (files.some((f) => f.type.startsWith('image/'))) {
      ev.preventDefault();
      insertImages(files);
    }
  };
  const onDrop = (ev: DragEvent<HTMLTextAreaElement>) => {
    setDragOver(false);
    const files = [...ev.dataTransfer.files];
    if (files.length) {
      ev.preventDefault();
      insertImages(files);
    }
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!query || matches.length === 0) return;
    if (ev.key === 'ArrowDown') setActive((a) => (a + 1) % matches.length);
    else if (ev.key === 'ArrowUp') setActive((a) => (a - 1 + matches.length) % matches.length);
    else if (ev.key === 'Enter' || ev.key === 'Tab') insert(matches[active].id);
    else if (ev.key === 'Escape') setQuery(null);
    else return;
    ev.preventDefault();
  };

  return (
    <div className={`md-editor ${dragOver ? 'drag-over' : ''}`}>
      <div className="md-toolbar">
        <span className="md-hint">Markdown · type <code>[[</code> to link · paste or drop images</span>
        {uploading > 0 && <span className="md-hint">Uploading {uploading}…</span>}
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { insertImages([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <button className="btn btn-small btn-ghost" onClick={() => fileInput.current?.click()}>
          <ImagePlus size={13} /> Image
        </button>
      </div>
      <textarea
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        ref={ta}
        value={value}
        placeholder={placeholder ?? 'Write in markdown. Type [[ to link to another entry…'}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => updateQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        spellCheck
      />
      {query && matches.length > 0 && (
        <ul className="autocomplete" style={{ top: coords.top + 4, left: Math.min(coords.left, 420) }}>
          {matches.map((e, i) => (
            <li
              key={e.id}
              className={i === active ? 'active' : ''}
              onMouseDown={(ev) => {
                ev.preventDefault();
                insert(e.id);
              }}
            >
              <TypeIcon type={e.type} size={14} className="ac-icon" />
              {entityName(e)}
              <span className="ac-type">{TYPE_BY_KEY[e.type].label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
