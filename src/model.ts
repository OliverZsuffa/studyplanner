export type ModuleStatus = 'not-started' | 'in-progress' | 'completed';
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

export function migrateStudyPlan(value: StudyPlan): StudyPlan {
  return {
    ...value,
    modules: value.modules.map((module) => ({
      ...module,
      plannedSemester: typeof module.plannedSemester === 'number' ? module.plannedSemester : typeof module.semester === 'number' ? module.semester : null,
      recommendedSemester: typeof module.recommendedSemester === 'number' ? module.recommendedSemester : null,
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

export function isModuleCountedInPlan(plan: StudyPlan, moduleId: string): boolean {
  const groups = (plan.requirementGroups ?? []).filter((group) => group.moduleIds.includes(moduleId));
  return groups.length === 0 || groups.some((group) => group.selectedModuleIds?.includes(moduleId));
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
