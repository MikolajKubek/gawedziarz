import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow,
  ReactFlowProvider, getViewportForBounds, useNodesInitialized, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus, LayoutGrid, MapPin, Plus, TriangleAlert, Users, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imageUrl } from '../api';
import { EntityView } from '../components/EntityView';
import { ask } from '../dialogs';
import { DEFAULT_KIND_ICON, KIND_ICONS } from '../icons';
import { asList, entityName, normalizeRequires, type Entity } from '../schema';
import { analyzeStory, autoLayout, storyEdges, wouldCycle, type Issue, type StoryEdgeKind } from '../story';
import { useVault } from '../store';

type Pos = Record<string, { x: number; y: number }>;

interface CardData extends Record<string, unknown> {
  entity: Entity;
  location?: string;
  characters: string[];
  issue?: Issue['level'];
  dim: boolean;
}
type CardNode = Node<CardData, 'story'>;


const StoryCard = memo(function StoryCard({ data, selected }: NodeProps<CardNode>) {
  const kind = String(data.entity.data.kind ?? 'event');
  const KindIcon = KIND_ICONS[kind] ?? DEFAULT_KIND_ICON;
  return (
    <div className={`story-card kind-${kind} ${selected ? 'selected' : ''} ${data.dim ? 'dim' : ''}`}>
      <Handle type="target" position={Position.Left} />
      {typeof data.entity.data.image === 'string' && data.entity.data.image && (
        <img className="sc-image" src={imageUrl(data.entity.data.image)} alt="" draggable={false} />
      )}
      <div className="sc-kind">
        <KindIcon size={13} strokeWidth={2} /> {kind}
        {data.issue && <span className={`sc-issue ${data.issue}`} title="See the problems list">{data.issue === 'error' ? '!' : '?'}</span>}
      </div>
      <div className="sc-title">{entityName(data.entity)}</div>
      {(data.location || data.characters.length > 0) && (
        <div className="sc-meta">
          {data.location && <span><MapPin size={12} /> {data.location}</span>}
          {data.characters.length > 0 && <span title={data.characters.join(', ')}><Users size={12} /> {data.characters.length}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { story: StoryCard };

const EDGE_COLORS = { all: '#a8a29e', any: '#e2b04a', excludes: '#ef5350' };
const EDGE_STYLE: Record<StoryEdgeKind, Partial<Edge>> = {
  all: { style: { stroke: EDGE_COLORS.all, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.all } },
  any: {
    style: { stroke: EDGE_COLORS.any, strokeWidth: 2, strokeDasharray: '7 5' },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.any },
    label: 'or',
  },
  excludes: {
    type: 'straight',
    style: { stroke: EDGE_COLORS.excludes, strokeWidth: 2, strokeDasharray: '3 6' },
    label: '✕',
  },
};

function related(nodes: Entity[], id: string): Set<string> {
  // ancestors + descendants of a node through requirements
  const out = new Set([id]);
  const prereqs = new Map(nodes.map((n) => { const r = normalizeRequires(n.data.requires); return [n.id, [...r.all, ...r.any]]; }));
  const walk = (start: string, next: (x: string) => string[]) => {
    const stack = [start];
    while (stack.length) for (const p of next(stack.pop()!)) if (!out.has(p)) { out.add(p); stack.push(p); }
  };
  walk(id, (x) => prereqs.get(x) ?? []);
  walk(id, (x) => nodes.filter((n) => prereqs.get(n.id)!.includes(x)).map((n) => n.id));
  return out;
}

function StoryGraph() {
  const { entities, byId, save, create, loading } = useVault();
  const { id: selectedId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const story = useMemo(() => entities.filter((e) => e.type === 'story'), [entities]);
  const [positions, setPositions] = useState<Pos | null>(null);
  const [mode, setMode] = useState<'requires' | 'excludes'>('requires');
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.getLayout().then((l) => setPositions(l.nodes ?? {})).catch(() => setPositions({}));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const issues = useMemo(() => analyzeStory(story), [story]);
  const issueByNode = useMemo(() => {
    const rank = { info: 0, warning: 1, error: 2 };
    const m = new Map<string, Issue['level']>();
    for (const i of issues) {
      if (!i.nodeId || i.level === 'info') continue;
      const cur = m.get(i.nodeId);
      if (!cur || rank[i.level] > rank[cur]) m.set(i.nodeId, i.level);
    }
    return m;
  }, [issues]);

  const auto = useMemo(() => autoLayout(story), [story]);
  const highlight = useMemo(
    () => (focus && selectedId && byId.has(selectedId) ? related(story, selectedId) : null),
    [focus, selectedId, story, byId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);

  // Fit everything into view until the user pans/zooms themselves. The canvas can change size
  // after the first render (window settling, side panel opening, node images loading), so refit
  // whenever the canvas resizes or nodes get measured — not just once.
  const nodesReady = useNodesInitialized();
  const userMoved = useRef(false);
  // Compute the viewport from the measured node bounds and the canvas's real size (React Flow's own
  // fitView() is queued until its next internal node update, which is hard to reason about here).
  const fitTimer = useRef<number | undefined>(undefined);
  const fitNow = useCallback(() => {
    const el = wrapper.current;
    const ids = flow.getNodes().map((n) => n.id);
    if (!el || ids.length === 0) return;
    const { width, height } = el.getBoundingClientRect();
    const bounds = flow.getNodesBounds(ids);
    if (!width || !height || !bounds.width) return;
    // Note: in React Flow v13 a bare number as padding means *pixels*; use percentages.
    flow.setViewport(getViewportForBounds(bounds, width, height, 0.2, 1.25, { x: '7%', y: '9%' }));
  }, [flow]);
  const autoFit = useCallback(() => {
    window.clearTimeout(fitTimer.current);
    fitTimer.current = window.setTimeout(() => {
      if (!userMoved.current) fitNow();
    }, 50);
  }, [fitNow]);
  useEffect(() => {
    if (nodesReady) autoFit();
  }, [nodesReady, nodes.length, autoFit]);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => autoFit());
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(fitTimer.current);
    };
  }, [autoFit, positions]);
  useEffect(() => {
    if (!positions) return;
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return story.map((e) => {
        const loc = byId.get(asList(e.data.location)[0]);
        return {
          ...old.get(e.id),
          id: e.id,
          type: 'story' as const,
          position: positions[e.id] ?? old.get(e.id)?.position ?? auto[e.id] ?? { x: 0, y: 0 },
          selected: e.id === selectedId,
          deletable: false,
          data: {
            entity: e,
            location: loc ? entityName(loc) : undefined,
            characters: asList(e.data.characters).map((c) => (byId.get(c) ? entityName(byId.get(c)!) : c)),
            issue: issueByNode.get(e.id),
            dim: !!highlight && !highlight.has(e.id),
          },
        };
      });
    });
  }, [story, positions, selectedId, auto, byId, issueByNode, highlight, setNodes]);

  const edges: Edge[] = useMemo(
    () =>
      storyEdges(story).map((se) => ({
        id: se.id,
        source: se.source,
        target: se.target,
        ...EDGE_STYLE[se.kind],
        data: { kind: se.kind },
        selected: se.id === selectedEdge,
        animated: se.id === selectedEdge,
        className: highlight && !(highlight.has(se.source) && highlight.has(se.target)) ? 'dim' : '',
        labelStyle: { fontFamily: 'var(--font-pixel)', fontSize: 12, fill: EDGE_COLORS[se.kind] },
        labelBgStyle: { fill: '#14161c' },
        labelBgPadding: [4, 2] as [number, number],
      })),
    [story, selectedEdge, highlight],
  );

  const persistLayout = useCallback((next: Pos) => {
    setPositions(next);
    api.saveLayout({ nodes: next }).catch(() => setToast('Could not save the layout.'));
  }, []);

  // ---- editing the graph = editing the markdown frontmatter ----

  const patch = useCallback(
    (id: string, fn: (data: Record<string, any>) => void) => {
      const e = byId.get(id);
      if (!e) return;
      const data = structuredClone(e.data);
      fn(data);
      return save({ ...e, data });
    },
    [byId, save],
  );

  const setRequires = (data: Record<string, any>, r: { all: string[]; any: string[] }) => {
    if (r.all.length + r.any.length === 0) delete data.requires;
    else data.requires = r.any.length ? r : { all: r.all };
  };

  const onConnect = useCallback(
    async ({ source, target }: Connection) => {
      if (!source || !target || source === target) return;
      if (mode === 'excludes') {
        const add = (a: string, b: string) => patch(a, (d) => { d.excludes = [...new Set([...asList(d.excludes), b])]; });
        await Promise.all([add(source, target), add(target, source)]);
        return;
      }
      if (wouldCycle(story, source, target)) {
        setToast('That link would create a loop — a node cannot (indirectly) require itself.');
        return;
      }
      await patch(target, (d) => {
        const r = normalizeRequires(d.requires);
        setRequires(d, { all: [...new Set([...r.all, source])], any: r.any.filter((x) => x !== source) });
      });
    },
    [mode, patch, story],
  );

  const removeEdge = useCallback(
    async (edgeId: string) => {
      const se = storyEdges(story).find((e) => e.id === edgeId);
      if (!se) return;
      if (se.kind === 'excludes') {
        const drop = (a: string, b: string) => patch(a, (d) => {
          const left = asList(d.excludes).filter((x) => x !== b);
          if (left.length) d.excludes = left; else delete d.excludes;
        });
        await Promise.all([drop(se.source, se.target), drop(se.target, se.source)]);
      } else {
        await patch(se.target, (d) => {
          const r = normalizeRequires(d.requires);
          setRequires(d, { all: r.all.filter((x) => x !== se.source), any: r.any.filter((x) => x !== se.source) });
        });
      }
      setSelectedEdge(null);
    },
    [story, patch],
  );

  const toggleEdgeKind = useCallback(
    async (edgeId: string) => {
      const se = storyEdges(story).find((e) => e.id === edgeId);
      if (!se || se.kind === 'excludes') return;
      await patch(se.target, (d) => {
        const r = normalizeRequires(d.requires);
        const toAny = se.kind === 'all';
        setRequires(d, {
          all: toAny ? r.all.filter((x) => x !== se.source) : [...r.all, se.source],
          any: toAny ? [...r.any, se.source] : r.any.filter((x) => x !== se.source),
        });
      });
      setSelectedEdge(`${se.kind === 'all' ? 'any' : 'all'}:${se.source}>${se.target}`);
    },
    [story, patch],
  );

  const onCreate = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!newName.trim()) return;
    const rect = wrapper.current!.getBoundingClientRect();
    const at = flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 200, y: rect.top + rect.height / 2 });
    const e = await create('story', newName.trim(), { kind: 'event' });
    setNewName('');
    persistLayout({ ...(positions ?? {}), [e.id]: at });
    navigate(`/story/${e.id}?edit=1`);
  };

  const arrange = async () => {
    if (!(await ask('Re-arrange every node automatically? Your manual placement will be lost.'))) return;
    persistLayout(autoLayout(story));
    userMoved.current = false;
    setTimeout(fitNow, 120);
  };

  const goTo = (id: string) => {
    navigate(`/story/${id}`);
    const n = flow.getNode(id);
    if (n) flow.setCenter(n.position.x + 100, n.position.y + 40, { zoom: 1.1, duration: 400 });
  };

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const edgeInfo = selectedEdge ? storyEdges(story).find((e) => e.id === selectedEdge) : undefined;
  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.filter((i) => i.level === 'warning').length;

  if (loading || !positions) return <div className="page"><p className="empty-note">Loading…</p></div>;

  return (
    <div className="story-layout">
      <div className="story-canvas" ref={wrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onMoveStart={(e) => { if (e) userMoved.current = true; }}
          onConnect={onConnect}
          onNodeClick={(_, n) => { setSelectedEdge(null); navigate(`/story/${n.id}`); }}
          onEdgeClick={(_, e) => setSelectedEdge(e.id)}
          onPaneClick={() => { setSelectedEdge(null); if (selectedId) navigate('/story'); }}
          onEdgesDelete={(es) => es.forEach((e) => removeEdge(e.id))}
          onNodeDragStop={(_, __, dragged) => {
            const next = { ...(positions ?? {}) };
            for (const n of nodes) next[n.id] ??= n.position;
            for (const n of dragged) next[n.id] = n.position;
            persistLayout(next);
          }}
          deleteKeyCode={['Delete', 'Backspace']}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#2c303a" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => (n.data as CardData).issue === 'error' ? '#ef5350' : '#e2b04a'} maskColor="rgba(10,11,14,0.6)" bgColor="#14161c" />

          <Panel position="top-left" className="graph-toolbar">
            <form onSubmit={onCreate} className="new-form">
              <input value={newName} placeholder="New story node…" onChange={(e) => setNewName(e.target.value)} />
              <button className="btn btn-primary btn-icon" type="submit" title="Add node"><Plus size={16} /></button>
            </form>
            <div className="mode-toggle" title="What dragging from one node's right handle to another node creates">
              <span>Link</span>
              <button className={mode === 'requires' ? 'on' : ''} onClick={() => setMode('requires')}>→ requires</button>
              <button className={mode === 'excludes' ? 'on excl' : ''} onClick={() => setMode('excludes')}>✕ excludes</button>
            </div>
            <div className="toolbar-row">
              <button className="btn btn-small" onClick={arrange}><LayoutGrid size={13} /> Arrange</button>
              <button className={`btn btn-small ${focus ? 'btn-on' : ''}`} onClick={() => setFocus(!focus)} title="Dim everything not connected to the selected node">
                <Focus size={13} /> Focus
              </button>
              <button className={`btn btn-small ${errorCount ? 'btn-alert' : ''}`} onClick={() => setShowIssues(!showIssues)}>
                <TriangleAlert size={13} /> {errorCount + warnCount > 0 ? errorCount + warnCount : 'OK'}
              </button>
            </div>
            <div className="legend">
              <span><i className="lg-all" /> all of</span>
              <span><i className="lg-any" /> any of</span>
              <span><i className="lg-ex" /> excludes</span>
            </div>
          </Panel>



          {showIssues && (
            <Panel position="top-right" className="issues-panel">
              <header>
                <h3>Problems</h3>
                <button className="close" onClick={() => setShowIssues(false)}><X size={18} /></button>
              </header>
              {issues.length === 0 ? (
                <p className="empty-note">The tale holds together. No problems found.</p>
              ) : (
                <ul>
                  {issues.map((i, k) => (
                    <li key={k} className={`issue ${i.level}`} onClick={() => i.nodeId && goTo(i.nodeId)}>
                      <span className="issue-level">{i.level}</span> {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {toast && <Panel position="bottom-right" className="toast">{toast}</Panel>}
        </ReactFlow>
      </div>

      {(selected?.type === 'story' || edgeInfo) && (
        <aside className="side-panel">
          <button className="close" onClick={() => { setSelectedEdge(null); navigate('/story'); }}><X size={18} /></button>
          {edgeInfo ? (
            <div className="edge-panel">
              <div className="entity-kind">Link</div>
              {edgeInfo.kind === 'excludes' ? (
                <p><b>{entityName(byId.get(edgeInfo.source)!)}</b> and <b>{entityName(byId.get(edgeInfo.target)!)}</b> are mutually exclusive — completing one closes the other.</p>
              ) : (
                <p>
                  <b>{entityName(byId.get(edgeInfo.target)!)}</b> requires <b>{entityName(byId.get(edgeInfo.source)!)}</b>
                  {edgeInfo.kind === 'any' ? ' — or one of its other “any of” requirements.' : '.'}
                </p>
              )}
              <div className="toolbar-row">
                {edgeInfo.kind !== 'excludes' && (
                  <button className="btn" onClick={() => toggleEdgeKind(edgeInfo.id)}>
                    Make it “{edgeInfo.kind === 'all' ? 'any of' : 'all of'}”
                  </button>
                )}
                <button className="btn btn-danger" onClick={() => removeEdge(edgeInfo.id)}>Remove link</button>
              </div>
            </div>
          ) : (
            selected && <EntityView entity={selected} startEditing={search.has('edit')} onDeleted={() => navigate('/story')} />
          )}
        </aside>
      )}
    </div>
  );
}

export function StoryGraphPage() {
  return (
    <ReactFlowProvider>
      <StoryGraph />
    </ReactFlowProvider>
  );
}
