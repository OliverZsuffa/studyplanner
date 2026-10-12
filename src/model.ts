export type ModuleStatus = 'not-started' | 'in-progress' | 'completed';
export type ModuleRecommendation = 'not-reviewed' | 'recommended' | 'strongly-recommended';
export type DependencyKind = 'required' | 'recommended';
export type RequirementRule = 'min-ects' | 'max-ects' | 'exact-ects' | 'module-count' | 'one-from-each';
export type CourseAvailability = 'winter' | 'summer' | 'both';
export type StudyTerm = { season: 'winter' | 'summer'; year: number };
export type CourseComponentType = 'Lecture' | 'Tutorial' | 'Exercise class' | 'Practical / lab' | 'Seminar' | 'Project' | 'Other';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface TimeSlotAlternative { id: string; weekday: Weekday; startTime: string; endTime: string; location: string; online: boolean; }
export interface CourseComponent { id: string; type: CourseComponentType; name: string; startDate: string; endDate: string; alternatives: TimeSlotAlternative[]; selectedAlternativeId?: string; }
export interface CourseExam { id: string; label: string; date: string; location: string; }

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
  /** User's editable planning recommendation. When set, it overrides the official recommendation for bulk planning. */
  suggestedSemester?: number | null;
  sourceEvidence?: string;
  sourceLocation?: string;
  ects: number;
  status: ModuleStatus;
  /** Completed before this degree plan began; counts toward degree completion but not planned-semester workload. */
  completedThroughPriorStudy?: boolean;
  /** Guidance only; independent from progress and semester planning. */
  recommendation?: ModuleRecommendation;
  description: string;
  category: string;
  grade?: number;
  result?: 'passed' | 'failed';
  availability?: CourseAvailability;
  components?: CourseComponent[];
  exams?: CourseExam[];
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
  /** Starting calendar term for semester labels only; never infers teaching dates. */
  startingTerm?: StudyTerm | null;
}

export const statusLabels: Record<ModuleStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
};

export function getRecommendedSemester(module: StudyModule): number | null {
  return module.suggestedSemester !== undefined ? module.suggestedSemester : (module.recommendedSemester ?? null);
}

export function getPlannedSemester(module: StudyModule): number | null {
  return typeof module.plannedSemester === 'number' ? module.plannedSemester : typeof module.semester === 'number' ? module.semester : null;
}

export function withPlannedSemester(module: StudyModule, semester: number | null): StudyModule {
  return { ...module, semester: semester ?? undefined, plannedSemester: semester };
}

export function migrateStudyPlan(value: StudyPlan): StudyPlan {
  return {
    ...value,
    startingTerm: value.startingTerm ?? null,
    modules: value.modules.map((module) => ({
      ...module,
      plannedSemester: typeof module.plannedSemester === 'number' ? module.plannedSemester : typeof module.semester === 'number' ? module.semester : null,
      recommendedSemester: typeof module.recommendedSemester === 'number' ? module.recommendedSemester : null,
      completedThroughPriorStudy: module.status === 'completed' && module.completedThroughPriorStudy === true,
      recommendation: module.recommendation === 'recommended' || module.recommendation === 'strongly-recommended' ? module.recommendation : 'not-reviewed',
      availability: module.availability === 'winter' || module.availability === 'summer' ? module.availability : 'both',
      components: Array.isArray(module.components) ? module.components : [],
      exams: Array.isArray(module.exams) ? module.exams : [],
    })),
  };
}

export function getTermForSemester(start: StudyTerm | null | undefined, semester: number): StudyTerm | null {
  if (!start || !Number.isInteger(semester) || semester < 1 || !Number.isInteger(start.year) || start.year < 1900) return null;
  const index = (start.season === 'winter' ? 0 : 1) + semester - 1;
  return { season: index % 2 === 0 ? 'winter' : 'summer', year: start.year + Math.floor(((start.season === 'winter' ? 1 : 0) + semester - 1) / 2) };
}
export function getTermLabel(term: StudyTerm | null): string {
  if (!term) return 'Starting term not set';
  return term.season === 'winter' ? `Winter semester ${term.year}/${String(term.year + 1).slice(-2)}` : `Summer semester ${term.year}`;
}
export function availabilityConflict(module: StudyModule, term: StudyTerm | null): string | null {
  if (!term || !module.availability || module.availability === 'both' || module.availability === term.season) return null;
  return `${module.title} is offered only in the ${module.availability} semester, but this is the ${term.season} semester. This placement is impossible.`;
}
function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number); const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
export function validTimeRange(start: string, end: string): boolean {
  const minutes = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1;
  return minutes(start) >= 0 && minutes(end) > minutes(start);
}
export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a = dateOnly(aStart), b = dateOnly(aEnd), c = dateOnly(bStart), d = dateOnly(bEnd);
  return !!a && !!b && !!c && !!d && a <= d && c <= b;
}
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const minutes = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
  return minutes(aStart) < minutes(bEnd) && minutes(bStart) < minutes(aEnd);
}
export function dateRangesShareWeekday(aStart: string, aEnd: string, bStart: string, bEnd: string, weekday: Weekday): boolean {
  const a = dateOnly(aStart), b = dateOnly(aEnd), c = dateOnly(bStart), d = dateOnly(bEnd);
  if (!a || !b || !c || !d) return false;
  const start = a > c ? a : c;
  const end = b < d ? b : d;
  if (start > end) return false;
  const candidate = new Date(start);
  candidate.setDate(candidate.getDate() + ((weekday - candidate.getDay() + 7) % 7));
  return candidate <= end;
}
export function findScheduleConflict(plan: StudyPlan, semester: number, moduleId: string, componentId: string, alternativeId: string): { module: StudyModule; component: CourseComponent; slot: TimeSlotAlternative } | null {
  const targetModule = plan.modules.find(m => m.id === moduleId);
  const targetComponent = targetModule?.components?.find(c => c.id === componentId);
  const targetSlot = targetComponent?.alternatives.find(s => s.id === alternativeId);
  if (!targetModule || !targetComponent || !targetSlot || !targetComponent.startDate || !targetComponent.endDate || !validTimeRange(targetSlot.startTime, targetSlot.endTime)) return null;
  for (const module of plan.modules) {
    if (getPlannedSemester(module) !== semester) continue;
    for (const component of module.components ?? []) {
      const selectedId = module.id === moduleId && component.id === componentId ? alternativeId : component.selectedAlternativeId;
      if (!selectedId || (module.id === moduleId && component.id === componentId)) continue;
      const slot = component.alternatives.find(s => s.id === selectedId);
      if (!slot || slot.weekday !== targetSlot.weekday || !component.startDate || !component.endDate) continue;
      if (dateRangesShareWeekday(targetComponent.startDate, targetComponent.endDate, component.startDate, component.endDate, targetSlot.weekday) && timesOverlap(targetSlot.startTime, targetSlot.endTime, slot.startTime, slot.endTime)) return { module, component, slot };
    }
  }
  return null;
}
export interface CalendarEvent { id: string; date: string; title: string; subtitle: string; location: string; startTime?: string; endTime?: string; kind: 'teaching' | 'teaching-start' | 'teaching-end' | 'exam'; moduleId: string; }
export function getCalendarEvents(plan: StudyPlan): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const module of plan.modules) {
    for (const exam of module.exams ?? []) if (dateOnly(exam.date)) events.push({ id: exam.id, date: exam.date, title: exam.label || `${module.title} exam`, subtitle: module.title + ' · Exam', location: exam.location, kind: 'exam', moduleId: module.id });
    for (const component of module.components ?? []) {
      const slot = component.alternatives.find(s => s.id === component.selectedAlternativeId);
      const start = dateOnly(component.startDate), end = dateOnly(component.endDate);
      if (!start || !end || start > end) continue;
      const startText = component.startDate;
      const endText = component.endDate;
      events.push({ id: component.id + '-period-start', date: startText, title: module.title, subtitle: (component.name || component.type) + ' starts', location: '', kind: 'teaching-start', moduleId: module.id });
      if (endText !== startText) events.push({ id: component.id + '-period-end', date: endText, title: module.title, subtitle: (component.name || component.type) + ' ends', location: '', kind: 'teaching-end', moduleId: module.id });
      if (!slot || !validTimeRange(slot.startTime, slot.endTime)) continue;
      const cursor = new Date(start);
      while (cursor <= end) {
        if (cursor.getDay() === slot.weekday) events.push({ id: component.id + '-' + cursor.getFullYear() + '-' + (cursor.getMonth()+1) + '-' + cursor.getDate(), date: cursor.getFullYear() + '-' + String(cursor.getMonth()+1).padStart(2,'0') + '-' + String(cursor.getDate()).padStart(2,'0'), title: module.title, subtitle: component.name || component.type, location: slot.location, startTime: slot.startTime, endTime: slot.endTime, kind: 'teaching', moduleId: module.id });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }
  return events.sort((a,b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
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
    .filter((module) => module.result === 'passed' || module.completedThroughPriorStudy === true)
    .reduce((sum, module) => sum + module.ects, 0);
  return {
    completed,
    total: counted.length,
    percent: counted.length ? Math.round((completed / counted.length) * 100) : 0,
    totalEcts,
    completedEcts,
  };
}


/** Explain why a course cannot be newly assigned to the requested semester. */
export function getModulePlanningBlockReason(plan: StudyPlan, module: StudyModule, semester: number): string | null {
  if (module.status === 'completed') return 'Already completed';
  const term = getTermForSemester(plan.startingTerm, semester);
  if (module.availability && module.availability !== 'both' && !term) return 'Set the starting semester and year to verify seasonal availability';
  const conflict = availabilityConflict(module, term);
  if (conflict) return conflict;
  const byId = new Map(plan.modules.map((item) => [item.id, item]));
  const unmet = plan.dependencies.find((dependency) => {
    if (dependency.kind !== 'required' || dependency.target !== module.id) return false;
    const predecessor = byId.get(dependency.source);
    if (!predecessor || predecessor.status === 'completed') return false;
    const predecessorSemester = getPlannedSemester(predecessor);
    // Earlier planned semesters are assumed passed for planning only. Actual progress is unchanged.
    return predecessorSemester === null || predecessorSemester >= semester;
  });
  if (unmet) return `${byId.get(unmet.source)?.title ?? 'A prerequisite'} must be completed in an earlier semester`;
  return null;
}

/** Build semester-planning candidates, optionally including courses already assigned elsewhere. */
export function getSemesterPlanningCandidates(plan: StudyPlan, semester: number, includeAssignedCourses = false): { module: StudyModule; currentSemester: number | null; reason: string | null }[] {
  return plan.modules
    .filter(module => isModuleVisibleInPlan(plan, module.id) && (getPlannedSemester(module) === null || (includeAssignedCourses && getPlannedSemester(module) !== semester)))
    .map(module => {
      const currentSemester = getPlannedSemester(module);
      let reason = getModulePlanningBlockReason(plan, module, semester);
      if (!reason) {
        for (const dependency of plan.dependencies) {
          if (dependency.kind !== 'required' || dependency.source !== module.id) continue;
          const dependent = plan.modules.find(item => item.id === dependency.target);
          const dependentSemester = dependent ? getPlannedSemester(dependent) : null;
          if (dependent && dependent.status !== 'completed' && dependentSemester !== null && dependentSemester <= semester) {
            reason = `${module.title} cannot be moved to S${semester}: it is a prerequisite of ${dependent.title}, which is planned in S${dependentSemester}.`;
            break;
          }
        }
      }
      return { module, currentSemester, reason };
    })
    .sort((a, b) => Number(a.reason !== null) - Number(b.reason !== null) || a.module.title.localeCompare(b.module.title));
}

/** A module can be offered in the selected season, or in both seasons. */
export function matchesSeasonFilter(module: StudyModule, season: 'winter' | 'summer' | 'all'): boolean {
  return season === 'all' || !module.availability || module.availability === 'both' || module.availability === season;
}

/** Count the ECTS that remain to be completed within a planned semester. */
export function getSemesterWorkloadEcts(modules: StudyModule[]): number {
  return modules.filter((module) => module.completedThroughPriorStudy !== true).reduce((sum, module) => sum + module.ects, 0);
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
