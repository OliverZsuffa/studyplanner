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
  Plus, Search, Settings2, Sparkles, Target, X, Zap, Moon, Sun, CalendarDays, Award, Columns3, Pencil,
} from 'lucide-react';
import { canSelectRequirementOption, getAvailableModules, getNextStepModules, getPlannedSemester, getProgress, getModuleRequirementGroups, getRequirementGroupSummary, getWeightedGradeAverage, isModuleCountedInPlan, isModuleVisibleInPlan, migrateStudyPlan, statusLabels, type Dependency, type ModuleRecommendation, type ModuleStatus, type StudyModule, type StudyPlan, withPlannedSemester } from './model';
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
  return migrateStudyPlan(samplePlan);
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
        {module.recommendation && module.recommendation !== 'not-reviewed' ? <span className={'recommendation-pill ' + module.recommendation}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : 'Recommended'}</span> : null}
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

function makeGraph(plan: StudyPlan, nextStepIds: Set<string>, selectedId: string | null, onSelect: (id: string) => void) {
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
  const visibleIds = new Set(plan.modules.map((module) => module.id));
  const nodes: ModuleFlowNode[] = plan.modules.map((module) => ({
    id: module.id,
    type: 'moduleCard',
    position: positions.get(module.id) ?? { x: 80, y: 70 },
    data: {
      module,
      available: nextStepIds.has(module.id),
      selected: selectedId === module.id,
      incoming: plan.dependencies.filter((dependency) => visibleIds.has(dependency.source) && dependency.target === module.id).length,
      outgoing: plan.dependencies.filter((dependency) => dependency.source === module.id && visibleIds.has(dependency.target)).length,
      onSelect,
    },
    draggable: true,
  }));
  const edges: Edge[] = plan.dependencies.filter((dependency) => visibleIds.has(dependency.source) && visibleIds.has(dependency.target)).map((dependency) => ({
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
  const [view, setView] = useState<'kanban' | 'graph' | 'list'>('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('CUSTOM');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState<ModuleStatus>('not-started');
  const [newResult, setNewResult] = useState<'unrecorded' | 'passed' | 'failed'>('unrecorded');
  const [newGrade, setNewGrade] = useState('');
  const [toast, setToast] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSemester, setNewSemester] = useState('1');
  const [newEcts, setNewEcts] = useState('5');
  const [newCategory, setNewCategory] = useState('Core');
  const [newDependency, setNewDependency] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const visiblePlan = useMemo(() => ({ ...plan, modules: plan.modules.filter((module) => isModuleVisibleInPlan(plan, module.id)) }), [plan]);
  const available = useMemo(() => getAvailableModules(plan), [plan]);
  const progress = useMemo(() => getProgress(plan), [plan]);
  const gradeSummary = useMemo(() => getWeightedGradeAverage(plan), [plan]);
  const gradeWeight = gradeSummary.ects;
  const gradeAverage = gradeSummary.average === null ? '—' : gradeSummary.average.toFixed(2);
  const gradedModules = gradeSummary.count;
  const semesters = useMemo(() => Array.from({ length: Math.max(6, ...plan.modules.map((module) => getPlannedSemester(module) ?? 0), 1) }, (_, index) => index + 1), [plan.modules]);
  const semesterTotals = useMemo(() => semesters.map((semester) => { const modules = plan.modules.filter((module) => getPlannedSemester(module) === semester && isModuleCountedInPlan(plan, module.id)); return { semester, modules, ects: modules.reduce((sum, module) => sum + module.ects, 0), completed: modules.filter((module) => module.result === 'passed').reduce((sum, module) => sum + module.ects, 0) }; }), [plan, semesters]);
  const selected = plan.modules.find((module) => module.id === selectedId) ?? null;
  const filteredModules = useMemo(() => visiblePlan.modules.filter((module) => {
    const matchesQuery = (module.title + ' ' + module.code + ' ' + module.category).toLowerCase().includes(query.toLowerCase());
    const matchesSemester = semesterFilter === 'all' || (semesterFilter === 'unplanned' ? getPlannedSemester(module) === null : String(getPlannedSemester(module) ?? '') === semesterFilter);
    const matchesStatus = statusFilter === 'all' || module.status === statusFilter;
    return matchesQuery && matchesSemester && matchesStatus;
  }), [visiblePlan.modules, query, semesterFilter, statusFilter]);
  const readyModules = visiblePlan.modules.filter((module) => available.has(module.id) && module.status !== 'completed');
  const nextStepModules = useMemo(() => getNextStepModules(plan).filter((module) => isModuleVisibleInPlan(plan, module.id)), [plan]);
  const nextStepIds = useMemo(() => new Set(nextStepModules.map((module) => module.id)), [nextStepModules]);
  const requiredIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'required') : [];
  const recommendedIncoming = selected ? plan.dependencies.filter((dependency) => dependency.target === selected.id && dependency.kind === 'recommended') : [];

  const planningWarnings = useMemo(() => {
    const byId = new Map(plan.modules.map((module) => [module.id, module]));
    return plan.dependencies.filter((dependency) => dependency.kind === 'required').flatMap((dependency) => {
      const source = byId.get(dependency.source);
      const target = byId.get(dependency.target);
      if (!source || !target || !isModuleVisibleInPlan(plan, source.id) || !isModuleVisibleInPlan(plan, target.id) || getPlannedSemester(target) === null) return [];
      const warnings: string[] = [];
      if (target.status !== 'completed' && source.status !== 'completed') warnings.push(`${source.title} is a required predecessor of ${target.title} but is not completed.`);
      const sourceSemester = getPlannedSemester(source);
      const targetSemester = getPlannedSemester(target);
      if (sourceSemester !== null && targetSemester !== null && sourceSemester >= targetSemester) warnings.push(`${source.title} is planned in S${sourceSemester}, not before ${target.title} in S${targetSemester}.`);
      return warnings.map((message) => ({ id: dependency.id + message, message }));
    });
  }, [plan]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);
  useEffect(() => {
    try { localStorage.setItem('studyplanner.theme', darkMode ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
  }, [darkMode]);

  const selectModule = useCallback((id: string) => setSelectedId(id), []);
  const graph = useMemo(() => makeGraph(visiblePlan, nextStepIds, selectedId, selectModule), [visiblePlan, nextStepIds, selectedId, selectModule]);
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);

  useEffect(() => {
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
    });
    setEdges(graph.edges);
  }, [graph, setEdges, setNodes]);

  const changeRecommendation = (id: string, recommendation: ModuleRecommendation) => {
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === id ? { ...module, recommendation } : module) }));
    setToast('Recommendation updated');
  };

  const toggleRequirementOption = (groupId: string, moduleId: string) => {
    const currentGroup = (plan.requirementGroups ?? []).find((group) => group.id === groupId);
    if (!currentGroup) return;
    const selected = currentGroup.selectedModuleIds ?? [];
    if (selected.includes(moduleId)) {
      setPlan((current) => ({ ...current, requirementGroups: (current.requirementGroups ?? []).map((group) => group.id === groupId ? { ...group, selectedModuleIds: (group.selectedModuleIds ?? []).filter((id) => id !== moduleId) } : group) }));
      if (selectedId === moduleId) setSelectedId(null);
      setToast('Option removed from selection');
      return;
    }
    const check = canSelectRequirementOption(plan, groupId, moduleId);
    if (!check.allowed) { setToast(check.reason ?? 'This option cannot be selected'); return; }
    setPlan((current) => ({ ...current, requirementGroups: (current.requirementGroups ?? []).map((group) => group.id === groupId ? { ...group, selectedModuleIds: [...(group.selectedModuleIds ?? []), moduleId] } : group) }));
    setSelectedId(moduleId);
    setToast('Elective option selected');
  };

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

  const openAddModule = () => {
    setEditingModuleId(null); setNewTitle(''); setNewCode('CUSTOM'); setNewSemester('1'); setNewEcts('5');
    setNewCategory('Core'); setNewDescription(''); setNewStatus('not-started'); setNewResult('unrecorded'); setNewGrade(''); setNewDependency('');
    setShowAdd(true);
  };

  const openEditModule = (module: StudyModule) => {
    setEditingModuleId(module.id); setNewTitle(module.title); setNewCode(module.code); setNewSemester(String(getPlannedSemester(module) ?? ''));
    setNewEcts(String(module.ects)); setNewCategory(module.category); setNewDescription(module.description);
    setNewStatus(module.status); setNewResult(module.result ?? 'unrecorded'); setNewGrade(module.grade === undefined ? '' : String(module.grade)); setNewDependency('');
    setShowAdd(true);
  };

  const moveModule = (id: string, semester: number | null) => {
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === id ? withPlannedSemester(module, semester) : module) }));
    setToast(semester === null ? 'Module moved to unplanned' : `Moved to semester ${semester}`);
  };

  const addModule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const semester = newSemester.trim() ? Math.max(1, Math.min(20, Number(newSemester) || 1)) : null;
    const grade = newGrade.trim() ? Number(newGrade) : undefined;
    const result = newResult === 'unrecorded' ? undefined : newResult;
    if (editingModuleId) {
      setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === editingModuleId ? {
        ...module, title, code: newCode.trim() || 'CUSTOM', category: newCategory.trim() || 'Other',
        description: newDescription.trim(), ects: Math.max(0, Math.min(60, Number(newEcts) || 0)),
        semester: semester ?? undefined, plannedSemester: semester, status: newStatus, result,
        grade: grade !== undefined && Number.isFinite(grade) && grade >= 1 && grade <= 4 ? grade : undefined,
      } : module) }));
      setToast('Module updated');
      setSelectedId(editingModuleId);
    } else {
      const id = 'module-' + Date.now().toString(36);
      const module: StudyModule = {
        id, title, code: newCode.trim() || 'CUSTOM', semester: semester ?? undefined, plannedSemester: semester, recommendedSemester: null,
        ects: Math.max(0, Math.min(60, Number(newEcts) || 0)), status: newStatus,
        description: newDescription.trim(), category: newCategory.trim() || 'Other',
        ...(grade !== undefined && Number.isFinite(grade) && grade >= 1 && grade <= 4 ? { grade } : {}),
        ...(result ? { result } : {}),
      };
      const dependency = newDependency ? {
        id: 'dep-' + Date.now().toString(36), source: newDependency, target: id,
        kind: 'recommended' as const, provenance: 'user' as const, note: 'Added manually by you.',
      } : null;
      setPlan((current) => ({ ...current, modules: [...current.modules, module], dependencies: dependency ? [...current.dependencies, dependency] : current.dependencies }));
      setSelectedId(id);
      setToast('Module added');
    }
    setShowAdd(false);
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
          <div className="semester-planning-heading"><div><div className="eyebrow"><CalendarDays size={14} /> YOUR PLAN AT A GLANCE</div><h2>Semester workload</h2><p>ECTS are grouped by your planned semester, not the official study-plan recommendation. Change your planned semester without losing the original recommendation.</p></div><div className="grade-average"><Award size={19} /><span><small>Grade average</small><strong>{gradeAverage}</strong><em>{gradedModules ? `ECTS-weighted · ${gradeWeight} ECTS graded` : 'Add grades to calculate'}</em></span></div></div>
          <div className="semester-grid">{semesterTotals.map(({ semester, modules, ects, completed }) => <button key={semester} className={'semester-card ' + (modules.length ? '' : 'semester-empty')} onClick={() => { setSemesterFilter(String(semester)); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="semester-card-top"><strong>Semester {semester}</strong><span>{modules.length} {modules.length === 1 ? 'course' : 'courses'}</span></span><span className="semester-ects">{ects}<small> ECTS planned</small></span><span className="semester-progress"><i style={{ width: ects ? `${Math.min(100, completed / ects * 100)}%` : '0%' }} /></span><span className="semester-card-foot">{completed} of {ects} ECTS passed</span></button>)}</div>
          {visiblePlan.modules.some((module) => getPlannedSemester(module) === null) && <p className="semester-unplanned-note">{visiblePlan.modules.filter((module) => getPlannedSemester(module) === null).length} module(s) have no planned semester yet. <button className="text-link" onClick={() => { setSemesterFilter('unplanned'); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review unplanned modules ↗</button></p>}
          {(plan.requirementGroups ?? []).length > 0 && <section className="elective-selector" aria-label="Elective and requirement choices"><div className="elective-selector-heading"><div><h3>Electives & requirements</h3><p>Choose the options you intend to take. Unselected alternatives stay here and do not appear in your plan or count toward ECTS.</p></div></div>{(plan.requirementGroups ?? []).map((group) => { const options = plan.modules.filter((module) => group.moduleIds.includes(module.id)); const summary = getRequirementGroupSummary(plan, group); const ruleText = group.rule === 'min-ects' ? `At least ${group.target} ECTS` : group.rule === 'max-ects' ? `At most ${group.target} ECTS` : group.rule === 'exact-ects' ? `Exactly ${group.target} ECTS` : group.rule === 'module-count' ? `Choose ${group.target} modules` : `Choose from ${group.target} areas`; return <details className="elective-group" key={group.id}><summary className="elective-group-heading"><div><strong>{group.title}</strong><small>{ruleText}</small></div><span className={'requirement-state ' + summary.state}>{summary.selectedEcts} ECTS · {summary.selectedCount} selected</span></summary><p className={'requirement-message ' + summary.state}>{summary.message}</p>{options.length === 0 ? <p className="elective-empty">No courses linked yet. Select a course in the plan and use “Elective / choice groups” to add it here.</p> : <div className="elective-options">{options.map((module) => { const chosen = (group.selectedModuleIds ?? []).includes(module.id); const check = canSelectRequirementOption(plan, group.id, module.id); return <div className={'elective-option ' + (chosen ? 'chosen' : '')} key={module.id}><div className="elective-option-info"><strong>{module.title}</strong><small>{module.code} · {module.ects} ECTS · {module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : module.recommendation === 'recommended' ? 'Recommended' : 'Not reviewed'}</small>{getModuleRequirementGroups(plan, module.id).length > 1 && <small className="elective-overlap-note">Also belongs to another requirement; selected in all linked groups to count.</small>}</div><button type="button" className={chosen ? 'button button-quiet' : 'button button-primary'} disabled={!chosen && !check.allowed} title={!chosen && !check.allowed ? check.reason : undefined} onClick={() => toggleRequirementOption(group.id, module.id)}>{chosen ? 'Remove choice' : 'Choose'}</button>{!chosen && !check.allowed && <small className="elective-disabled-reason">{check.reason}</small>}</div>; })}</div>}</details>; })}</section>}
        </section>

        <section className="planner-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE BIG PICTURE</div>
              <h2>Your study map</h2>
              <p>Plan courses by semester, then switch to the map to explore dependencies.</p>
            </div>
            <div className="view-toggle" aria-label="Choose view">
              <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><Columns3 size={15} /> Plan</button>
              <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><LayoutGrid size={15} /> Map</button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} /> List</button>
            </div>
          </div>

          <details className="how-to-use"><summary>How to use your study planner</summary><div className="how-to-steps"><span className="how-to-number">1</span><span><strong>Select a course</strong><small>Open its details</small></span><span className="how-to-arrow">→</span><span className="how-to-number">2</span><span><strong>Update your plan</strong><small>Semester, progress, result and grade</small></span><span className="how-to-arrow">→</span><span className="how-to-number">3</span><span><strong>Arrange the map</strong><small>Drag cards; connect the handles</small></span></div></details>
          {planningWarnings.length > 0 && <section className="planning-warnings" aria-label="Planning warnings"><strong><CircleHelp size={15} /> Check your module order</strong><ul>{planningWarnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}</ul><small>Only recorded required relationships are checked here. Recommended preparation is guidance, not a formal blocker.</small></section>}
          <div className="planner-toolbar">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module..." /><kbd>⌘ K</kbd></label>
            <div className="filter-control"><Filter size={15} /><select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Filter by semester"><option value="all">All semesters</option><option value="unplanned">Unplanned</option>{[...new Set(plan.modules.map((module) => (getPlannedSemester(module) ?? 0)))].filter((semester) => semester > 0).sort((a, b) => a - b).map((semester) => <option key={semester} value={String(semester)}>Semester {semester}</option>)}</select></div>
            <div className="filter-control"><Clock3 size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></div>
            <div className="toolbar-spacer" />
            <button className="button button-primary" onClick={openAddModule}><Plus size={16} /> Add module</button>
          </div>

          <div className={'planner-layout ' + (view === 'list' ? 'list-mode' : '') + (view === 'kanban' ? ' kanban-mode' : '')}>
            <div className="graph-panel">
              {view === 'kanban' ? (
                <div className="kanban-board" aria-label="Semester planning board">
                  {[...semesters.map((semester) => ({ semester, title: `Semester ${semester}` })), { semester: null as number | null, title: 'Unplanned' }].map((column) => {
                    const columnModules = filteredModules.filter((module) => getPlannedSemester(module) === column.semester);
                    const total = columnModules.filter((module) => isModuleCountedInPlan(plan, module.id)).reduce((sum, module) => sum + module.ects, 0);
                    return <section className="kanban-column" key={column.title} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/studyplanner-module'); if (id) moveModule(id, column.semester); }} aria-label={column.title}>
                      <header className="kanban-column-header"><div><strong>{column.title}</strong><small>{columnModules.length} {columnModules.length === 1 ? 'module' : 'modules'}</small></div><span>{total} ECTS</span></header>
                      <div className="kanban-cards">
                        {columnModules.map((module) => <article className={'kanban-card ' + (selectedId === module.id ? 'selected' : '')} key={module.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/studyplanner-module', module.id); event.dataTransfer.effectAllowed = 'move'; }} onClick={() => setSelectedId(module.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(module.id); } }} tabIndex={0} aria-label={`${module.title}, ${module.ects} ECTS`}>
                          <div className="kanban-card-top"><span>{module.code}</span><button className="kanban-edit" aria-label={`Edit ${module.title}`} onClick={(event) => { event.stopPropagation(); openEditModule(module); }}><Pencil size={13} /></button></div>
                          <strong>{module.title}</strong><p>{module.category} · {module.ects} ECTS</p>
                          <div className="kanban-card-footer"><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span><span className={'recommendation-pill ' + (module.recommendation ?? 'not-reviewed')}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : module.recommendation === 'recommended' ? 'Recommended' : 'Not reviewed'}</span>{module.recommendedSemester && <small>Official S{module.recommendedSemester}</small>}</div>
                          <label className="kanban-move" onClick={(event) => event.stopPropagation()}>Move to<select aria-label={`Move ${module.title} to semester`} value={getPlannedSemester(module) ?? ''} onChange={(event) => moveModule(module.id, event.target.value === '' ? null : Number(event.target.value))}><option value="">Unplanned</option>{semesters.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}<option value={Math.max(...semesters) + 1}>Semester {Math.max(...semesters) + 1}</option></select></label>
                        </article>)}
                        {columnModules.length === 0 && <div className="kanban-empty">Drop a module here or use its “Move to” menu.</div>}
                      </div>
                    </section>;
                  })}
                </div>
              ) : view === 'graph' ? (
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
                      <span className="list-semester">{getPlannedSemester(module) ? `S${getPlannedSemester(module)}` : '—'}</span><span className="list-module-name"><strong>{module.title}</strong><small>{module.code} · {module.category}</small></span><span className="list-ects">{module.ects} ECTS</span><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span><span className={'recommendation-pill ' + (module.recommendation ?? 'not-reviewed')}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : module.recommendation === 'recommended' ? 'Recommended' : 'Not reviewed'}</span><span className="list-arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="details-panel">
              {selected ? (
                <>
                  <div className="details-header"><button type="button" className="details-collapse-toggle" aria-expanded={!detailsCollapsed} onClick={() => setDetailsCollapsed((value) => !value)}><ChevronDown size={16} className={detailsCollapsed ? 'collapsed-chevron' : ''} /><span><span className="detail-type"><span className="detail-type-dot" /> COURSE DETAILS</span><strong>{selected.title}</strong></span></button><div className="detail-header-actions"><button className="icon-button" aria-label="Edit module" title="Edit module" onClick={() => openEditModule(selected)}><Pencil size={15} /></button><button className="icon-button" aria-label="Close course details" onClick={() => setSelectedId(null)}><X size={17} /></button></div></div>
                  {!detailsCollapsed && <>
                  <div className="details-code">{selected.code} <span>·</span> {selected.category}</div>
                  <div className="detail-badges"><span className="ects-badge">{selected.ects} ECTS</span><span className={'status-pill ' + selected.status}>{statusLabels[selected.status]}</span>{selected.recommendation && selected.recommendation !== 'not-reviewed' ? <span className={'recommendation-pill ' + selected.recommendation}>{selected.recommendation === 'strongly-recommended' ? 'Strongly recommended' : 'Recommended'}</span> : null}</div>
                  <details className="detail-advanced"><summary>Optional planning guidance <span>{selected.recommendation === 'strongly-recommended' ? 'Strongly recommended' : selected.recommendation === 'recommended' ? 'Recommended' : 'No recommendation set'}</span></summary><p>This is your own optional rating of how useful a course seems. It is not an official assessment and does not change progress, semester, or ECTS.</p><label className="field-label" htmlFor="module-recommendation">Course recommendation</label><select id="module-recommendation" className="status-select detail-field-gap" value={selected.recommendation ?? 'not-reviewed'} onChange={(event) => changeRecommendation(selected.id, event.target.value as ModuleRecommendation)}><option value="not-reviewed">No recommendation set</option><option value="recommended">Recommended</option><option value="strongly-recommended">Strongly recommended</option></select></details>
                  <label className="field-label" htmlFor="planned-semester">PLANNED SEMESTER</label>
                  <select id="planned-semester" className="status-select detail-field-gap" value={getPlannedSemester(selected) ?? ''} onChange={(event) => setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, semester: event.target.value === '' ? undefined : Number(event.target.value), plannedSemester: event.target.value === '' ? null : Number(event.target.value) } : module) }))}><option value="">Not planned</option>{semesters.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}<option value={Math.max(...semesters) + 1}>Semester {Math.max(...semesters) + 1}</option></select>
                  <details className="detail-advanced"><summary>Official source information</summary><p>Official study-plan semester: {selected.recommendedSemester ? `Semester ${selected.recommendedSemester}` : 'Not known'}{selected.sourceLocation ? ` · ${selected.sourceLocation}` : ''}</p>{selected.sourceEvidence && <p><strong>Source evidence</strong><br />{selected.sourceEvidence}</p>}{selected.sourceLocation && /^https?:\/\//i.test(selected.sourceLocation) && <p><a href={selected.sourceLocation} target="_blank" rel="noreferrer">Open source ↗</a></p>}</details>
                  {selected.description && <p className="detail-description">{selected.description}</p>}
                  {(plan.requirementGroups ?? []).length > 0 && <details className="detail-advanced"><summary>Elective / choice groups <span>{getModuleRequirementGroups(plan, selected.id).length ? 'Linked' : 'Not linked'}</span></summary><p>Tick a group to add this course as one of its options. Then choose whether you plan to take it.</p>{(plan.requirementGroups ?? []).map((group) => { const linked = group.moduleIds.includes(selected.id); const chosen = (group.selectedModuleIds ?? []).includes(selected.id); return <div className="module-group-link" key={group.id}><label><input type="checkbox" checked={linked} onChange={(event) => { const checked = event.target.checked; setPlan((current) => ({ ...current, requirementGroups: (current.requirementGroups ?? []).map((item) => item.id === group.id ? { ...item, moduleIds: checked ? [...item.moduleIds, selected.id] : item.moduleIds.filter((id) => id !== selected.id), selectedModuleIds: checked ? (item.selectedModuleIds ?? []) : (item.selectedModuleIds ?? []).filter((id) => id !== selected.id) } : item) })); }} />{group.title}</label>{linked && <label className="module-group-choice"><input type="checkbox" checked={chosen} onChange={(event) => { if (event.target.checked) { const check = canSelectRequirementOption(plan, group.id, selected.id); if (!check.allowed) { setToast(check.reason ?? 'This course cannot be selected yet'); return; } } toggleRequirementOption(group.id, selected.id); }} />Plan to take</label>}</div>; })}</details>}
                  <label className="field-label" htmlFor="module-status">YOUR PROGRESS</label>
                  <select id="module-status" className="status-select" value={selected.status} onChange={(event) => changeStatus(selected.id, event.target.value as ModuleStatus)}>
                    <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option>
                  </select>
                  <div className="result-fields"><label className="form-label" htmlFor="module-result">Exam result<select id="module-result" value={selected.result ?? 'unrecorded'} onChange={(event) => setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, result: event.target.value === 'unrecorded' ? undefined : event.target.value as 'passed' | 'failed' } : module) }))}><option value="unrecorded">Not recorded</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label className="form-label" htmlFor="module-grade">Grade <small>German scale, 1.0 (best) to 4.0 (pass)</small><input id="module-grade" type="number" min="1" max="4" step="0.1" placeholder="e.g. 2.3" value={selected.grade ?? ''} onChange={(event) => { const raw = event.target.value; const grade = raw === '' ? undefined : Math.max(1, Math.min(4, Number(raw))); setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, grade } : module) })); }} /></label></div>
                  <p className="grade-note">ECTS-weighted average of courses marked <strong>Passed</strong> with a grade from 1.0 to 4.0. Failed or ungraded courses are excluded.</p>
                  <div className="detail-divider" />
                  <details className="detail-advanced"><summary>Prerequisites & connections <span>{requiredIncoming.length + recommendedIncoming.length}</span></summary>
                  {requiredIncoming.length > 0 && <div className="dependency-group"><div className="dependency-label official-label">REQUIRED FIRST</div>{requiredIncoming.map((dependency) => {
                    const parent = plan.modules.find((module) => module.id === dependency.source);
                    return parent ? <button className="dependency-row" key={dependency.id} onClick={() => setSelectedId(parent.id)}><span className={'dependency-check ' + (parent.status === 'completed' ? 'done' : '')}>{parent.status === 'completed' ? <Check size={12} /> : '!'}</span><span><strong>{parent.title}</strong><small>{parent.status === 'completed' ? 'Completed' : 'Still outstanding'}</small></span><span className="dependency-chevron">↗</span></button> : null;
                  })}</div>}
                  {recommendedIncoming.length > 0 && <div className="dependency-group"><div className="dependency-label recommended-label">RECOMMENDED PREPARATION</div>{recommendedIncoming.map((dependency) => {
                    const parent = plan.modules.find((module) => module.id === dependency.source);
                    return parent ? <button className="dependency-row" key={dependency.id} onClick={() => setSelectedId(parent.id)}><span className="dependency-check soft"><BookOpen size={12} /></span><span><strong>{parent.title}</strong><small>{dependency.note ?? 'Helpful prior knowledge'}</small></span><span className="dependency-chevron">↗</span></button> : null;
                  })}</div>}
                  {requiredIncoming.length + recommendedIncoming.length === 0 && <div className="no-dependencies">No connections recorded for this course yet.</div>}
                  <p className="detail-help">Required means a recorded formal prerequisite. Recommended means helpful preparation, not an exam requirement.</p></details>
                  <div className="detail-divider" />
                  <div className="detail-footer-note"><Sparkles size={15} /><span>Suggested connections are guidance, not official exam requirements unless explicitly marked required.</span></div>
                  </>}
              ) : (
                <div className="detail-empty"><div className="empty-illustration"><BookOpen size={24} /></div><h3>Start with a course</h3><p>Choose a card to record progress and grades, or add a course that is missing from your plan.</p><button className="button button-primary" onClick={openAddModule}><Plus size={15} /> Add your first course</button></div>
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
        <div className="modal-heading"><div><div className="eyebrow">YOUR STUDY PLAN</div><h2>{editingModuleId ? 'Edit module' : 'Add a module'}</h2><p>Keep course details and planning information together.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setShowAdd(false)}><X size={18} /></button></div>
        <label className="form-label">Module name<input autoFocus required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Applied Statistics" /></label>
        <div className="form-row"><label className="form-label">Module code<input value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="e.g. IN0001" /></label><label className="form-label">Category<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Computer science" /></label></div>
        <div className="form-row"><label className="form-label">Planned semester<input type="number" min="1" max="20" value={newSemester} onChange={(event) => setNewSemester(event.target.value)} placeholder="Unplanned" /><small>Leave blank to keep this module unplanned.</small></label><label className="form-label">ECTS credits<input type="number" min="0" max="60" step=".5" value={newEcts} onChange={(event) => setNewEcts(event.target.value)} required /></label></div>
        <label className="form-label">Description<textarea rows={3} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="What does this module cover?" /></label>
        <div className="form-row"><label className="form-label">Progress<select value={newStatus} onChange={(event) => setNewStatus(event.target.value as ModuleStatus)}><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label><label className="form-label">Exam result<select value={newResult} onChange={(event) => setNewResult(event.target.value as 'unrecorded' | 'passed' | 'failed')}><option value="unrecorded">Not recorded</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label></div>
        <label className="form-label">Grade <small>Optional, German scale 1.0–4.0 for the weighted average. Failed or ungraded courses are excluded.</small><input type="number" min="1" max="4" step=".1" value={newGrade} onChange={(event) => setNewGrade(event.target.value)} placeholder="e.g. 2.3" /></label>
        {!editingModuleId && <label className="form-label">Recommended preparation <span className="optional-label">OPTIONAL</span><select value={newDependency} onChange={(event) => setNewDependency(event.target.value)}><option value="">No connection yet</option>{plan.modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><small>This creates a suggested connection, not a formal prerequisite.</small></label>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="button button-primary"><FilePlus2 size={16} /> {editingModuleId ? 'Save changes' : 'Add to plan'}</button></div>
      </form></div>}
      {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}

export default function AppRoot() {
  return <ReactFlowProvider><App /></ReactFlowProvider>;
}
