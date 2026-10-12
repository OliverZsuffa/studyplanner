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
  CircleHelp, Clock3, FilePlus2, Filter, GraduationCap, LayoutGrid, List, ClipboardPaste,
  Plus, Search, Settings2, Sparkles, Target, X, Zap, Moon, Sun, CalendarDays, Award, Columns3, Pencil, ArrowRight, Route,
} from 'lucide-react';
import { canSelectRequirementOption, getAvailableModules, getNextStepModules, getPlannedSemester, getProgress, getModuleRequirementGroups, getRequirementGroupSummary, getWeightedGradeAverage, isModuleCountedInPlan, isModuleVisibleInPlan, migrateStudyPlan, statusLabels, type Dependency, type ModuleRecommendation, type ModuleStatus, type StudyModule, type StudyPlan, withPlannedSemester, getModulePlanningBlockReason, matchesSeasonFilter, getSemesterWorkloadEcts } from './model';
import { samplePlan } from './samplePlan';
import ImportWizard from './ImportWizard';
import QuickAddWizard from './QuickAddWizard';
import SchedulingPanel from './SchedulingPanel';
import DependencyEditor from './DependencyEditor';
import { availabilityConflict, getTermForSemester, getTermLabel } from './model';

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
  const availability = module.availability ?? 'both';
  return (
    <div className={['module-node', 'status-' + module.status, selected ? 'is-selected' : '', available ? 'is-available' : ''].join(' ')} onClick={() => onSelect(module.id)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-topline">
        <span className="node-code">{module.code}</span>
        {module.recommendation && module.recommendation !== 'not-reviewed' ? <span className={'recommendation-pill ' + module.recommendation}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : 'Recommended'}</span> : null}
        {module.status === 'completed' ? <CheckCircle2 size={15} /> : available ? <span className="available-dot" /> : null}
      </div>
      <div className="node-title">{module.title}</div>
      <div className="node-meta"><span>{module.ects} ECTS</span><span className={'node-season season-' + availability}>{availability === 'both' ? 'Winter + summer' : availability === 'winter' ? 'Winter semester' : 'Summer semester'}</span><span>{plannedSemester ? `Planned S${plannedSemester}` : 'Unplanned'}</span>{module.recommendedSemester ? <span>Official S{module.recommendedSemester}</span> : null}</div>
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
  const ids = new Set(plan.modules.map(module => module.id));
  const byId = new Map(plan.modules.map(module => [module.id, module]));
  const outgoing = new Map<string, string[]>(), incoming = new Map<string, string[]>(), indegree = new Map(plan.modules.map(module => [module.id, 0]));
  plan.dependencies.filter(d => ids.has(d.source) && ids.has(d.target)).forEach(d => {
    outgoing.set(d.source, [...(outgoing.get(d.source) ?? []), d.target]);
    incoming.set(d.target, [...(incoming.get(d.target) ?? []), d.source]);
    indegree.set(d.target, (indegree.get(d.target) ?? 0) + 1);
  });
  const ready = plan.modules.filter(m => indegree.get(m.id) === 0).map(m => m.id).sort((a,b) => (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b));
  const depth = new Map<string, number>(plan.modules.map(m => [m.id, 0])), ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift()!; ordered.push(id);
    for (const target of outgoing.get(id) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(id) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) { ready.push(target); ready.sort((a,b) => (depth.get(a) ?? 0) - (depth.get(b) ?? 0) || (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b)); }
    }
  }
  const unresolved = plan.modules.map(m => m.id).filter(id => !ordered.includes(id));
  const finalDepth = Math.max(0, ...ordered.map(id => depth.get(id) ?? 0)) + 1;
  unresolved.forEach(id => depth.set(id, finalDepth));
  const layers = new Map<number, string[]>();
  plan.modules.forEach(m => { const d = depth.get(m.id) ?? 0; layers.set(d, [...(layers.get(d) ?? []), m.id]); });
  for (const layer of layers.values()) layer.sort((a,b) => (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b));
  const layerIndex = new Map<string, number>();
  for (let pass = 0; pass < 3; pass++) {
    for (const [layerDepth, layerIds] of [...layers.entries()].sort(([a],[b]) => a - b)) {
      if (layerDepth === 0) { layerIds.forEach((id,index) => layerIndex.set(id,index)); continue; }
      layerIds.sort((a,b) => {
        const average = (id: string) => {
          const parents = incoming.get(id) ?? [];
          const values = parents.map(parent => layerIndex.get(parent)).filter((value): value is number => value !== undefined);
          return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : Number.MAX_SAFE_INTEGER;
        };
        return average(a) - average(b) || (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b);
      });
      layerIds.forEach((id,index) => layerIndex.set(id,index));
    }
  }
  const positions = new Map<string, {x:number;y:number}>();
  [...layers.entries()].sort(([a],[b])=>a-b).forEach(([layer, layerIds])=>layerIds.forEach((id,index)=>positions.set(id,{x:80+layer*340,y:70+index*174})));
  const nodes: ModuleFlowNode[] = plan.modules.map(module => ({
    id:module.id,type:'moduleCard',position:positions.get(module.id) ?? {x:80,y:70},
    data:{module,available:nextStepIds.has(module.id),selected:selectedId===module.id,incoming:(incoming.get(module.id)??[]).length,outgoing:(outgoing.get(module.id)??[]).length,onSelect},
    draggable:false,
  }));
  const edges: Edge[] = plan.dependencies.filter(d=>ids.has(d.source)&&ids.has(d.target)).map(d=>{
    const related=selectedId!==null&&(d.source===selectedId||d.target===selectedId), selected=selectedId!==null, color=d.kind==='required'?'#8b72d6':'#a8b3a5';
    return {id:d.id,source:d.source,target:d.target,type:'smoothstep',animated:false,label:d.kind==='required'?'Required':'Recommended',
      labelStyle:{fontSize:10,fontWeight:600,fill:d.kind==='required'?'#6b55b5':'#748276',opacity:(selected&&!related)?0.25:1},
      labelBgStyle:{fill:'#ffffff',fillOpacity:(related||!selected)?0.94:0.45},labelBgPadding:[5,3] as [number,number],labelBgBorderRadius:5,
      style:d.kind==='required'?{stroke:color,strokeWidth:related?4:3,opacity:(selected&&!related)?0.12:1}:{stroke:color,strokeWidth:related?3.5:2.5,strokeDasharray:'6 5',opacity:(selected&&!related)?0.12:1},
      markerEnd:{type:'arrowclosed' as const,color}};
  });
  return {nodes,edges,unresolvedCount:unresolved.length};
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
  const [seasonFilter, setSeasonFilter] = useState<'all' | 'winter' | 'summer'>('all');
  const [planningSemester, setPlanningSemester] = useState('1');
  const [extraCourseId, setExtraCourseId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'kanban' | 'graph' | 'list' | 'schedule'>('kanban');
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSessionEditor, setShowSessionEditor] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => { try { return localStorage.getItem('studyplanner.tour-seen') !== 'true'; } catch { return false; } });
  const [tourStep, setTourStep] = useState(0);
  const visiblePlan = useMemo(() => ({ ...plan, modules: plan.modules.filter((module) => isModuleVisibleInPlan(plan, module.id)) }), [plan]);
  const available = useMemo(() => getAvailableModules(plan), [plan]);
  const progress = useMemo(() => getProgress(plan), [plan]);
  const gradeSummary = useMemo(() => getWeightedGradeAverage(plan), [plan]);
  const gradeWeight = gradeSummary.ects;
  const gradeAverage = gradeSummary.average === null ? '—' : gradeSummary.average.toFixed(2);
  const gradedModules = gradeSummary.count;
  const semesters = useMemo(() => Array.from({ length: Math.max(6, ...plan.modules.map((module) => getPlannedSemester(module) ?? 0), 1) }, (_, index) => index + 1), [plan.modules]);
  const semesterTotals = useMemo(() => semesters.map((semester) => { const modules = plan.modules.filter((module) => getPlannedSemester(module) === semester && isModuleCountedInPlan(plan, module.id)); return { semester, modules, ects: getSemesterWorkloadEcts(modules), completed: modules.filter((module) => module.completedThroughPriorStudy !== true && module.result === 'passed').reduce((sum, module) => sum + module.ects, 0) }; }), [plan, semesters]);
  const selected = plan.modules.find((module) => module.id === selectedId) ?? null;
  const targetSemester = Math.max(1, Math.min(20, Number(planningSemester) || 1));
  const compatibleExtraCourses = plan.modules.filter(module => isModuleVisibleInPlan(plan, module.id) && getPlannedSemester(module) === null && getModulePlanningBlockReason(plan, module, targetSemester) === null);
  const filteredModules = useMemo(() => visiblePlan.modules.filter((module) => {
    const matchesQuery = (module.title + ' ' + module.code + ' ' + module.category).toLowerCase().includes(query.toLowerCase());
    const matchesSemester = semesterFilter === 'all' || (semesterFilter === 'unplanned' ? getPlannedSemester(module) === null : String(getPlannedSemester(module) ?? '') === semesterFilter);
    const matchesStatus = statusFilter === 'all' || module.status === statusFilter;
     const matchesSeason = matchesSeasonFilter(module, seasonFilter);
     return matchesQuery && matchesSemester && matchesStatus && matchesSeason;
   }), [visiblePlan.modules, query, semesterFilter, statusFilter, seasonFilter]);
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

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.search-box input')?.focus();
      }
      if (event.key === 'Escape') {
        if (showSessionEditor) setShowSessionEditor(false);
        else if (showQuickAdd) setShowQuickAdd(false);
        else if (showImport) setShowImport(false);
        else if (showAdd) setShowAdd(false);
        else if (tourOpen) finishTour();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [showSessionEditor, showQuickAdd, showImport, showAdd, tourOpen]);

  const finishTour = () => {
    setTourOpen(false);
    try { localStorage.setItem('studyplanner.tour-seen', 'true'); } catch { /* storage may be unavailable */ }
  };
  const tourSteps = [
    { title: 'Welcome to your study planner', eyebrow: '1 OF 5 · GETTING STARTED', body: 'This is your personal workspace. Your plan is saved in this browser automatically. Use Export to make a backup, or Import to load a curriculum you prepared.', tip: 'Start with the plan you have. You can change it at any time.' },
    { title: 'Understand your progress', eyebrow: '2 OF 5 · OVERVIEW', body: 'The summary cards show completed courses, earned ECTS and courses that appear available based on recorded required prerequisites. Semester workload shows your planned credits and grade average.', tip: 'A suggested connection is not the same as an official exam prerequisite.' },
    { title: 'Choose electives when you are ready', eyebrow: '3 OF 5 · ELECTIVES', body: 'Open “Electives & requirements” and expand a group to see its alternatives. Choose only the course options you intend to take. Unselected alternatives stay out of your plan and totals.', tip: 'To add a missing course to a group, select that course and expand “Elective / choice groups” in its details.' },
    { title: 'Plan courses by semester', eyebrow: '4 OF 5 · YOUR PLAN', body: 'The Plan view is the everyday workspace. Move a course using its semester menu or drag it between columns. Use Map to explore relationships, or List to search and scan courses compactly.', tip: 'Your planned semester is personal; the official curriculum semester is kept separately.' },
    { title: 'Update one course at a time', eyebrow: '5 OF 5 · COURSE DETAILS', body: 'Select a course to edit its planned semester, progress, exam result and grade. Optional source details, recommendations and prerequisite information are tucked away until you need them.', tip: 'You do not need to fill in every field. Start with the semester and progress; add grades after exams.' },
  ];

  const selectModule = useCallback((id: string) => setSelectedId(id), []);
  const graph = useMemo(() => makeGraph(visiblePlan, nextStepIds, selectedId, selectModule), [visiblePlan, nextStepIds, selectedId, selectModule]);
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
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
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === id ? { ...module, status, completedThroughPriorStudy: status === 'completed' ? module.completedThroughPriorStudy : false } : module) }));
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
    const module = plan.modules.find((item) => item.id === id);
    const term = semester === null ? null : getTermForSemester(plan.startingTerm, semester);
    if (module && semester !== null && module.availability && module.availability !== 'both' && !term) { setToast('Set your starting semester and year in Schedule before assigning a winter-only or summer-only course.'); return; }
    const conflict = module && semester !== null ? availabilityConflict(module, term) : null;
    if (conflict) { setToast(conflict); return; }
    setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === id ? withPlannedSemester(module, semester) : module) }));
    setToast(semester === null ? 'Module moved to unplanned' : `Moved to semester ${semester}`);
  };

  const resetPlannedSemesters = () => {
    if (!window.confirm('Set every course to Unplanned? Course details, progress, dependencies, electives, grades, teaching sessions and exams will be preserved.')) return;
    setPlan(current => ({ ...current, modules: current.modules.map(module => withPlannedSemester(module, null)) }));
    setToast('All courses are now unplanned. All other course data was preserved.');
  };
  const applyRecommendedSemesters = () => {
    const nextModules = plan.modules.map(module => {
      if (getPlannedSemester(module) !== null || module.recommendedSemester == null || !isModuleVisibleInPlan(plan, module.id)) return module;
      return getModulePlanningBlockReason(plan, module, module.recommendedSemester) ? module : withPlannedSemester(module, module.recommendedSemester);
    });
    const assigned = nextModules.filter((module,index)=>getPlannedSemester(module)!==null&&getPlannedSemester(plan.modules[index])===null).length;
    const skipped = plan.modules.filter(module=>getPlannedSemester(module)===null&&module.recommendedSemester!=null&&isModuleVisibleInPlan(plan,module.id)&&getModulePlanningBlockReason(plan,module,module.recommendedSemester)!==null);
    setPlan({...plan,modules:nextModules});
    setToast(`Assigned recommended semesters to ${assigned} course(s). ${skipped.length} course(s) skipped because of availability or unfinished dependencies.`);
  };
  const addRecommendedForSemester = () => {
    const candidates=plan.modules.filter(module=>isModuleVisibleInPlan(plan,module.id)&&getPlannedSemester(module)===null&&module.recommendedSemester===targetSemester);
    const eligible=candidates.filter(module=>getModulePlanningBlockReason(plan,module,targetSemester)===null);
    if(eligible.length)setPlan(current=>({...current,modules:current.modules.map(module=>eligible.some(candidate=>candidate.id===module.id)?withPlannedSemester(module,targetSemester):module)}));
    setToast(`Added ${eligible.length} recommended course(s) to Semester ${targetSemester}. ${candidates.length-eligible.length} excluded because of season availability, unfinished dependencies, or completion status.`);
  };
  const addSelectedCompatibleCourse = () => {
    const course=compatibleExtraCourses.find(module=>module.id===extraCourseId);
    if(!course){setToast('Choose an eligible additional course first.');return;}
    moveModule(course.id,targetSemester);setExtraCourseId('');
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
          <button className="button button-quiet" onClick={() => { setTourStep(0); setTourOpen(true); }}><CircleHelp size={16} /> <span>Guided tour</span></button>
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
            <p className="privacy-note"><CheckCircle2 size={13} /> Your plan is saved in this browser. It is not synced between devices; use Export for a backup.</p>
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
            <div className="stat-foot">{progress.completed} of {progress.total} planned courses completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-heading"><span>Credits earned</span><span className="stat-icon mint"><GraduationCap size={17} /></span></div>
            <div className="stat-number">{progress.completedEcts}<span className="stat-unit"> / {progress.totalEcts}</span></div>
            <div className="stat-foot">Credits from courses marked passed</div>
          </div>
          <div className="stat-card">
            <div className="stat-heading"><span>Ready to take</span><span className="stat-icon amber"><Zap size={17} /></span></div>
            <div className="stat-number">{readyModules.length}<span className="stat-unit"> modules</span></div>
            <div className="stat-foot">No recorded formal prerequisites outstanding</div>
          </div>
          <div className="stat-card next-card">
            <div className="stat-heading"><span>A good next step</span><span className="stat-icon blue"><Sparkles size={17} /></span></div>
            <div className="next-course">{nextStepModules.find((module) => module.status === 'in-progress')?.title ?? nextStepModules[0]?.title ?? (readyModules.length ? 'Finish recommended preparation first' : 'You are all caught up')}</div>
            <button className="text-link" onClick={() => { const target = nextStepModules[0] ?? readyModules[0]; if (target) { const unfinished = plan.dependencies.find((dependency) => dependency.target === target.id && plan.modules.some((module) => module.id === dependency.source && module.status !== 'completed')); setSelectedId(unfinished?.source ?? target.id); setView('graph'); } }}>Explore your next step <span>↗</span></button>
          </div>
        </section>

        <section className="semester-planning" aria-label="Semester workload">
          <div className="semester-planning-heading"><div><div className="eyebrow"><CalendarDays size={14} /> YOUR PLAN AT A GLANCE</div><h2>Semester workload</h2><p>ECTS show the workload still to complete in each planned semester. Courses completed through prior studies count toward overall degree ECTS, but are excluded from this workload.</p></div><div className="grade-average"><Award size={19} /><span><small>Grade average</small><strong>{gradeAverage}</strong><em>{gradedModules ? `ECTS-weighted · ${gradeWeight} ECTS graded` : 'Add grades to calculate'}</em></span></div></div>
          <div className="semester-grid">{semesterTotals.map(({ semester, modules, ects, completed }) => <button key={semester} className={'semester-card ' + (modules.length ? '' : 'semester-empty')} onClick={() => { setSemesterFilter(String(semester)); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="semester-card-top"><strong>Semester {semester}</strong><span>{modules.length} {modules.length === 1 ? 'course' : 'courses'}</span></span><span className="semester-ects">{ects}<small> ECTS planned</small></span><span className="semester-progress"><i style={{ width: ects ? `${Math.min(100, completed / ects * 100)}%` : '0%' }} /></span><span className="semester-card-foot">{completed} of {ects} ECTS passed</span></button>)}</div>
          {visiblePlan.modules.some((module) => getPlannedSemester(module) === null) && <p className="semester-unplanned-note">{visiblePlan.modules.filter((module) => getPlannedSemester(module) === null).length} module(s) have no planned semester yet. <button className="text-link" onClick={() => { setSemesterFilter('unplanned'); document.querySelector('.planner-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review unplanned modules ↗</button></p>}
          {(plan.requirementGroups ?? []).length > 0 && <section className="elective-selector" aria-label="Elective and requirement choices"><div className="elective-selector-heading"><div><h3>Electives & requirements</h3><p>Choose the options you intend to take. Unselected alternatives stay here and do not appear in your plan or count toward ECTS.</p><small className="section-hint"><CircleHelp size={13} /> Expand a group to see its courses. To add a missing course, select it below and open “Elective / choice groups” in its details.</small></div></div>{(plan.requirementGroups ?? []).map((group) => { const options = plan.modules.filter((module) => group.moduleIds.includes(module.id)); const summary = getRequirementGroupSummary(plan, group); const ruleText = group.rule === 'min-ects' ? `At least ${group.target} ECTS` : group.rule === 'max-ects' ? `At most ${group.target} ECTS` : group.rule === 'exact-ects' ? `Exactly ${group.target} ECTS` : group.rule === 'module-count' ? `Choose ${group.target} modules` : `Choose from ${group.target} areas`; return <details className="elective-group" key={group.id}><summary className="elective-group-heading"><div><strong>{group.title}</strong><small>{ruleText}</small></div><span className={'requirement-state ' + summary.state}>{summary.selectedEcts} ECTS · {summary.selectedCount} selected</span></summary><p className={'requirement-message ' + summary.state}>{summary.message}</p>{options.length === 0 ? <p className="elective-empty">No courses linked yet. Select a course in the plan and use “Elective / choice groups” to add it here.</p> : <div className="elective-options">{options.map((module) => { const chosen = (group.selectedModuleIds ?? []).includes(module.id); const check = canSelectRequirementOption(plan, group.id, module.id); return <div className={'elective-option ' + (chosen ? 'chosen' : '')} key={module.id}><div className="elective-option-info"><strong>{module.title}</strong><small>{module.code} · {module.ects} ECTS{module.recommendation === 'strongly-recommended' ? ' · Your recommendation: Strongly recommended' : module.recommendation === 'recommended' ? ' · Your recommendation: Recommended' : ''}</small>{getModuleRequirementGroups(plan, module.id).length > 1 && <small className="elective-overlap-note">Also belongs to another requirement; selected in all linked groups to count.</small>}</div><button type="button" className={chosen ? 'button button-quiet' : 'button button-primary'} disabled={!chosen && !check.allowed} title={!chosen && !check.allowed ? check.reason : undefined} onClick={() => toggleRequirementOption(group.id, module.id)}>{chosen ? 'Remove choice' : 'Choose'}</button>{!chosen && !check.allowed && <small className="elective-disabled-reason">{check.reason}</small>}</div>; })}</div>}</details>; })}</section>}
        </section>

        <section className="planner-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE BIG PICTURE</div>
              <h2>Your study map</h2>
              <p>{view === 'schedule' ? 'Set course availability, enter teaching sessions and exams, resolve timetable conflicts, and manage dependency connections.' : view === 'kanban' ? 'Move courses between semester columns. Select a course to update its progress and exam results.' : view === 'graph' ? 'Explore course relationships. Solid lines mean required prerequisites; dashed lines mean recommended preparation.' : 'Search and scan courses in a compact list. Select any course to edit its details.'}</p>
            </div>
            <div className="view-toggle" aria-label="Choose view">
              <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><Columns3 size={15} /> Plan</button>
              <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><LayoutGrid size={15} /> Map</button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={15} /> List</button>
              <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}><CalendarDays size={15} /> Schedule</button>
            </div>
          </div>

          <details className="how-to-use"><summary>How to use your study planner</summary><div className="how-to-steps"><span className="how-to-number">1</span><span><strong>Select a course</strong><small>Open its details</small></span><span className="how-to-arrow">→</span><span className="how-to-number">2</span><span><strong>Update your plan</strong><small>Semester, progress, result and grade</small></span><span className="how-to-arrow">→</span><span className="how-to-number">3</span><span><strong>Arrange the map</strong><small>Drag cards; connect the handles</small></span></div></details>
          {planningWarnings.length > 0 && <section className="planning-warnings" aria-label="Planning warnings"><strong><CircleHelp size={15} /> Check your module order</strong><ul>{planningWarnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}</ul><small>Only recorded required relationships are checked here. Recommended preparation is guidance, not a formal blocker.</small></section>}
          <div className="planner-toolbar">
            <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module..." /><kbd>⌘ K</kbd></label>
            <div className="filter-control"><Filter size={15} /><select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Filter by semester"><option value="all">All semesters</option><option value="unplanned">Unplanned</option>{[...new Set(plan.modules.map((module) => (getPlannedSemester(module) ?? 0)))].filter((semester) => semester > 0).sort((a, b) => a - b).map((semester) => <option key={semester} value={String(semester)}>Semester {semester}</option>)}</select></div>
            <div className="filter-control"><Clock3 size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></div>
             <div className="filter-control"><Sun size={15} /><select value={seasonFilter} onChange={event=>setSeasonFilter(event.target.value as 'all'|'winter'|'summer')} aria-label="Filter by course availability"><option value="all">Winter + summer</option><option value="winter">Winter semester</option><option value="summer">Summer semester</option></select></div>
            <div className="toolbar-spacer" />
            <button className="button button-quiet quick-add-trigger" onClick={() => setShowQuickAdd(true)}><ClipboardPaste size={16} /> <span>Quick add many</span></button>
            <button className="button button-primary" onClick={openAddModule}><Plus size={16} /> Add one</button>
          </div>

          <section className="semester-planner-actions" aria-label="Semester planning actions">
            <div className="semester-planner-actions-heading"><div><strong>Plan a semester faster</strong><small>Seasonal availability and recorded dependencies are checked before courses are assigned.</small></div><div className="semester-planner-buttons"><button type="button" className="button button-quiet" onClick={applyRecommendedSemesters}>Fill unplanned from recommendations</button><button type="button" className="button button-quiet" onClick={resetPlannedSemesters}>Reset planned semesters</button></div></div>
            <div className="semester-planner-row"><label>Target semester<select value={planningSemester} onChange={event=>{setPlanningSemester(event.target.value);setExtraCourseId('');}} aria-label="Target semester">{semesters.map(semester=><option value={semester} key={semester}>{plan.startingTerm?'S'+semester+' · '+getTermLabel(getTermForSemester(plan.startingTerm,semester)):'Semester '+semester}</option>)}<option value={Math.max(...semesters)+1}>{plan.startingTerm?'S'+(Math.max(...semesters)+1)+' · '+getTermLabel(getTermForSemester(plan.startingTerm,Math.max(...semesters)+1)):'Semester '+(Math.max(...semesters)+1)}</option></select></label><button type="button" className="button button-primary" onClick={addRecommendedForSemester}>Add eligible recommended courses</button><label className="extra-course-picker">Additional compatible course<select value={extraCourseId} onChange={event=>setExtraCourseId(event.target.value)}><option value="">Choose a course…</option>{compatibleExtraCourses.map(module=><option key={module.id} value={module.id}>{module.code} · {module.title} · {module.ects} ECTS</option>)}</select></label><button type="button" className="button button-quiet" disabled={!extraCourseId} onClick={addSelectedCompatibleCourse}>Add selected course</button></div>
            <small className="semester-planner-footnote">{compatibleExtraCourses.length} additional course(s) currently meet the target semester's availability and dependency checks. Recommended courses already assigned elsewhere are left untouched.</small>
          </section>

           <div className={'planner-layout ' + (view === 'list' ? 'list-mode' : '') + (view === 'kanban' ? ' kanban-mode' : '') + (view === 'schedule' ? ' schedule-mode' : '')}>
            <div className="graph-panel">
              {view === 'schedule' ? <SchedulingPanel plan={plan} setPlan={setPlan} onSelectModule={(id) => { setSelectedId(id); setView('kanban'); }} /> : view === 'kanban' ? (
                <div className="kanban-board" aria-label="Semester planning board">
                  {[...semesters.map((semester) => ({ semester, title: plan.startingTerm ? `S${semester} · ${getTermLabel(getTermForSemester(plan.startingTerm, semester))}` : `Semester ${semester}` })), { semester: null as number | null, title: 'Unplanned' }].map((column) => {
                    const columnModules = filteredModules.filter((module) => getPlannedSemester(module) === column.semester);
                    const total = columnModules.filter((module) => isModuleCountedInPlan(plan, module.id)).reduce((sum, module) => sum + module.ects, 0);
                    return <section className="kanban-column" key={column.title} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/studyplanner-module'); if (id) moveModule(id, column.semester); }} aria-label={column.title}>
                      <header className="kanban-column-header"><div><strong>{column.title}</strong><small>{columnModules.length} {columnModules.length === 1 ? 'module' : 'modules'}</small></div><span>{total} ECTS</span></header>
                      <div className="kanban-cards">
                        {columnModules.map((module) => <article className={'kanban-card ' + (selectedId === module.id ? 'selected' : '')} key={module.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/studyplanner-module', module.id); event.dataTransfer.effectAllowed = 'move'; }} onClick={() => setSelectedId(module.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(module.id); } }} tabIndex={0} aria-label={`${module.title}, ${module.ects} ECTS`}>
                          <div className="kanban-card-top"><span>{module.code}</span><button className="kanban-edit" aria-label={`Edit ${module.title}`} onClick={(event) => { event.stopPropagation(); openEditModule(module); }}><Pencil size={13} /></button></div>
                          <strong>{module.title}</strong><p>{module.category} · {module.ects} ECTS</p>
                          <div className="kanban-card-footer"><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span>{module.recommendation && module.recommendation !== 'not-reviewed' ? <span className={'recommendation-pill ' + module.recommendation}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : 'Recommended'}</span> : null}{module.recommendedSemester && <small>Official S{module.recommendedSemester}</small>}</div>
                          <label className="kanban-move" onClick={(event) => event.stopPropagation()}>Move to<select aria-label={`Move ${module.title} to semester`} value={getPlannedSemester(module) ?? ''} onChange={(event) => moveModule(module.id, event.target.value === '' ? null : Number(event.target.value))}><option value="">Unplanned</option>{semesters.map((semester) => <option key={semester} value={semester}>{plan.startingTerm ? `S${semester} · ${getTermLabel(getTermForSemester(plan.startingTerm, semester))}` : `Semester ${semester}`}</option>)}<option value={Math.max(...semesters) + 1}>{plan.startingTerm ? `S${Math.max(...semesters) + 1} · ${getTermLabel(getTermForSemester(plan.startingTerm, Math.max(...semesters) + 1))}` : `Semester ${Math.max(...semesters) + 1}`}</option></select></label>
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
                     <span><i className="legend-line required-line" /> Required prerequisite</span><span><i className="legend-line recommended-line" /> Recommended preparation</span><span><i className="legend-dot" /> Available next</span>
                     {graph.unresolvedCount > 0 && <span className="graph-cycle-warning">{graph.unresolvedCount} course(s) in or blocked by a dependency cycle are placed in the final layer.</span>}
                   </div><DependencyEditor plan={plan} setPlan={setPlan} />
                </>
              ) : (
                <div className="module-list">
                  {filteredModules.length === 0 ? <div className="empty-state"><Search size={24} /><strong>No modules found</strong><span>Try a different search or filter.</span></div> : filteredModules.map((module) => (
                    <button className={'list-module ' + (selectedId === module.id ? 'selected' : '')} key={module.id} onClick={() => setSelectedId(module.id)}>
                      <span className="list-semester">{getPlannedSemester(module) ? `S${getPlannedSemester(module)}` : '—'}</span><span className="list-module-name"><strong>{module.title}</strong><small>{module.code} · {module.category}</small></span><span className="list-ects">{module.ects} ECTS</span><span className={'status-pill ' + module.status}>{statusLabels[module.status]}</span>{module.recommendation && module.recommendation !== 'not-reviewed' ? <span className={'recommendation-pill ' + module.recommendation}>{module.recommendation === 'strongly-recommended' ? 'Strongly recommended' : 'Recommended'}</span> : null}<span className="list-arrow">↗</span>
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
                  <section className="course-sessions-shortcut"><div><strong>Teaching sessions & exams</strong><span>{(selected.components ?? []).length} teaching component{(selected.components ?? []).length === 1 ? '' : 's'} · {(selected.exams ?? []).length} exam{(selected.exams ?? []).length === 1 ? '' : 's'}</span></div><button type="button" className="button button-quiet" onClick={() => setShowSessionEditor(true)}><CalendarDays size={15} /> Edit here</button></section>
                  <details className="detail-advanced"><summary>Optional planning guidance <span>{selected.recommendation === 'strongly-recommended' ? 'Strongly recommended' : selected.recommendation === 'recommended' ? 'Recommended' : 'No recommendation set'}</span></summary><p>This is your own optional rating of how useful a course seems. It is not an official assessment and does not change progress, semester, or ECTS.</p><label className="field-label" htmlFor="module-recommendation">Course recommendation</label><select id="module-recommendation" className="status-select detail-field-gap" value={selected.recommendation ?? 'not-reviewed'} onChange={(event) => changeRecommendation(selected.id, event.target.value as ModuleRecommendation)}><option value="not-reviewed">No recommendation set</option><option value="recommended">Recommended</option><option value="strongly-recommended">Strongly recommended</option></select></details>
                  <label className="field-label" htmlFor="planned-semester">WHEN DO YOU PLAN TO TAKE IT?</label>
                  <select id="planned-semester" className="status-select detail-field-gap" value={getPlannedSemester(selected) ?? ''} onChange={(event) => { const next = event.target.value === '' ? null : Number(event.target.value); const mapped = next === null ? null : getTermForSemester(plan.startingTerm, next); if (next !== null && selected.availability && selected.availability !== 'both' && !mapped) { setToast('Set your starting semester and year in Schedule before assigning a winter-only or summer-only course.'); return; } const problem = next === null ? null : availabilityConflict(selected, mapped); if (problem) { setToast(problem); return; } setPlan((current) => ({ ...current, modules: current.modules.map((module) => module.id === selected.id ? { ...module, semester: next ?? undefined, plannedSemester: next } : module) })); }}><option value="">Not planned</option>{semesters.map((semester) => <option key={semester} value={semester}>{plan.startingTerm ? 'S'+semester+' · '+getTermLabel(getTermForSemester(plan.startingTerm, semester)) : 'Semester '+semester}</option>)}<option value={Math.max(...semesters) + 1}>{plan.startingTerm ? 'S'+(Math.max(...semesters)+1)+' · '+getTermLabel(getTermForSemester(plan.startingTerm, Math.max(...semesters)+1)) : 'Semester '+(Math.max(...semesters)+1)}</option></select>
                  <details className="detail-advanced"><summary>Official source information</summary><p>Official study-plan semester: {selected.recommendedSemester ? `Semester ${selected.recommendedSemester}` : 'Not known'}{selected.sourceLocation ? ` · ${selected.sourceLocation}` : ''}</p>{selected.sourceEvidence && <p><strong>Source evidence</strong><br />{selected.sourceEvidence}</p>}{selected.sourceLocation && /^https?:\/\//i.test(selected.sourceLocation) && <p><a href={selected.sourceLocation} target="_blank" rel="noreferrer">Open source ↗</a></p>}</details>
                  {selected.description && <p className="detail-description">{selected.description}</p>}
                  {(plan.requirementGroups ?? []).length > 0 && <details className="detail-advanced"><summary>Elective / choice groups <span>{getModuleRequirementGroups(plan, selected.id).length ? 'Linked' : 'Not linked'}</span></summary><p>Tick a group to add this course as one of its options. Then choose whether you plan to take it.</p>{(plan.requirementGroups ?? []).map((group) => { const linked = group.moduleIds.includes(selected.id); const chosen = (group.selectedModuleIds ?? []).includes(selected.id); return <div className="module-group-link" key={group.id}><label><input type="checkbox" checked={linked} onChange={(event) => { const checked = event.target.checked; setPlan((current) => ({ ...current, requirementGroups: (current.requirementGroups ?? []).map((item) => item.id === group.id ? { ...item, moduleIds: checked ? [...item.moduleIds, selected.id] : item.moduleIds.filter((id) => id !== selected.id), selectedModuleIds: checked ? (item.selectedModuleIds ?? []) : (item.selectedModuleIds ?? []).filter((id) => id !== selected.id) } : item) })); }} />{group.title}</label>{linked && <label className="module-group-choice"><input type="checkbox" checked={chosen} onChange={(event) => { if (event.target.checked) { const check = canSelectRequirementOption(plan, group.id, selected.id); if (!check.allowed) { setToast(check.reason ?? 'This course cannot be selected yet'); return; } } toggleRequirementOption(group.id, selected.id); }} />Plan to take</label>}</div>; })}</details>}
                  <label className="field-label" htmlFor="module-status">COURSE PROGRESS</label>
                  <select id="module-status" className="status-select" value={selected.status} onChange={(event) => changeStatus(selected.id, event.target.value as ModuleStatus)}>
                    <option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option>
                  </select>
                  <label className="prior-study-toggle"><input type="checkbox" checked={selected.completedThroughPriorStudy === true} disabled={selected.status !== 'completed'} onChange={event=>setPlan(current=>({...current,modules:current.modules.map(module=>module.id===selected.id?{...module,completedThroughPriorStudy:event.target.checked}:module)}))}/><span><strong>Completed through prior studies</strong><small>Counts toward degree and completed ECTS, but is excluded from the workload still to complete in its planned semester.</small></span></label>
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
                </>
              ) : (
                <div className="detail-empty"><div className="empty-illustration"><BookOpen size={24} /></div><h3>Start with a course</h3><p>Choose a card to record progress and grades, or add a course that is missing from your plan.</p><button className="button button-primary" onClick={openAddModule}><Plus size={15} /> Add your first course</button></div>
              )}
            </aside>
          </div>
          {view === 'graph' && <DependencyEditor plan={plan} setPlan={setPlan} />}

          <div className="bottom-note"><span><span className="sample-badge"><CircleHelp size={12} /> SAMPLE DATA</span> {plan.institution}</span><button onClick={() => { if (window.confirm('Reset your plan and progress to the original sample? This cannot be undone.')) { setPlan(samplePlan); setSelectedId('algorithms'); setToast('Sample plan restored'); } }}><Settings2 size={14} /> Reset sample</button></div>
        </section>

        <section className="next-strip">
          <div className="next-strip-icon"><Zap size={18} /></div><div><strong>Your next move, made clearer.</strong><p>Complete modules to satisfy formal prerequisites. Recommended links also guide the next-step suggestion, without becoming formal requirements.</p></div><button onClick={() => { setStatusFilter('not-started'); setView('list'); }}>See unfinished modules <span>→</span></button>
        </section>
        <footer><span>STUDYPLANNER <span className="footer-dot">•</span> A BETTER WAY THROUGH YOUR DEGREE</span><span>Made for curious minds.</span></footer>
      </main>

      {tourOpen && <div className="tour-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finishTour(); }}><section className="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div className="tour-dialog-top"><span className="tour-icon"><Route size={20} /></span><button type="button" className="icon-button" aria-label="Close guided tour" onClick={finishTour}><X size={17} /></button></div><div className="tour-eyebrow">{tourSteps[tourStep].eyebrow}</div><h2 id="tour-title">{tourSteps[tourStep].title}</h2><p>{tourSteps[tourStep].body}</p><div className="tour-tip"><Sparkles size={15} /><span>{tourSteps[tourStep].tip}</span></div><div className="tour-progress" aria-label={`Step ${tourStep + 1} of ${tourSteps.length}`}>{tourSteps.map((step, index) => <span key={step.eyebrow} className={index <= tourStep ? 'active' : ''} />)}</div><div className="tour-actions"><button type="button" className="button button-quiet" onClick={finishTour}>Skip tour</button><div>{tourStep > 0 && <button type="button" className="button button-quiet" onClick={() => setTourStep((step) => step - 1)}>Back</button>}<button type="button" className="button button-primary" onClick={() => tourStep === tourSteps.length - 1 ? finishTour() : setTourStep((step) => step + 1)}>{tourStep === tourSteps.length - 1 ? 'Start planning' : 'Next'} <ArrowRight size={15} /></button></div></div></section></div>}
      {showSessionEditor && selected && <div className="modal-backdrop session-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSessionEditor(false); }}><section className="session-editor-modal" role="dialog" aria-modal="true" aria-label={`Teaching sessions and exams for ${selected.title}`}><div className="session-editor-modal-heading"><div><div className="eyebrow">COURSE DETAILS</div><h2>{selected.title}</h2><p>Edit sessions and exams without leaving your course card.</p></div><button type="button" className="icon-button" aria-label="Close session editor" onClick={() => setShowSessionEditor(false)}><X size={18} /></button></div><SchedulingPanel plan={plan} setPlan={setPlan} compactModuleId={selected.id} compact /></section></div>}
      {showQuickAdd && <QuickAddWizard currentPlan={plan} onClose={() => setShowQuickAdd(false)} onApply={(modules) => { setPlan((current) => ({ ...current, modules: [...current.modules, ...modules] })); setSelectedId(modules[0]?.id ?? selectedId); setShowQuickAdd(false); setToast(`Added ${modules.length} ${modules.length === 1 ? 'course' : 'courses'}`); }} />}
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
