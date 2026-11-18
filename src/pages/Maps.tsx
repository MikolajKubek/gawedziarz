import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronRight, ImagePlus, LogIn, Map as MapIcon, MapPin, MapPinOff, Move, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { imageUrl, mapUrl, uploadMap } from '../api';
import { EntityView } from '../components/EntityView';
import { promptText } from '../dialogs';
import { TYPE_ICONS } from '../icons';
import { getPin, hasMap, hostMap, mapEntities, mapTrail, type Pin } from '../maps';
import { entityName, type Entity } from '../schema';
import { useVault } from '../store';

// ───────────────────────── index: all maps ─────────────────────────

export function MapsIndex() {
  const { entities, byId, create, save } = useVault();
  const navigate = useNavigate();
  const hosts = entities.filter(hasMap);
  const roots = hosts.filter((h) => !hostMap(h, byId));
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const createWorld = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const map = await uploadMap(file);
      const e = await create('location', name.trim() || 'The World', { kind: 'World' });
      await save({ ...e, data: { ...e.data, map } });
      navigate(`/maps/${e.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><MapIcon size={26} className="page-icon" /> Maps</h1>
        <div className="new-form">
          <input value={name} placeholder="New world map name…" onChange={(e) => setName(e.target.value)} />
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => createWorld(e.target.files?.[0])} />
          <button className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus size={15} /> {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </header>
      <p className="hint">
        Any location can have its own map — open the location, click <b>Edit</b> and upload an image. Places inside it
        (by their <i>Inside of</i> field) and characters located there can then be pinned on it.
      </p>
      {hosts.length === 0 ? (
        <p className="empty-note">No maps yet. Upload a drawing of your world to begin.</p>
      ) : (
        <ul className="map-grid">
          {[...roots, ...hosts.filter((h) => !roots.includes(h))].map((h) => {
            const trail = mapTrail(h.id, byId);
            return (
              <li key={h.id}>
                <Link to={`/maps/${h.id}`} className="map-card">
                  <img src={mapUrl(h.data.map)} alt="" />
                  <div className="map-card-body">
                    <div className="card-title">{entityName(h)}</div>
                    <div className="card-sub">
                      {trail.length > 1 ? trail.slice(0, -1).map(entityName).join(' › ') : 'Top level'} ·{' '}
                      {mapEntities(h, entities, byId).filter((e) => getPin(e, h.id)).length} pins
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── single map ─────────────────────────

const iconHtml = (e: Entity, selected: boolean, sub: boolean) => {
  const Icon = TYPE_ICONS[e.type];
  const img = typeof e.data.image === 'string' && e.data.image ? imageUrl(e.data.image) : null;
  const glyph = img && e.type === 'character'
    ? `<img src="${img}" alt="" draggable="false" />`
    : renderToStaticMarkup(<Icon size={14} strokeWidth={2.2} />);
  const subGlyph = sub ? renderToStaticMarkup(<MapIcon size={10} strokeWidth={2.5} />) : '';
  const label = entityName(e).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div class="pin pin-${e.type}${selected ? ' selected' : ''}${sub ? ' has-map' : ''}${img && e.type === 'character' ? ' has-avatar' : ''}">
    <span class="pin-dot">${glyph}${sub ? `<span class="pin-sub">${subGlyph}</span>` : ''}</span>
    <span class="pin-label">${label}</span></div>`;
};

type Placing = { kind: 'existing'; id: string } | { kind: 'new' } | null;

export function MapView() {
  const { id = '' } = useParams();
  const { entities, byId, save, create, loading } = useVault();
  const navigate = useNavigate();
  const host = byId.get(id);
  const file = hasMap(host) ? String(host!.data.map) : null;

  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState<Placing>(null);

  // Keep latest values reachable from Leaflet callbacks.
  const live = useRef({ placing, editing, size, host });
  live.current = { placing, editing, size, host };

  const members = useMemo(() => (host ? mapEntities(host, entities, byId) : []), [host, entities, byId]);
  const placed = useMemo(() => members.filter((m) => getPin(m, id)), [members, id]);
  const unplaced = useMemo(() => members.filter((m) => !getPin(m, id)), [members, id]);
  const trail = useMemo(() => (host ? mapTrail(host.id, byId) : []), [host, byId]);

  // Image dimensions.
  useEffect(() => {
    setSize(null);
    setSelected(null);
    setPlacing(null);
    if (!file) return;
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 });
    img.onerror = () => setSize({ w: 1000, h: 1000 });
    img.src = mapUrl(file);
  }, [file]);

  const toLatLng = (p: Pin, h: number) => L.latLng(h - p.y, p.x);
  const toPin = (ll: L.LatLng, h: number): Pin => ({ map: id, x: Math.round(ll.lng), y: Math.round(h - ll.lat) });

  const setPin = (e: Entity, pin: Pin | undefined) => {
    const data = { ...e.data };
    if (pin) data.pin = pin;
    else delete data.pin;
    return save({ ...e, data });
  };

  // Create the Leaflet map once per image.
  useEffect(() => {
    if (!el.current || !size || !file) return;
    const bounds = L.latLngBounds([0, 0], [size.h, size.w]);
    const map = L.map(el.current, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      maxBounds: bounds.pad(0.5),
    });
    L.imageOverlay(mapUrl(file), bounds).addTo(map);
    map.fitBounds(bounds);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', async (ev: L.LeafletMouseEvent) => {
      const { placing, size, host } = live.current;
      if (!placing || !size || !host) {
        setSelected(null);
        return;
      }
      const pin = toPin(ev.latlng, size.h);
      if (placing.kind === 'existing') {
        const target = byIdRef.current.get(placing.id);
        if (target) await setPin(target, pin);
        setSelected(placing.id);
      } else {
        const name = await promptText('New location', 'Name of the new location');
        if (name?.trim()) {
          const e = await create('location', name.trim(), { parent: host.id, pin });
          setSelected(e.id);
        }
      }
      setPlacing(null);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, file]);

  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  // Sync markers.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !size) return;
    layer.clearLayers();
    for (const e of placed) {
      const sub = hasMap(e);
      const marker = L.marker(toLatLng(getPin(e, id)!, size.h), {
        icon: L.divIcon({ className: 'pin-wrap', html: iconHtml(e, e.id === selected, sub), iconSize: [0, 0] }),
        draggable: editing,
        keyboard: false,
        zIndexOffset: e.type === 'location' ? 100 : 200,
      });
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        setSelected(e.id);
      });
      marker.on('dblclick', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (sub) navigate(`/maps/${e.id}`);
      });
      marker.on('dragend', () => setPin(e, toPin(marker.getLatLng(), size.h)));
      marker.addTo(layer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, size, selected, editing]);

  useEffect(() => {
    el.current?.classList.toggle('placing', !!placing);
  }, [placing]);

  if (loading) return <div className="page"><p className="empty-note">Loading…</p></div>;
  if (!host || !file)
    return (
      <div className="page">
        <h1>No map here</h1>
        <p className="empty-note">This location has no map image yet.</p>
        <Link to="/maps">← All maps</Link>
      </div>
    );

  const sel = selected ? byId.get(selected) : undefined;

  return (
    <div className="map-layout">
      <div className="map-main">
        <div className="map-topbar">
          <nav className="crumbs">
            <Link to="/maps"><MapIcon size={14} /></Link>
            {trail.map((t, i) => (
              <span key={t.id} className="crumb">
                <ChevronRight size={14} className="muted-icon" />
                {i === trail.length - 1 ? <b>{entityName(t)}</b> : <Link to={`/maps/${t.id}`}>{entityName(t)}</Link>}
              </span>
            ))}
          </nav>
          <div className="toolbar-row">
            {editing && (
              <button className={`btn btn-small ${placing?.kind === 'new' ? 'btn-on' : ''}`} onClick={() => setPlacing(placing?.kind === 'new' ? null : { kind: 'new' })}>
                <Plus size={13} /> New location
              </button>
            )}
            <button className={`btn btn-small ${editing ? 'btn-on' : ''}`} onClick={() => { setEditing(!editing); setPlacing(null); }}>
              <Move size={13} /> {editing ? 'Done placing' : 'Edit pins'}
            </button>
          </div>
        </div>
        <div className="map-canvas" ref={el} />
        {placing && (
          <div className="map-hint">
            {placing.kind === 'new' ? 'Click the map where the new location should be' : `Click the map to place “${entityName(byId.get(placing.id)!)}”`}
            <button className="btn btn-small btn-ghost" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        )}
      </div>

      <aside className="side-panel map-panel">
        {sel ? (
          <>
            <button className="close" onClick={() => setSelected(null)}><X size={18} /></button>
            <div className="toolbar-row panel-actions">
              {hasMap(sel) && (
                <Link className="btn btn-primary btn-small" to={`/maps/${sel.id}`}><LogIn size={13} /> Enter map</Link>
              )}
              {getPin(sel, id) && editing && (
                <button className="btn btn-small btn-ghost" onClick={() => { setPin(sel, undefined); setSelected(null); }}>
                  <MapPinOff size={13} /> Remove pin
                </button>
              )}
              {!getPin(sel, id) && hostMap(sel, byId)?.id === host.id && (
                <button className="btn btn-small" onClick={() => { setEditing(true); setPlacing({ kind: 'existing', id: sel.id }); }}>
                  <MapPin size={13} /> Place on map
                </button>
              )}
            </div>
            <EntityView entity={sel} onDeleted={() => setSelected(null)} />
          </>
        ) : (
          <>
            <div className="entity-kind"><MapIcon size={14} /> Map</div>
            <h2 className="panel-title"><Link to={`/locations/${host.id}`}>{entityName(host)}</Link></h2>
            <h4 className="panel-section">On this map · {placed.length}</h4>
            <ul className="pin-list">
              {placed.map((e) => {
                const Icon = TYPE_ICONS[e.type];
                return (
                  <li key={e.id}>
                    <button onClick={() => { setSelected(e.id); mapRef.current?.panTo(toLatLng(getPin(e, id)!, size!.h)); }}>
                      <Icon size={14} /> {entityName(e)}
                      {hasMap(e) && <span className="badge">map</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {unplaced.length > 0 && (
              <>
                <h4 className="panel-section">Not placed yet · {unplaced.length}</h4>
                <p className="hint small">Locations inside {entityName(host)} and characters located here. Pick one, then click the map.</p>
                <ul className="pin-list">
                  {unplaced.map((e) => {
                    const Icon = TYPE_ICONS[e.type];
                    const active = placing?.kind === 'existing' && placing.id === e.id;
                    return (
                      <li key={e.id}>
                        <button className={active ? 'active' : ''} onClick={() => { setEditing(true); setPlacing(active ? null : { kind: 'existing', id: e.id }); }}>
                          <Icon size={14} /> {entityName(e)} <MapPin size={13} className="pin-cta" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="hint small">Tip: double-click a pin with a <MapIcon size={11} /> badge to open its own map.</p>
          </>
        )}
      </aside>
    </div>
  );
}
