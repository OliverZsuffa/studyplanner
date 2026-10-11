import { describe, expect, it } from 'vitest';
import { getAvailableModules, getNextStepModules, getPlannedSemester, getProgress, getWeightedGradeAverage, migrateStudyPlan, withPlannedSemester, type StudyPlan } from './model';

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
