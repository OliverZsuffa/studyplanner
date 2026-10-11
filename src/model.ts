export type ModuleStatus = 'not-started' | 'in-progress' | 'completed';
export type ModuleRecommendation = 'not-reviewed' | 'recommended' | 'strongly-recommended';
export type DependencyKind = 'required' | 'recommended';
export type RequirementRule = 'min-ects' | 'max-ects' | 'exact-ects' | 'module-count' | 'one-from-each';

export interface RequirementGroup {
  id: string;
  title: string;
  rule: RequirementRule;
  target: number;
  moduleIds: string[];
  selectedModuleIds?: string[];
  sourceNote?: string;
}

export interface StudyModule {
  id: string;
  title: string;
  code: string;
  /** Legacy backup field; use plannedSemester for the student's actual plan. */
  semester?: number;
  /** Semester the student currently plans to take this module. Unknown stays null. */
  plannedSemester?: number | null;
  /** Semester shown in the official study plan, if known. */
  recommendedSemester?: number | null;
  sourceEvidence?: string;
  sourceLocation?: string;
  ects: number;
  status: ModuleStatus;
  /** Guidance only; independent from progress and semester planning. */
  recommendation?: ModuleRecommendation;
  description: string;
  category: string;
  grade?: number;
  result?: 'passed' | 'failed';
}

export interface Dependency {
  id: string;
  source: string;
  target: string;
  kind: DependencyKind;
  note?: string;
  provenance: 'official' | 'user' | 'illustrative' | 'ai-suggested';
  relationshipConfidence?: 'formal' | 'recommended' | 'uncertain';
}

export interface StudyPlan {
  name: string;
  institution: string;
  modules: StudyModule[];
  dependencies: Dependency[];
  requirementGroups?: RequirementGroup[];
}

export const statusLabels: Record<ModuleStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
};

export function getPlannedSemester(module: StudyModule): number | null {
  return typeof module.plannedSemester === 'number' ? module.plannedSemester : typeof module.semester === 'number' ? module.semester : null;
}

export function withPlannedSemester(module: StudyModule, semester: number | null): StudyModule {
  return { ...module, semester: semester ?? undefined, plannedSemester: semester };
}

export function migrateStudyPlan(value: StudyPlan): StudyPlan {
  return {
    ...value,
    modules: value.modules.map((module) => ({
      ...module,
      plannedSemester: typeof module.plannedSemester === 'number' ? module.plannedSemester : typeof module.semester === 'number' ? module.semester : null,
      recommendedSemester: typeof module.recommendedSemester === 'number' ? module.recommendedSemester : null,
      recommendation: module.recommendation === 'recommended' || module.recommendation === 'strongly-recommended' ? module.recommendation : 'not-reviewed',
    })),
  };
}

export function getNextStepModules(plan: StudyPlan): StudyModule[] {
  const available = getAvailableModules(plan);
  const completed = new Set(plan.modules.filter((module) => module.status === 'completed').map((module) => module.id));
  const moduleIds = new Set(plan.modules.map((module) => module.id));
  return plan.modules.filter((module) => available.has(module.id))
    .filter((module) => !plan.dependencies.some((dependency) =>
      dependency.target === module.id && moduleIds.has(dependency.source) && !completed.has(dependency.source),
    ));
}

export function getAvailableModules(plan: StudyPlan): Set<string> {
  const completed = new Set(plan.modules.filter((module) => module.status === 'completed').map((module) => module.id));
  const moduleIds = new Set(plan.modules.map((module) => module.id));
  return new Set(
    plan.modules
      .filter((module) => module.status !== 'completed')
      .filter((module) =>
        plan.dependencies
          .filter((dependency) => dependency.target === module.id && dependency.kind === 'required')
          .every((dependency) => !moduleIds.has(dependency.source) || completed.has(dependency.source)),
      )
      .map((module) => module.id),
  );
}

export function getModuleRequirementGroups(plan: StudyPlan, moduleId: string): RequirementGroup[] {
  return (plan.requirementGroups ?? []).filter((group) => group.moduleIds.includes(moduleId));
}

/** A module shared by groups counts only when selected in every group that claims it. */
export function isModuleCountedInPlan(plan: StudyPlan, moduleId: string): boolean {
  const groups = getModuleRequirementGroups(plan, moduleId);
  return groups.length === 0 || groups.every((group) => (group.selectedModuleIds ?? []).includes(moduleId));
}

export function isModuleVisibleInPlan(plan: StudyPlan, moduleId: string): boolean { return isModuleCountedInPlan(plan, moduleId); }

export interface RequirementGroupSummary { selectedCount: number; selectedEcts: number; optionCount: number; targetReached: boolean; state: 'complete' | 'incomplete' | 'over-limit' | 'needs-review'; message: string; }

export function getRequirementGroupSummary(plan: StudyPlan, group: RequirementGroup): RequirementGroupSummary {
  const options = plan.modules.filter((module) => group.moduleIds.includes(module.id));
  const selected = options.filter((module) => (group.selectedModuleIds ?? []).includes(module.id));
  const selectedEcts = selected.reduce((sum, module) => sum + module.ects, 0);
  const selectedCount = selected.length;
  if (group.rule === 'one-from-each') return { selectedCount, selectedEcts, optionCount: options.length, targetReached: false, state: 'needs-review', message: 'Needs review: separate choice areas are not represented in the data.' };
  if (!Number.isFinite(group.target) || group.target < 0 || options.length === 0) return { selectedCount, selectedEcts, optionCount: options.length, targetReached: false, state: 'needs-review', message: options.length === 0 ? 'No options linked yet; add or review options.' : 'Requirement target needs review.' };
  if (group.rule === 'exact-ects') {
    if (selectedEcts > group.target) return { selectedCount, selectedEcts, optionCount: options.length, targetReached: false, state: 'over-limit', message: `Over target by ${selectedEcts - group.target} ECTS.` };
    const targetReached = selectedEcts === group.target;
    return { selectedCount, selectedEcts, optionCount: options.length, targetReached, state: targetReached ? 'complete' : 'incomplete', message: targetReached ? 'ECTS target reached.' : `${group.target - selectedEcts} ECTS remaining.` };
  }
  if (group.rule === 'min-ects') { const targetReached = selectedEcts >= group.target; return { selectedCount, selectedEcts, optionCount: options.length, targetReached, state: targetReached ? 'complete' : 'incomplete', message: targetReached ? 'Minimum reached.' : `${group.target - selectedEcts} ECTS still needed.` }; }
  if (group.rule === 'max-ects') { const targetReached = selectedEcts <= group.target; return { selectedCount, selectedEcts, optionCount: options.length, targetReached, state: targetReached ? (selectedEcts === group.target ? 'complete' : 'incomplete') : 'over-limit', message: targetReached ? `${group.target - selectedEcts} ECTS available within the limit.` : `Over limit by ${selectedEcts - group.target} ECTS.` }; }
  const targetReached = selectedCount === group.target;
  const state = selectedCount > group.target ? 'over-limit' : targetReached ? 'complete' : 'incomplete';
  return { selectedCount, selectedEcts, optionCount: options.length, targetReached, state, message: state === 'complete' ? 'Required number of modules selected.' : state === 'over-limit' ? `Remove ${selectedCount - group.target} module(s) to meet the limit.` : `${group.target - selectedCount} module(s) still needed.` };
}

export function canSelectRequirementOption(plan: StudyPlan, groupId: string, moduleId: string): { allowed: boolean; reason?: string } {
  const group = (plan.requirementGroups ?? []).find((candidate) => candidate.id === groupId);
  const module = plan.modules.find((candidate) => candidate.id === moduleId);
  if (!group || !module || !group.moduleIds.includes(moduleId)) return { allowed: false, reason: 'This option is not linked to the requirement.' };
  if ((group.selectedModuleIds ?? []).includes(moduleId)) return { allowed: true };
  if (group.rule === 'one-from-each') return { allowed: false, reason: 'Needs review: separate choice areas are not represented in the imported data.' };
  const selected = plan.modules.filter((candidate) => group.moduleIds.includes(candidate.id) && (group.selectedModuleIds ?? []).includes(candidate.id));
  const selectedEcts = selected.reduce((sum, candidate) => sum + candidate.ects, 0);
  if (group.rule === 'exact-ects' && selectedEcts + module.ects > group.target) return { allowed: false, reason: `Would exceed the exact target of ${group.target} ECTS.` };
  if (group.rule === 'max-ects' && selectedEcts + module.ects > group.target) return { allowed: false, reason: `Would exceed the maximum of ${group.target} ECTS.` };
  if (group.rule === 'module-count' && selected.length + 1 > group.target) return { allowed: false, reason: `The requirement allows ${group.target} module(s).` };
  return { allowed: true };
}

export function getProgress(plan: StudyPlan) {
  const counted = plan.modules.filter((module) => isModuleCountedInPlan(plan, module.id));
  const completed = counted.filter((module) => module.status === 'completed').length;
  const totalEcts = counted.reduce((sum, module) => sum + module.ects, 0);
  const completedEcts = counted
    .filter((module) => module.result === 'passed')
    .reduce((sum, module) => sum + module.ects, 0);
  return {
    completed,
    total: counted.length,
    percent: counted.length ? Math.round((completed / counted.length) * 100) : 0,
    totalEcts,
    completedEcts,
  };
}

export function getWeightedGradeAverage(plan: StudyPlan) {
  const graded = plan.modules.filter((module) =>
    isModuleCountedInPlan(plan, module.id) &&
    module.result === 'passed' &&
    typeof module.grade === 'number' &&
    Number.isFinite(module.grade) &&
    module.grade >= 1 && module.grade <= 4 &&
    module.ects > 0,
  );
  const ects = graded.reduce((sum, module) => sum + module.ects, 0);
  const weightedSum = graded.reduce((sum, module) => sum + (module.grade ?? 0) * module.ects, 0);
  return { average: ects ? weightedSum / ects : null, ects, count: graded.length };
}
