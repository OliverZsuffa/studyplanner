import { describe, expect, it } from 'vitest';
import { getAvailableModules, getNextStepModules, getPlannedSemester, getProgress, migrateStudyPlan, type StudyPlan } from './model';

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

  it('calculates completion and ECTS progress', () => {
    expect(getProgress(plan)).toMatchObject({ completed: 1, total: 3, percent: 33, completedEcts: 5, totalEcts: 15 });
  });
});
