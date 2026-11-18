import { marked } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { imageUrl } from '../api';
import { openLightbox } from '../dialogs';
import { WIKI_RE, resolveLink } from '../links';
import { entityName, entityUrl } from '../schema';
import { useVault } from '../store';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function Markdown({ text }: { text: string }) {
  const { entities, byId } = useVault();
  const navigate = useNavigate();

  const html = useMemo(() => {
    const linked = text.replace(WIKI_RE, (_m, target: string, label?: string) => {
      const e = resolveLink(target, entities, byId);
      const shown = escapeHtml(label ?? (e ? entityName(e) : target));
      return e
        ? `<a class="wikilink wikilink-${e.type}" href="#${entityUrl(e)}">${shown}</a>`
        : `<span class="wikilink missing" title="No entry named “${escapeHtml(target)}” yet">${shown}</span>`;
    });
    // Vault images are written as ![alt](images/file.png); serve them through the API.
    const withImages = linked.replace(/(!\[[^\]]*\]\()(?:\.\.\/)*images\/([^)\s]+)/g, (_m, pre: string, f: string) => `${pre}${imageUrl(decodeURIComponent(f))}`);
    return marked.parse(withImages, { async: false, gfm: true, breaks: true });
  }, [text, entities, byId]);

  const onClick = (ev: MouseEvent) => {
    const img = (ev.target as HTMLElement).closest('.prose img') as HTMLImageElement | null;
    if (img) {
      openLightbox(img.src);
      return;
    }
    const a = (ev.target as HTMLElement).closest('a');
    if (!a) return;
    ev.preventDefault();
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#/')) navigate(href.slice(1));
    else if (/^(https?|mailto):/i.test(href)) openUrl(href).catch(() => {});
  };

  if (!text.trim()) return <p className="empty-note">Nothing written yet.</p>;
  return <div className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
