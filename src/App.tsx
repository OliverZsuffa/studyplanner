import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
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
  Plus, Search, Settings2, Sparkles, Target, X, Zap, Moon, Sun, CalendarDays, Award,
} from 'lucide-react';
import { getAvailableModules, getNextStepModules, getPlannedSemester, getProgress, isModuleCountedInPlan, migrateStudyPlan, statusLabels, type Dependency, type ModuleStatus, type StudyModule, type StudyPlan } from './model';
import { samplePlan } from './samplePlan';
import ImportWizard from './ImportWizard';

const STORAGE_KEY = 'studyplanner.plan.v1';

function readSavedPlan(): StudyPlan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StudyPlan;
      if (Array.isArray(parsed.modules) && Array.isArray(parsed.dependencies)) return migrateStudyPlan(parsed);
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
  const plannedSemester = getPlannedSemester(module);
  return (
    <div className={['module-node', 'status-' + module.status, selected ? 'is-selected' : '', available ? 'is-available' : ''].join(' ')} onClick={() => onSelect(module.id)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-topline">
        <span className="node-code">{module.code}</span>
        {module.status === 'completed' ? <CheckCircle2 size={15} /> : available ? <span className="available-dot" /> : null}
      </div>
      <div className="node-title">{module.title}</div>
      <div className="node-meta"><span>{module.ects} ECTS</span><span>{plannedSemester ? `Planned S${plannedSemester}` : 'Unplanned'}</span>{module.recommendedSemester ? <span>Official S{module.recommendedSemester}</span> : null}</div>
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
    const semester = getPlannedSemester(module) ?? 99;
    const group = bySemester.get(semester) ?? [];
    group.push(module);
    bySemester.set(semester, group);
  });
  const maxPlannedSemester = Math.max(1, ...plan.modules.map((module) => getPlannedSemester(module) ?? 0));
  const positions = new Map<string, { x: number; y: number }>();
  [...bySemester.entries()].sort(([a], [b]) => a - b).forEach(([semester, modules]) => {
    modules.forEach((module, index) => positions.set(module.id, { x: 80 + ((semester === 99 ? maxPlannedSemester + 1 : semester) - 1) * 340, y: 70 + index * 174 }));
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
      ? { stroke: '#8b72d6', strokeWidth: 3 }
      : { stroke: '#a8b3a5', strokeWidth: 2.5, strokeDasharray: '6 5' },
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
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('studyplanner.theme') !== 'light'; } catch { return true; } });
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
  const [showImport, setShowImport] = useState(false);
  const available = useMemo(() => getAvailableModules(plan), [plan]);
  const progress = useMemo(() => getProgress(plan), [plan]);
  const gradedModules = plan.modules.filter((module) => isModuleCountedInPlan(plan, module.id) && module.result === 'passed' && typeof module.grade === 'number' && Number.isFinite(module.grade));
  const gradeWeight = gradedModules.reduce((sum, module) => sum + module.ects, 0);
  const gradeAverage = gradeWeight ? (gradedModules.reduce((sum, module) => sum + (module.grade ?? 0) * module.ects, 0) / gradeWeight).toFixed(2) : '—';
  const semesters = useMemo(() => Array.from({ length: Math.max(6, ...plan.modules.map((module) => getPlannedSemester(module) ?? 0), 1) }, (_, index) => index + 1), [plan.modules]);
  const semesterTotals = useMemo(() => semesters.map((semester) => { const modules = plan.modules.filter((module) => getPlannedSemester(module) === semester && isModuleCountedInPlan(plan, module.id)); return { semester, modules, ects: modules.reduce((sum, module) => sum + module.ects, 0), completed: modules.filter((module) => module.result === 'passed').reduce((sum, module) => sum + module.ects, 0) }; }), [plan, semesters]);
  const selected = plan.modules.find((module) => module.id === selectedId) ?? null;
  const filteredModules = useMemo(() => plan.modules.filter((module) => {
    const matchesQuery = (module.title + ' ' + module.code + ' ' + module.category).toLowerCase().includes(query.toLowerCase());
    const matchesSemester = semesterFilter === 'all' || (semesterFilter === 'unplanned' ? getPlannedSemester(module) === null : String(getPlannedSemester(module) ?? '') === semesterFilter);
    const matchesStatus = statusFilter === 'all' || module.status === statusFilter;
    return matchesQuery && matchesSemester && matchesStatus;
  }), [plan.modules, query, semesterFilter, statusFilter]);
  const readyModules = plan.modules.filter((module) => available.has(module.id) && module.status !== 'completed');
  const nextStepModules = getNextStepModules(plan);
  const requiredIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'required') : [];
  const recommendedIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'recommended') : [];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);
  useEffect(() => {
    try { localStorage.setItem('studyplanner.theme', darkMode ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
  }, [darkMode]);

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
      id, title, code: 'CUSTOM', semester: Math.max(1, Number(newSemester) || 1), plannedSemester: Math.max(1, Number(newSemester) || 1), recommendedSemester: null,
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

  return (
    <div className={'app-shell ' + (darkMode ? 'dark-mode' : 'light-mode')}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Studyplanner home">
          <span className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></span>
          <span>study<span className="brand-light">planner</span></span>
        </a>
        <div className="topbar-context"><span className="context-dot" /> YOUR DEGREE, IN FOCUS</div>
        <div className="topbar-actions">
          <button className="button button-quiet theme-toggle" onClick={() => setDarkMode((current) => !current)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}<span>{darkMode ? 'Light mode' : 'Dark mode'}</span></button>
          <button className="button button-quiet" onClick={() => downloadJson(plan)}><ArrowDownToLine size={16} /> Export</button>
          <button className="button button-quiet" onClick={() => setShowImport(true)}><ArrowUpFromLine size={16} /> Import</button>
          <button className="avatar-button" title="Local workspace"><span>O</span></button>
        </div>
      </header>

      <main className="workspace">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> YOUR PERSONAL STUDY MAP</div>
            <h1>Make your degree <span>make sense.</span></h1>
            <p className="welcome-copy">Your courses, grades and semester workload in one place.</p>
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
            <div className="next-course">{nextStepModules.find((module) => module.status === 'in-progress')?.title ?? nextStepModules[0]?.title ?? (readyModules.length ? 'Finish recommended preparation first' : 'You are all caught up')}</div>
            <button className="text-link" onClick={() => { const target = nextStepModules[0] ?? readyModules[0]; if (target) { const unfinished = plan.dependencies.find((dependency) => dependency.target === target.id && plan.modules.some((module) => module.id === dependency.source && module.status !== 'completed')); setSelectedId(unfinished?.source ?? target.id); setView('graph'); } }}>Explore your next step <span>↗</span></button>
          </div>
        </section>

        <section className="semester-planning" aria-label="Semester workload">
          <div className="semester-planning-heading"><div><div className="eyebrow"><CalendarDays size={14} /> YOUR PLAN AT A GLANCE</div><h2>Semester workload</h2><p>ECTS are grouped by your planned semester, not the official study-plan recommendation. Change your planned semester without losing the original recommendation.</p></div><div className="grade-average"><Award size={19} /><span><small>Grade average</small><strong>{gradeAverage}</strong><em>{gradedModules.length ? `ECTS-weighted · ${gradeWeight} ECTS graded` : 'Add grades to calculate'}</em></span></div></div>
          <div className="semester-grid">{semesterTotals.map(({ semester, modules, ects, completed }) => <button key={semester} className={'semester-card ' + (modules.length ? '' : 'semester-empty')} onClick={() => { setSemesterFilter(String(semester)); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="semester-card-top"><strong>Semester {semester}</strong><span>{modules.length} {modules.length === 1 ? 'course' : 'courses'}</span></span><span className="semester-ects">{ects}<small> ECTS planned</small></span><span className="semester-progress"><i style={{ width: ects ? `${Math.min(100, completed / ects * 100)}%` : '0%' }} /></span><span className="semester-card-foot">{completed} of {ects} ECTS passed</span></button>)}</div>
          {plan.modules.some((module) => getPlannedSemester(module) === null) && <p className="semester-unplanned-note">{plan.modules.filter((module) => getPlannedSemester(module) === null).length} module(s) have no planned semester yet. <button className="text-link" onClick={() => { setSemesterFilter('unplanned'); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review unplanned modules ↗</button></p>}
          {(plan.requirementGroups ?? []).length > 0 && <div className="choice-groups-summary"><div><h3>Elective requirements</h3><p>Only options marked as planned count toward your workload.</p></div>{(plan.requirementGroups ?? []).map((group) => { const options = plan.modules.filter((module) => group.moduleIds.includes(module.id)); const chosen = options.filter((module) => (group.selectedModuleIds ?? []).includes(module.id)); const chosenEcts = chosen.reduce((sum, module) => sum + module.ects, 0); const ruleText = group.rule === 'min-ects' ? `At least ${group.target} ECTS` : group.rule === 'max-ects' ? `At most ${group.target} ECTS` : group.rule === 'exact-ects' ? `Exactly ${group.target} ECTS` : group.rule === 'module-count' ? `Choose ${group.target} modules` : `Choose from ${group.target} areas`; return <div className="choice-group-summary" key={group.id}><div><strong>{group.title}</strong><small>{ruleText}</small></div><span>{chosenEcts} ECTS planned</span><small>{chosen.length} of {options.length} options selected</small></div>; })}</div>}
        </section>

        <section className="planner-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE BIG PICTURE</div>
              <h2>Your study map</h2>
              <p>Choose a course to edit its status, grade or planned semester. Drag cards to arrange the map.</p>
            </div>
            <div className="view-toggle" aria-label="Choose view">
              <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><LayoutGrid size={15} /> Map</button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} /> List</button>
            </div>
          </div>

          <div className="how-to-use"><span className="how-to-number">1</span><span><strong>Select a course</strong><small>Open its details</small></span><span className="how-to-arrow">→</span><span className="how-to-number">2</span><span><strong>Update your plan</strong><small>Semester, status, result, grade</small></span><span className="how-to-arrow">→</span><span className="how-to-number">3</span><span><strong>Arrange the map</strong><small>Drag cards; connect the handles</small></span></div>
          <div className="planner-toolbar">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module..." /><kbd>⌘ K</kbd></label>
            <div className="filter-control"><Filter size={15} /><select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Filter by semester"><option value="all">All semesters</option><option value="unplanned">Unplanned</option>{[...new Set(plan.modules.map((module) => (getPlannedSemester(module) ?? 0)))].filter((semester) => semester > 0).sort((a, b) => a - b).map((semester) => <option key={semester} value={String(semester)}>Semester {semester}</option>)}</select></div>
            <div className="filter-control"><Clock3 size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></div>
            <div className="toolbar-spacer" />
            <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add module</button>
          </div>

          <div className={'planner-layout ' + (view === 'list' ? 'list-mode' : '')}>
            <div className="graph-panel">
              {view === 'graph' ? (
                <>
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
                    <Background color={darkMode ? '#343e49' : '#bfc9bd'} gap={22} size={1} />
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
                      <span className="list-semester">{getPlannedSemester(module) ? `S${getPlannedSemester(module)}` : '—'}</span><span className="list-module-name"><strong>{module.title}</strong><small>{module.code} · {module.category}</small></span><span className="list-ects">{module.ects} ECTS</span><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span><span className="list-arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="details-panel">
              {selected ? (
                <>
                  <div className="details-header"><div className="detail-type"><span className="detail-type-dot" /> MODULE DETAILS</div><button className="icon-button" aria-label="Close module details" onClick={() => setSelectedId(null)}><X size={17} /></button></div>
                  <div className="details-code">{selected.code} <span>·</span> {selected.category}</div>
                  <h3>{selected.title}</h3>
                  <div className="detail-badges"><span className="ects-badge">{selected.ects} ECTS</span><span className="category-badge">{statusLabels[selected.status]}</span></div>
                  <label className="field-label" htmlFor="planned-semester">PLANNED SEMESTER</label>
                  <select id="planned-semester" className="status-select detail-field-gap" value={getPlannedSemester(selected) ?? ''} onChange={(event) => setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, semester: event.target.value === '' ? undefined : Number(event.target.value), plannedSemester: event.target.value === '' ? null : Number(event.target.value) } : module) }))}><option value="">Not planned</option>{semesters.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}<option value={Math.max(...semesters) + 1}>Semester {Math.max(...semesters) + 1}</option></select>
                  <div className="detail-source-note">Official study-plan semester: {selected.recommendedSemester ? `Semester ${selected.recommendedSemester}` : 'Not known'}{selected.sourceLocation ? ` · ${selected.sourceLocation}` : ''}</div>
                  <p className="detail-description">{selected.description}</p>{(selected.sourceEvidence || selected.sourceLocation) && <div className="detail-source-note"><strong>Source evidence</strong>{selected.sourceEvidence ? <p>{selected.sourceEvidence}</p> : null}{selected.sourceLocation ? <small>{selected.sourceLocation}</small> : null}</div>}
                  <label className="field-label" htmlFor="module-status">YOUR PROGRESS</label>
                  <select id="module-status" className="status-select" value={selected.status} onChange={(event) => changeStatus(selected.id, event.target.value as ModuleStatus)}>
                    <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option>
                  </select>
                  <div className="result-fields"><label className="form-label" htmlFor="module-result">Exam result<select id="module-result" value={selected.result ?? 'unrecorded'} onChange={(event) => setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, result: event.target.value === 'unrecorded' ? undefined : event.target.value as 'passed' | 'failed' } : module) }))}><option value="unrecorded">Not recorded</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label className="form-label" htmlFor="module-grade">Grade <small>German scale, 1.0 (best) to 4.0 (pass)</small><input id="module-grade" type="number" min="1" max="5" step="0.1" placeholder="e.g. 2.3" value={selected.grade ?? ''} onChange={(event) => { const raw = event.target.value; const grade = raw === '' ? undefined : Math.max(1, Math.min(5, Number(raw))); setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, grade } : module) })); }} /></label></div>
                  <p className="grade-note">ECTS-weighted average of courses marked <strong>Passed</strong> with a grade from 1.0 to 4.0. Failed or ungraded courses are excluded.</p>
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
                <div className="detail-empty"><div className="empty-illustration"><BookOpen size={24} /></div><h3>Start with a course</h3><p>Choose a card to record progress and grades, or add a course that is missing from your plan.</p><button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add your first course</button></div>
              )}
            </aside>
          </div>

          <div className="bottom-note"><span><span className="sample-badge"><CircleHelp size={12} /> SAMPLE DATA</span> {plan.institution}</span><button onClick={() => { if (window.confirm('Reset your plan and progress to the original sample? This cannot be undone.')) { setPlan(samplePlan); setSelectedId('algorithms'); setToast('Sample plan restored'); } }}><Settings2 size={14} /> Reset sample</button></div>
        </section>

        <section className="next-strip">
          <div className="next-strip-icon"><Zap size={18} /></div><div><strong>Your next move, made clearer.</strong><p>Complete modules to satisfy formal prerequisites. Recommended links also guide the next-step suggestion, without becoming formal requirements.</p></div><button onClick={() => { setStatusFilter('not-started'); setView('list'); }}>See unfinished modules <span>→</span></button>
        </section>
        <footer><span>STUDYPLANNER <span className="footer-dot">•</span> A BETTER WAY THROUGH YOUR DEGREE</span><span>Made for curious minds.</span></footer>
      </main>

      {showImport && <ImportWizard currentPlan={plan} onClose={() => setShowImport(false)} onApply={(imported) => { setPlan(migrateStudyPlan(imported)); setSelectedId(imported.modules[0]?.id ?? null); setShowImport(false); setToast('Study plan imported'); }} />}
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
