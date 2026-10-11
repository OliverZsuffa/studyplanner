import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowDownToLine, ArrowUpFromLine, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, FilePlus2, Filter, GraduationCap, LayoutGrid, List,
  Plus, Search, Settings2, Sparkles, Target, X, Zap,
} from 'lucide-react';
import { getAvailableModules, getProgress, statusLabels, type Dependency, type ModuleStatus, type StudyModule, type StudyPlan } from './model';
import { samplePlan } from './samplePlan';

const STORAGE_KEY = 'studyplanner.plan.v1';

function readSavedPlan(): StudyPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StudyPlan;
      if (Array.isArray(parsed.modules) && Array.isArray(parsed.dependencies)) return parsed;
    }
  } catch {
    // Fall back to the sample if local data is invalid.
  }
  return samplePlan;
}

type ModuleNodeData = {
  module: StudyModule;
  available: boolean;
  selected: boolean;
  incoming: number;
  outgoing: number;
  onSelect: (id: string) => void;
};
type ModuleFlowNode = Node<ModuleNodeData, 'moduleCard'>;

function ModuleCard({ data }: NodeProps<ModuleFlowNode>) {
  const { module, available, selected, incoming, outgoing, onSelect } = data;
  return (
    <div className={['module-node', 'status-' + module.status, selected ? 'is-selected' : '', available ? 'is-available' : ''].join(' ')} onClick={() => onSelect(module.id)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-topline">
        <span className="node-code">{module.code}</span>
        {module.status === 'completed' ? <CheckCircle2 size={15} /> : available ? <span className="available-dot" /> : null}
      </div>
      <div className="node-title">{module.title}</div>
      <div className="node-meta"><span>{module.ects} ECTS</span><span>Semester {module.semester}</span></div>
      <div className="node-bottom">
        <span className={'node-status status-label-' + module.status}>{module.status === 'completed' ? 'Completed' : module.status === 'in-progress' ? 'In progress' : available ? 'Available next' : 'Later'}</span>
        <span className="node-links">{incoming + outgoing > 0 ? incoming + outgoing + ' links' : 'No links'}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { moduleCard: ModuleCard };

function makeGraph(plan: StudyPlan, available: Set<string>, selectedId: string | null, onSelect: (id: string) => void) {
  const bySemester = new Map<number, StudyModule[]>();
  plan.modules.forEach((module) => {
    const group = bySemester.get(module.semester) ?? [];
    group.push(module);
    bySemester.set(module.semester, group);
  });
  const positions = new Map<string, { x: number; y: number }>();
  [...bySemester.entries()].sort(([a], [b]) => a - b).forEach(([semester, modules]) => {
    modules.forEach((module, index) => positions.set(module.id, { x: 80 + (semester - 1) * 340, y: 70 + index * 174 }));
  });
  const nodes: ModuleFlowNode[] = plan.modules.map((module) => ({
    id: module.id,
    type: 'moduleCard',
    position: positions.get(module.id) ?? { x: 80, y: 70 },
    data: {
      module,
      available: available.has(module.id),
      selected: selectedId === module.id,
      incoming: plan.dependencies.filter((dependency) => dependency.target === module.id).length,
      outgoing: plan.dependencies.filter((dependency) => dependency.source === module.id).length,
      onSelect,
    },
    draggable: true,
  }));
  const edges: Edge[] = plan.dependencies.map((dependency) => ({
    id: dependency.id,
    source: dependency.source,
    target: dependency.target,
    type: 'smoothstep',
    animated: dependency.kind === 'required',
    label: dependency.kind === 'required' ? 'Required' : 'Recommended',
    labelStyle: { fontSize: 10, fontWeight: 600, fill: dependency.kind === 'required' ? '#6b55b5' : '#748276' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.94 },
    labelBgPadding: [5, 3] as [number, number],
    labelBgBorderRadius: 5,
    style: dependency.kind === 'required'
      ? { stroke: '#8b72d6', strokeWidth: 2 }
      : { stroke: '#a8b3a5', strokeWidth: 1.5, strokeDasharray: '5 5' },
    markerEnd: { type: 'arrowclosed' as const, color: dependency.kind === 'required' ? '#8b72d6' : '#a8b3a5' },
  }));
  return { nodes, edges };
}

function downloadJson(plan: StudyPlan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'studyplanner-backup.json';
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [plan, setPlan] = useState<StudyPlan>(readSavedPlan);
  const [selectedId, setSelectedId] = useState<string | null>('algorithms');
  const [query, setQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSemester, setNewSemester] = useState('1');
  const [newEcts, setNewEcts] = useState('5');
  const [newCategory, setNewCategory] = useState('Core');
  const [newDependency, setNewDependency] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const available = useMemo(() => getAvailableModules(plan), [plan]);
  const progress = useMemo(() => getProgress(plan), [plan]);
  const selected = plan.modules.find((module) => module.id === selectedId) ?? null;
  const filteredModules = useMemo(() => plan.modules.filter((module) => {
    const matchesQuery = (module.title + ' ' + module.code + ' ' + module.category).toLowerCase().includes(query.toLowerCase());
    const matchesSemester = semesterFilter === 'all' || String(module.semester) === semesterFilter;
    const matchesStatus = statusFilter === 'all' || module.status === statusFilter;
    return matchesQuery && matchesSemester && matchesStatus;
  }), [plan.modules, query, semesterFilter, statusFilter]);
  const readyModules = plan.modules.filter((module) => available.has(module.id) && module.status !== 'completed');
  const requiredIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'required') : [];
  const recommendedIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'recommended') : [];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);

  const selectModule = useCallback((id: string) => setSelectedId(id), []);
  const graph = useMemo(() => makeGraph(plan, available, selectedId, selectModule), [plan, available, selectedId, selectModule]);
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);

  useEffect(() => {
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
    });
    setEdges(graph.edges);
  }, [graph, setEdges, setNodes]);

  const changeStatus = (id: string, status: ModuleStatus) => {
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === id ? { ...module, status } : module) }));
    setToast('Progress updated');
  };

  const updateSelected = (patch: Partial<StudyModule>) => {
    if (!selected) return;
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, ...patch } : module) }));
  };

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const duplicate = plan.dependencies.some((dependency) => dependency.source === connection.source && dependency.target === connection.target);
    if (duplicate) return;
    const dependency: Dependency = {
      id: 'dep-' + Date.now().toString(36),
      source: connection.source,
      target: connection.target,
      kind: 'recommended',
      provenance: 'user',
      note: 'Added manually by you.',
    };
    setPlan((current) => ({ ...current, dependencies: [...current.dependencies, dependency] }));
  }, [plan.dependencies]);

  const addModule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const id = 'module-' + Date.now().toString(36);
    const module: StudyModule = {
      id, title, code: 'CUSTOM', semester: Math.max(1, Number(newSemester) || 1),
      ects: Math.max(0, Number(newEcts) || 0), status: 'not-started',
      description: 'Added by you. Edit this description to capture the module details.',
      category: newCategory.trim() || 'Other',
    };
    const dependency = newDependency ? {
      id: 'dep-' + Date.now().toString(36), source: newDependency, target: id,
      kind: 'recommended' as const, provenance: 'user' as const, note: 'Added manually by you.',
    } : null;
    setPlan((current) => ({ ...current, modules: [...current.modules, module], dependencies: dependency ? [...current.dependencies, dependency] : current.dependencies }));
    setSelectedId(id);
    setNewTitle('');
    setShowAdd(false);
    setToast('Module added');
  };

  const importPlan = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as StudyPlan;
        if (!imported || !Array.isArray(imported.modules) || !Array.isArray(imported.dependencies)) throw new Error('Invalid plan');
        setPlan(imported);
        setSelectedId(imported.modules[0]?.id ?? null);
        setToast('Plan imported');
      } catch {
        setToast('That file is not a valid Studyplanner JSON backup');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Studyplanner home">
          <span className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></span>
          <span>study<span className="brand-light">planner</span></span>
        </a>
        <div className="topbar-context"><span className="context-dot" /> YOUR DEGREE, IN FOCUS</div>
        <div className="topbar-actions">
          <button className="button button-quiet" onClick={() => downloadJson(plan)}><ArrowDownToLine size={16} /> Export</button>
          <button className="button button-quiet" onClick={() => importRef.current?.click()}><ArrowUpFromLine size={16} /> Import</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importPlan} />
          <button className="avatar-button" title="Local workspace"><span>O</span></button>
        </div>
      </header>

      <main className="workspace">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> YOUR PERSONAL STUDY MAP</div>
            <h1>Make your degree <span>make sense.</span></h1>
            <p className="welcome-copy">See the connections. Find your next step. Make the plan yours.</p>
          </div>
          <div className="plan-picker">
            <div className="plan-icon"><BookOpen size={18} /></div>
            <div className="plan-label"><span>YOUR STUDY PLAN</span><strong>{plan.name}</strong><small>{plan.institution}</small></div>
            <ChevronDown size={16} className="muted-icon" />
          </div>
        </section>

        <section className="stats-grid" aria-label="Study progress">
          <div className="stat-card progress-card">
            <div className="stat-heading"><span>Overall progress</span><span className="stat-icon lilac"><Target size={17} /></span></div>
            <div className="stat-number">{progress.percent}<span className="stat-unit">%</span></div>
            <div className="progress-track"><span style={{ width: progress.percent + '%' }} /></div>
            <div className="stat-foot">{progress.completed} of {progress.total} modules completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-heading"><span>Credits earned</span><span className="stat-icon mint"><GraduationCap size={17} /></span></div>
            <div className="stat-number">{progress.completedEcts}<span className="stat-unit"> / {progress.totalEcts}</span></div>
            <div className="stat-foot">ECTS credits completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-heading"><span>Ready to take</span><span className="stat-icon amber"><Zap size={17} /></span></div>
            <div className="stat-number">{readyModules.length}<span className="stat-unit"> modules</span></div>
            <div className="stat-foot">No required prerequisites outstanding</div>
          </div>
          <div className="stat-card next-card">
            <div className="stat-heading"><span>A good next step</span><span className="stat-icon blue"><Sparkles size={17} /></span></div>
            <div className="next-course">{readyModules.find((module) => module.status === 'in-progress')?.title ?? readyModules[0]?.title ?? 'You are all caught up'}</div>
            <button className="text-link" onClick={() => { if (readyModules[0]) { setSelectedId(readyModules[0].id); setView('graph'); } }}>Explore your next step <span>↗</span></button>
          </div>
        </section>

        <section className="planner-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE BIG PICTURE</div>
              <h2>Your study map</h2>
              <p>Follow the paths between modules. Move cards around to organise your view.</p>
            </div>
            <div className="view-toggle" aria-label="Choose view">
              <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><LayoutGrid size={15} /> Map</button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} /> List</button>
            </div>
          </div>

          <div className="planner-toolbar">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module..." /><kbd>⌘ K</kbd></label>
            <div className="filter-control"><Filter size={15} /><select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Filter by semester"><option value="all">All semesters</option>{[...new Set(plan.modules.map((module) => module.semester))].sort((a, b) => a - b).map((semester) => <option key={semester} value={String(semester)}>Semester {semester}</option>)}</select></div>
            <div className="filter-control"><Clock3 size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></div>
            <div className="toolbar-spacer" />
            <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add module</button>
          </div>

          <div className={'planner-layout ' + (view === 'list' ? 'list-mode' : '')}>
            <div className="graph-panel">
              {view === 'graph' ? (
                <>
                  <div className="semester-labels">{[...new Set(plan.modules.map((module) => module.semester))].sort((a, b) => a - b).map((semester) => <span key={semester}>SEMESTER {semester}</span>)}</div>
                  <ReactFlow
                    nodes={nodes.filter((node) => filteredModules.some((module) => module.id === node.id))}
                    edges={edges.filter((edge) => filteredModules.some((module) => module.id === edge.source) && filteredModules.some((module) => module.id === edge.target))}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleConnect}
                    onNodeClick={(_, node) => setSelectedId(node.id)}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.16 }}
                    minZoom={0.25}
                    maxZoom={1.5}
                    nodesConnectable
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#e7eae4" gap={22} size={1} />
                    <Controls showInteractive={false} position="bottom-right" />
                    <MiniMap pannable zoomable nodeStrokeWidth={3} maskColor="rgba(245,247,243,.72)" />
                  </ReactFlow>
                  <div className="graph-legend">
                    <span><i className="legend-line required-line" /> Required prerequisite</span>
                    <span><i className="legend-line recommended-line" /> Recommended preparation</span>
                    <span><i className="legend-dot" /> Available next</span>
                  </div>
                </>
              ) : (
                <div className="module-list">
                  {filteredModules.length === 0 ? <div className="empty-state"><Search size={24} /><strong>No modules found</strong><span>Try a different search or filter.</span></div> : filteredModules.map((module) => (
                    <button className={'list-module ' + (selectedId === module.id ? 'selected' : '')} key={module.id} onClick={() => setSelectedId(module.id)}>
                      <span className="list-semester">S{module.semester}</span><span className="list-module-name"><strong>{module.title}</strong><small>{module.code} · {module.category}</small></span><span className="list-ects">{module.ects} ECTS</span><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span><span className="list-arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="details-panel">
              {selected ? (
                <>
                  <div className="details-header"><div className="detail-type"><span className="detail-type-dot" /> MODULE DETAILS</div><button className="icon-button" aria-label="Close module details" onClick={() => setSelectedId(null)}><X size={17} /></button></div>
                  <div className="details-code">{selected.code} <span>·</span> Semester {selected.semester}</div>
                  <h3>{selected.title}</h3>
                  <div className="detail-badges"><span className="ects-badge">{selected.ects} ECTS</span><span className="category-badge">{selected.category}</span></div>
                  <p className="detail-description">{selected.description}</p>
                  <label className="field-label" htmlFor="module-status">YOUR PROGRESS</label>
                  <select id="module-status" className="status-select" value={selected.status} onChange={(event) => changeStatus(selected.id, event.target.value as ModuleStatus)}>
                    <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option>
                  </select>
                  <div className="detail-divider" />
                  <div className="dependency-heading"><span>Prerequisites & connections</span><CircleHelp size={15} /></div>
                  {requiredIncoming.length > 0 && <div className="dependency-group"><div className="dependency-label official-label">REQUIRED FIRST</div>{requiredIncoming.map((dependency) => {
                    const parent = plan.modules.find((module) => module.id === dependency.source);
                    return parent ? <button className="dependency-row" key={dependency.id} onClick={() => setSelectedId(parent.id)}><span className={'dependency-check ' + (parent.status === 'completed' ? 'done' : '')}>{parent.status === 'completed' ? <Check size={12} /> : '!'}</span><span><strong>{parent.title}</strong><small>{parent.status === 'completed' ? 'Completed' : 'Still outstanding'}</small></span><span className="dependency-chevron">↗</span></button> : null;
                  })}</div>}
                  {recommendedIncoming.length > 0 && <div className="dependency-group"><div className="dependency-label recommended-label">RECOMMENDED PREPARATION</div>{recommendedIncoming.map((dependency) => {
                    const parent = plan.modules.find((module) => module.id === dependency.source);
                    return parent ? <button className="dependency-row" key={dependency.id} onClick={() => setSelectedId(parent.id)}><span className="dependency-check soft"><BookOpen size={12} /></span><span><strong>{parent.title}</strong><small>{dependency.note ?? 'Helpful prior knowledge'}</small></span><span className="dependency-chevron">↗</span></button> : null;
                  })}</div>}
                  {requiredIncoming.length + recommendedIncoming.length === 0 && <div className="no-dependencies">No incoming dependencies yet. Connect modules by dragging from one card's handle to another.</div>}
                  <div className="detail-divider" />
                  <div className="detail-footer-note"><Sparkles size={15} /><span>Suggested connections are guidance, not official exam requirements unless explicitly marked required.</span></div>
                </>
              ) : (
                <div className="detail-empty"><div className="empty-illustration"><BookOpen size={24} /></div><h3>Pick a module</h3><p>Select a card on the map to see its details, progress, and connections.</p><button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add a module</button></div>
              )}
            </aside>
          </div>

          <div className="bottom-note"><span><span className="sample-badge"><CircleHelp size={12} /> SAMPLE DATA</span> {plan.institution}</span><button onClick={() => { if (window.confirm('Reset your plan and progress to the original sample? This cannot be undone.')) { setPlan(samplePlan); setSelectedId('algorithms'); setToast('Sample plan restored'); } }}><Settings2 size={14} /> Reset sample</button></div>
        </section>

        <section className="next-strip">
          <div className="next-strip-icon"><Zap size={18} /></div><div><strong>Your next move, made clearer.</strong><p>Complete a module to update your progress and unlock any courses that depend on it.</p></div><button onClick={() => { setStatusFilter('not-started'); setView('list'); }}>See unfinished modules <span>→</span></button>
        </section>
        <footer><span>STUDYPLANNER <span className="footer-dot">•</span> A BETTER WAY THROUGH YOUR DEGREE</span><span>Made for curious minds.</span></footer>
      </main>

      {showAdd && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}><form className="add-modal" onSubmit={addModule}>
        <div className="modal-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h2>Add a module</h2><p>Add a course to your plan. You can edit its details later.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setShowAdd(false)}><X size={18} /></button></div>
        <label className="form-label">Module name<input autoFocus required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Applied Statistics" /></label>
        <div className="form-row"><label className="form-label">Semester<input type="number" min="1" max="20" value={newSemester} onChange={(event) => setNewSemester(event.target.value)} required /></label><label className="form-label">ECTS credits<input type="number" min="0" max="60" value={newEcts} onChange={(event) => setNewEcts(event.target.value)} required /></label></div>
        <label className="form-label">Category<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Computer science" /></label>
        <label className="form-label">Recommended preparation <span className="optional-label">OPTIONAL</span><select value={newDependency} onChange={(event) => setNewDependency(event.target.value)}><option value="">No connection yet</option>{plan.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><small>This creates a suggested connection, not a formal prerequisite.</small></label>
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="button button-primary"><FilePlus2 size={16} /> Add to plan</button></div>
      </form></div>}
      {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}

export default function AppRoot() {
  return <ReactFlowProvider><App /></ReactFlowProvider>;
}
