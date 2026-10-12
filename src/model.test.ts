import { describe, expect, it } from 'vitest';
import { canSelectRequirementOption, getAvailableModules, getNextStepModules, getPlannedSemester, getRecommendedSemester, getProgress, getRequirementGroupSummary, getWeightedGradeAverage, isModuleCountedInPlan, isModuleVisibleInPlan, migrateStudyPlan, withPlannedSemester, getModulePlanningBlockReason, getSemesterPlanningCandidates, matchesSeasonFilter, getSemesterWorkloadEcts, type StudyModule, type StudyPlan } from './model';

const plan: StudyPlan = {
  name: 'Test',
  institution: 'Test data',
  modules: [
    { id: 'a', title: 'A', code: 'A', semester: 1, ects: 5, status: 'completed', result: 'passed', description: '', category: 'Core' },
    { id: 'b', title: 'B', code: 'B', semester: 2, ects: 5, status: 'not-started', description: '', category: 'Core' },
    { id: 'c', title: 'C', code: 'C', semester: 2, ects: 5, status: 'not-started', description: '', category: 'Core' },
  ],
  dependencies: [
    { id: 'ab', source: 'a', target: 'b', kind: 'required', provenance: 'official' },
    { id: 'bc', source: 'b', target: 'c', kind: 'recommended', provenance: 'user' },
  ],
};

describe('study plan calculations', () => {
  it('unlocks a module only when its required prerequisites are complete', () => {
    expect([...getAvailableModules(plan)].sort()).toEqual(['b', 'c']);
  });

  it('does not treat recommended relationships as formal blockers', () => {
    const changed = { ...plan, modules: plan.modules.map((module) => module.id === 'a' ? { ...module, status: 'not-started' as const } : module) };
    expect([...getAvailableModules(changed)].sort()).toEqual(['a', 'c']);
  });

  it('does not recommend a module while recommended preparation is incomplete', () => {
    const changed = { ...plan, modules: plan.modules.map((module) => module.id === 'a' ? { ...module, status: 'not-started' as const } : module) };
    expect(getAvailableModules(changed).has('c')).toBe(true);
    expect(getNextStepModules(changed).map((module) => module.id)).toEqual(['a']);
  });

  it('allows a module as a next step after its recommended predecessor is complete', () => {
    expect(getNextStepModules(plan).map((module) => module.id)).toEqual(['b']);
  });

  it('migrates legacy semester to planned semester without assuming it was official', () => {
    const migrated = migrateStudyPlan(plan);
    expect(getPlannedSemester(migrated.modules[0])).toBe(1);
    expect(migrated.modules[0].recommendedSemester).toBeNull();
  });

  it('moves a module in the personal plan without changing its official recommendation', () => {
    const module = { ...plan.modules[0], plannedSemester: 1, recommendedSemester: 3 };
    expect(withPlannedSemester(module, 4)).toMatchObject({ plannedSemester: 4, semester: 4, recommendedSemester: 3 });
    expect(withPlannedSemester(module, null)).toMatchObject({ plannedSemester: null, recommendedSemester: 3 });
  });

  it('calculates completion and ECTS progress', () => {
    expect(getProgress(plan)).toMatchObject({ completed: 1, total: 3, percent: 33, completedEcts: 5, totalEcts: 15 });
  });

  it('calculates an ECTS-weighted average only from passed, graded, selected modules', () => {
    const gradedPlan: StudyPlan = {
      ...plan,
      modules: [
        { ...plan.modules[0], result: 'passed', grade: 2.0 },
        { ...plan.modules[1], result: 'passed', grade: 1.7 },
        { ...plan.modules[2], result: 'passed', grade: 1.0 },
      ],
      requirementGroups: [{ id: 'elective', title: 'Elective', rule: 'min-ects', target: 5, moduleIds: ['b', 'c'], selectedModuleIds: ['b'] }],
    };
    expect(getWeightedGradeAverage(gradedPlan)).toEqual({ average: 1.85, ects: 10, count: 2 });
  });

  it('excludes failed, ungraded, out-of-range and zero-ECTS results from the average', () => {
    const gradedPlan: StudyPlan = {
      ...plan,
      modules: [
        { ...plan.modules[0], result: 'passed', grade: 2.0 },
        { ...plan.modules[1], result: 'failed', grade: 1.0 },
        { ...plan.modules[2], result: 'passed', grade: 5.0, ects: 0 },
      ],
    };
    expect(getWeightedGradeAverage(gradedPlan)).toEqual({ average: 2, ects: 5, count: 1 });
  });

  it('excludes unselected elective alternatives from progress totals', () => {
    const electivePlan: StudyPlan = {
      ...plan,
      requirementGroups: [{ id: 'elective', title: 'Elective', rule: 'min-ects', target: 5, moduleIds: ['b', 'c'], selectedModuleIds: ['b'] }],
    };
    expect(getProgress(electivePlan)).toMatchObject({ total: 2, totalEcts: 10 });
  });
});


describe('elective selection and recommendations', () => {
  const electivePlan: StudyPlan = {
    ...plan,
    modules: [
      { ...plan.modules[0], id: 'core', ects: 3 },
      { ...plan.modules[1], id: 'six-a', ects: 6, plannedSemester: 2 },
      { ...plan.modules[2], id: 'six-b', ects: 6, plannedSemester: 3 },
      { ...plan.modules[2], id: 'three', ects: 3, plannedSemester: 1 },
    ],
    dependencies: [],
    requirementGroups: [{ id: 'exact', title: 'Choose 6 ECTS', rule: 'exact-ects', target: 6, moduleIds: ['six-a', 'six-b', 'three'], selectedModuleIds: [] }],
  };

  it('defaults legacy modules to a neutral recommendation without changing progress', () => {
    const migrated = migrateStudyPlan(plan);
    expect(migrated.modules[0].recommendation).toBe('not-reviewed');
    expect(migrated.modules[0].status).toBe('completed');
    expect(migrated.modules[0].result).toBe('passed');
  });

  it('allows exactly the target ECTS and blocks an additional option that would exceed it', () => {
    const selected = { ...electivePlan, requirementGroups: [{ ...electivePlan.requirementGroups![0], selectedModuleIds: ['six-a'] }] };
    expect(canSelectRequirementOption(selected, 'exact', 'six-b')).toEqual({ allowed: false, reason: 'Would exceed the exact target of 6 ECTS.' });
    expect(canSelectRequirementOption(selected, 'exact', 'three')).toEqual({ allowed: false, reason: 'Would exceed the exact target of 6 ECTS.' });
    expect(getRequirementGroupSummary(selected, selected.requirementGroups![0])).toMatchObject({ selectedEcts: 6, targetReached: true, state: 'complete' });
  });

  it('keeps unselected elective alternatives out of plan views and ECTS', () => {
    const selected = { ...electivePlan, requirementGroups: [{ ...electivePlan.requirementGroups![0], selectedModuleIds: ['six-a'] }] };
    expect(isModuleVisibleInPlan(selected, 'six-a')).toBe(true);
    expect(isModuleVisibleInPlan(selected, 'six-b')).toBe(false);
    expect(isModuleCountedInPlan(selected, 'six-b')).toBe(false);
    expect(getProgress(selected).totalEcts).toBe(9);
  });

  it('does not count a module shared by groups until it is selected in every linked group', () => {
    const shared = { ...plan, requirementGroups: [
      { id: 'one', title: 'First', rule: 'min-ects' as const, target: 1, moduleIds: ['b'], selectedModuleIds: ['b'] },
      { id: 'two', title: 'Second', rule: 'min-ects' as const, target: 1, moduleIds: ['b'], selectedModuleIds: [] },
    ] };
    expect(isModuleCountedInPlan(shared, 'b')).toBe(false);
    const both = { ...shared, requirementGroups: shared.requirementGroups!.map((group) => ({ ...group, selectedModuleIds: ['b'] })) };
    expect(isModuleCountedInPlan(both, 'b')).toBe(true);
    expect(getProgress(both).totalEcts).toBe(15);
  });

  it('flags one-from-each when the current schema cannot express its subgroups', () => {
    const group = { id: 'areas', title: 'Areas', rule: 'one-from-each' as const, target: 2, moduleIds: ['b', 'c'], selectedModuleIds: ['b'] };
    expect(getRequirementGroupSummary(plan, group).state).toBe('needs-review');
    expect(canSelectRequirementOption({ ...plan, requirementGroups: [group] }, 'areas', 'c').allowed).toBe(false);
  });

  it('keeps recommendation separate from status and semester fields', () => {
    const original = migrateStudyPlan(plan).modules[0];
    const recommended = { ...original, recommendation: 'strongly-recommended' as const };
    expect(recommended).toMatchObject({ recommendation: 'strongly-recommended', status: 'completed', plannedSemester: 1 });
  });
});


describe('editable recommended semester', () => {
  it('uses the user recommendation while preserving the official source semester', () => {
    const module: StudyModule = { ...plan.modules[0], recommendedSemester: 3, suggestedSemester: 1 };
    expect(getRecommendedSemester(module)).toBe(1);
    expect(module.recommendedSemester).toBe(3);
  });

  it('allows a user to explicitly clear an official recommendation for bulk planning', () => {
    const module: StudyModule = { ...plan.modules[0], recommendedSemester: 3, suggestedSemester: null };
    expect(getRecommendedSemester(module)).toBeNull();
  });
});

describe('prior-study credit and seasonal semester planning', () => {
  it('counts prior-study courses in degree and completed ECTS, but not semester workload', () => {
    const prior = { ...plan.modules[0], id: 'prior', status: 'completed' as const, result: undefined, completedThroughPriorStudy: true, ects: 12, plannedSemester: 1 };
    const remaining = { ...plan.modules[1], id: 'remaining', status: 'not-started' as const, result: undefined, ects: 38, plannedSemester: 1 };
    const studyPlan: StudyPlan = { ...plan, modules: [prior, remaining], dependencies: [] };
    expect(getProgress(studyPlan)).toMatchObject({ completed: 1, total: 2, totalEcts: 50, completedEcts: 12 });
    expect(getSemesterWorkloadEcts(studyPlan.modules)).toBe(38);
  });

  it('migrates prior-study completion safely and clears it for incomplete modules', () => {
    const legacy = migrateStudyPlan({ ...plan, modules: [
      { ...plan.modules[0], completedThroughPriorStudy: true, status: 'not-started' },
      { ...plan.modules[1], completedThroughPriorStudy: true, status: 'completed' },
    ] });
    expect(legacy.modules[0].completedThroughPriorStudy).toBe(false);
    expect(legacy.modules[1].completedThroughPriorStudy).toBe(true);
  });

  it('filters courses by their explicit seasonal availability', () => {
    expect(matchesSeasonFilter({ ...plan.modules[0], availability: 'winter' }, 'winter')).toBe(true);
    expect(matchesSeasonFilter({ ...plan.modules[0], availability: 'winter' }, 'summer')).toBe(false);
    expect(matchesSeasonFilter({ ...plan.modules[0], availability: 'both' }, 'summer')).toBe(true);
  });

  it('blocks seasonal assignments when the target term is incompatible', () => {
    const winterOnly = { ...plan.modules[1], availability: 'winter' as const, status: 'not-started' as const };
    const studyPlan: StudyPlan = { ...plan, startingTerm: { season: 'winter', year: 2026 }, modules: [plan.modules[0], winterOnly], dependencies: [] };
    expect(getModulePlanningBlockReason(studyPlan, winterOnly, 2)).toContain('summer semester');
    expect(getModulePlanningBlockReason(studyPlan, winterOnly, 1)).toBeNull();
  });

  it('blocks courses whose required predecessor is not completed or planned earlier', () => {
    const studyPlan: StudyPlan = { ...plan, modules: plan.modules.map(module => module.id === 'a' ? { ...module, status: 'not-started' as const, plannedSemester: null, semester: undefined } : module) };
    expect(getModulePlanningBlockReason(studyPlan, studyPlan.modules[1], 2)).toContain('A must be completed in an earlier semester');
  });

  it('assumes a required predecessor planned in an earlier semester will be completed', () => {
    const studyPlan: StudyPlan = {
      ...plan,
      startingTerm: { season: 'winter', year: 2026 },
      modules: [
        { ...plan.modules[0], id: 'foundation', status: 'not-started', plannedSemester: 1, semester: 1, availability: 'winter' },
        { ...plan.modules[1], id: 'follow-up', status: 'not-started', plannedSemester: null, semester: undefined, availability: 'summer' },
      ],
      dependencies: [{ id: 'foundation-follow-up', source: 'foundation', target: 'follow-up', kind: 'required', provenance: 'official' }],
    };
    expect(getModulePlanningBlockReason(studyPlan, studyPlan.modules[1], 2)).toBeNull();
    expect(studyPlan.modules[0].status).toBe('not-started');
  });

  it('only includes unplanned courses by default and can opt into courses assigned elsewhere', () => {
    const studyPlan: StudyPlan = {
      ...plan,
      modules: [
        { ...plan.modules[0], id: 'unplanned', status: 'not-started', plannedSemester: null, semester: undefined },
        { ...plan.modules[1], id: 'already-planned', status: 'not-started', plannedSemester: 3, semester: 3 },
        { ...plan.modules[2], id: 'already-target', status: 'not-started', plannedSemester: 2, semester: 2 },
      ],
      dependencies: [],
    };
    expect(getSemesterPlanningCandidates(studyPlan, 2).map(item => item.module.id)).toEqual(['unplanned']);
    expect(getSemesterPlanningCandidates(studyPlan, 2, true).map(item => item.module.id).sort()).toEqual(['already-planned', 'unplanned']);
    expect(getSemesterPlanningCandidates(studyPlan, 2, true).find(item => item.module.id === 'already-planned')).toMatchObject({ currentSemester: 3, reason: null });
  });

  it('flags replanning a prerequisite into the same semester as its dependent', () => {
    const studyPlan: StudyPlan = {
      ...plan,
      modules: [
        { ...plan.modules[0], id: 'foundation', title: 'Foundation', status: 'not-started', plannedSemester: 3, semester: 3 },
        { ...plan.modules[1], id: 'follow-up', title: 'Follow-up', status: 'not-started', plannedSemester: 2, semester: 2 },
      ],
      dependencies: [{ id: 'foundation-follow-up', source: 'foundation', target: 'follow-up', kind: 'required', provenance: 'official' }],
    };
    const candidate = getSemesterPlanningCandidates(studyPlan, 2, true).find(item => item.module.id === 'foundation');
    expect(candidate?.currentSemester).toBe(3);
    expect(candidate?.reason).toContain('prerequisite of Follow-up');
    expect(getPlannedSemester(studyPlan.modules[0])).toBe(3);
  });

  it('does not treat recommended links as formal blockers when assigning a semester', () => {
    const studyPlan: StudyPlan = {
      ...plan,
      modules: [
        { ...plan.modules[0], id: 'optional-prep', status: 'not-started', plannedSemester: null, semester: undefined },
        { ...plan.modules[1], id: 'course', status: 'not-started', plannedSemester: null, semester: undefined },
      ],
      dependencies: [{ id: 'advice', source: 'optional-prep', target: 'course', kind: 'recommended', provenance: 'user' }],
    };
    expect(getModulePlanningBlockReason(studyPlan, studyPlan.modules[1], 1)).toBeNull();
  });
});
