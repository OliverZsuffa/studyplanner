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
import { getAvailableModules, getProgress, statusLabels, type Dependency, type ModuleStatus, type StudyModule, type StudyPlan } from './model';
import { samplePlan } from './samplePlan';
import ImportWizard from './ImportWizard';

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
  const gradedModules = plan.modules.filter((module) => module.result === 'passed' && typeof module.grade === 'number' && Number.isFinite(module.grade));
  const gradeWeight = gradedModules.reduce((sum, module) => sum + module.ects, 0);
  const gradeAverage = gradeWeight ? (gradedModules.reduce((sum, module) => sum + (module.grade ?? 0) * module.ects, 0) / gradeWeight).toFixed(2) : '—';
  const semesters = useMemo(() => Array.from({ length: Math.max(6, ...plan.modules.map((module) => module.semester), 1) }, (_, index) => index + 1), [plan.modules]);
  const semesterTotals = useMemo(() => semesters.map((semester) => { const modules = plan.modules.filter((module) => module.semester === semester); return { semester, modules, ects: modules.reduce((sum, module) => sum + module.ects, 0), completed: modules.filter((module) => module.result === 'passed').reduce((sum, module) => sum + module.ects, 0) }; }), [plan.modules, semesters]);
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


