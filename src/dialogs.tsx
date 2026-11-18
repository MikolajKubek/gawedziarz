// Dialogs that work inside the desktop webview (window.prompt/confirm/open are unreliable there).
import { ask as nativeAsk, message } from '@tauri-apps/plugin-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const ask = (text: string, title = 'Gawędziarz') =>
  nativeAsk(text, { title, kind: 'warning', okLabel: 'Yes', cancelLabel: 'Cancel' });

export const notify = (text: string, title = 'Gawędziarz') => message(text, { title, kind: 'error' });

// ── text prompt & lightbox: tiny event bus + one host component mounted in App ──

type PromptReq = { title: string; placeholder?: string; resolve: (v: string | null) => void };
const bus = new EventTarget();

export function promptText(title: string, placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => bus.dispatchEvent(new CustomEvent('prompt', { detail: { title, placeholder, resolve } })));
}

export function openLightbox(src: string) {
  bus.dispatchEvent(new CustomEvent('lightbox', { detail: src }));
}

export function DialogHost() {
  const [prompt, setPrompt] = useState<PromptReq | null>(null);
  const [value, setValue] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      setValue('');
      setPrompt((e as CustomEvent<PromptReq>).detail);
    };
    const onLightbox = (e: Event) => setLightbox((e as CustomEvent<string>).detail);
    bus.addEventListener('prompt', onPrompt);
    bus.addEventListener('lightbox', onLightbox);
    return () => {
      bus.removeEventListener('prompt', onPrompt);
      bus.removeEventListener('lightbox', onLightbox);
    };
  }, []);

  useEffect(() => {
    if (prompt) setTimeout(() => input.current?.focus(), 0);
  }, [prompt]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const finish = (v: string | null) => {
    prompt?.resolve(v);
    setPrompt(null);
  };

  return (
    <>
      {prompt && (
        <div className="modal-backdrop" onMouseDown={() => finish(null)}>
          <form
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              finish(value.trim() || null);
            }}
          >
            <h3>{prompt.title}</h3>
            <input ref={input} value={value} placeholder={prompt.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && finish(null)} />
            <div className="toolbar-row modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => finish(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">OK</button>
            </div>
          </form>
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
          <button className="close lightbox-close"><X size={22} /></button>
        </div>
      )}
    </>
  );
}
