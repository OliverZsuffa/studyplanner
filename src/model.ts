export type ModuleStatus = 'not-started' | 'in-progress' | 'completed';
export type DependencyKind = 'required' | 'recommended';
export type RequirementRule = 'min-ects' | 'max-ects' | 'exact-ects' | 'module-count' | 'one-from-each';

export interface RequirementGroup {
  id: string;
  title: string;
  rule: RequirementRule;
  target: number;
  moduleIds: string[];
  sourceNote?: string;
}

export interface StudyModule {
  id: string;
  title: string;
  code: string;
  semester: number;
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

export function getProgress(plan: StudyPlan) {
  const completed = plan.modules.filter((module) => module.status === 'completed').length;
  const totalEcts = plan.modules.reduce((sum, module) => sum + module.ects, 0);
  const completedEcts = plan.modules
    .filter((module) => module.result === 'passed')
    .reduce((sum, module) => sum + module.ects, 0);
  return {
    completed,
    total: plan.modules.length,
    percent: plan.modules.length ? Math.round((completed / plan.modules.length) * 100) : 0,
    totalEcts,
    completedEcts,
  };
}
