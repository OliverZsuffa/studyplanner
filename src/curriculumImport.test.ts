import { describe, expect, it } from 'vitest';
import { makeCurriculumExtractionPrompt, makePrerequisitePrompt, parseAiCurriculum, parseAiRelationships, parseCurriculumText, toDependency } from './curriculumImport';
import type { StudyModule } from './model';

const modules: StudyModule[] = [
  { id: 'a', title: 'Algorithms', code: 'CS101', semester: 1, ects: 5, status: 'not-started', description: 'Data structures', category: 'CS' },
  { id: 'b', title: 'Databases', code: 'CS201', semester: 2, ects: 5, status: 'not-started', description: 'Relational databases', category: 'CS' },
];

describe('curriculum text parser', () => {
  it('extracts module title, code and ECTS without inventing the semester', () => {
    const result = parseCurriculumText('CS101 Algorithms and Data Structures — 6 ECTS\nCS201 Database Systems 5 ECTS');
    expect(result.modules).toHaveLength(2);
    expect(result.modules[0]).toMatchObject({ code: 'CS101', title: 'Algorithms and Data Structures', ects: 6, plannedSemester: null, recommendedSemester: null });
    expect(result.modules[1]).toMatchObject({ code: 'CS201', title: 'Database Systems', ects: 5 });
  });

  it('does not assign a semester when local parsing cannot identify one', () => {
    const result = parseCurriculumText('CS101 Algorithms 5 ECTS');
    expect(result.modules[0].plannedSemester).toBeNull();
    expect(result.modules[0].recommendedSemester).toBeNull();
  });

  it('flags text when no confident ECTS-based module line is found', () => {
    const result = parseCurriculumText('Bachelor of Science\nGeneral information only');
    expect(result.modules).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('avoids duplicate module candidates', () => {
    const result = parseCurriculumText('CS101 Algorithms 5 ECTS\nCS101 Algorithms 5 ECTS');
    expect(result.modules).toHaveLength(1);
  });
});

describe('AI curriculum extraction validation', () => {
  it('accepts official semester, ECTS and source evidence while preserving unknown fields', () => {
    const result = parseAiCurriculum(JSON.stringify({
      schema: 'studyplanner-curriculum/v1',
      programme: 'Test degree',
      institution: 'Test university',
      modules: [
        { code: 'CS101', title: 'Algorithms', ects: 6, recommendedSemester: 1, sourceEvidence: 'Semester 1', sourceLocation: 'Table 1' },
        { code: null, title: 'Unknown course', ects: null, recommendedSemester: null },
      ],
      requirementGroups: [],
      warnings: [],
    }));
    expect(result.errors).toEqual([]);
    expect(result.draft?.modules[0]).toMatchObject({ code: 'CS101', ects: 6, recommendedSemester: 1, sourceEvidence: 'Semester 1' });
    expect(result.draft?.modules[1]).toMatchObject({ code: null, ects: null, recommendedSemester: null });
  });

  it('rejects invalid semesters and malformed module data', () => {
    const result = parseAiCurriculum(JSON.stringify({
      schema: 'studyplanner-curriculum/v1',
      modules: [{ title: 'Bad semester', ects: 5, recommendedSemester: 0 }],
      requirementGroups: [],
    }));
    expect(result.draft).toBeNull();
    expect(result.errors.join(' ')).toContain('recommendedSemester');
  });

  it('validates choice groups and retains only known module codes', () => {
    const result = parseAiCurriculum(JSON.stringify({
      schema: 'studyplanner-curriculum/v1',
      modules: [{ code: 'A', title: 'Course A', ects: 5, recommendedSemester: 1 }],
      requirementGroups: [{ title: 'Electives', rule: 'min-ects', target: 5, moduleCodes: ['A', 'MISSING'] }],
    }));
    expect(result.draft?.requirementGroups[0].moduleCodes).toEqual(['A']);
    expect(result.errors[0]).toContain('unknown module codes');
  });

  it('generates a concise provider-neutral prompt that preserves requirements without known options', () => {
    const prompt = makeCurriculumExtractionPrompt();
    expect(prompt).toContain('studyplanner-curriculum/v1');
    expect(prompt).toContain('otherwise null');
    expect(prompt).toContain('Listing alternatives does not make all of them compulsory');
    expect(prompt).toContain('Always create a requirementGroups entry');
    expect(prompt).toContain('empty moduleCodes array');
    expect(prompt).toContain('Keep distinct or nested elective areas separate');
    expect(prompt).toContain('does not make all of them compulsory');
  });

  it('preserves an explicit elective requirement when its option list is empty', () => {
    const result = parseAiCurriculum(JSON.stringify({
      schema: 'studyplanner-curriculum/v1',
      modules: [{ code: 'STAT101', title: 'Statistics', ects: 5, recommendedSemester: null }],
      requirementGroups: [{ title: 'Statistics elective', rule: 'min-ects', target: 5, moduleCodes: [], sourceNote: 'Options are listed in a separate catalogue.' }],
      warnings: [],
    }));
    expect(result.errors).toEqual([]);
    expect(result.draft?.requirementGroups).toEqual([{
      title: 'Statistics elective',
      rule: 'min-ects',
      target: 5,
      moduleCodes: [],
      selectedCodes: [],
      sourceNote: 'Options are listed in a separate catalogue.',
    }]);
  });

  it('keeps distinct elective requirement groups separate', () => {
    const result = parseAiCurriculum(JSON.stringify({
      schema: 'studyplanner-curriculum/v1',
      modules: [{ code: 'STAT101', title: 'Statistics', ects: 5 }, { code: 'ECON101', title: 'Economics elective', ects: 5 }],
      requirementGroups: [
        { title: 'Statistics elective', rule: 'min-ects', target: 5, moduleCodes: ['STAT101'] },
        { title: 'Economics elective', rule: 'min-ects', target: 5, moduleCodes: ['ECON101'] },
      ],
      warnings: [],
    }));
    expect(result.draft?.requirementGroups.map((group) => group.title)).toEqual(['Statistics elective', 'Economics elective']);
  });
});

describe('AI prerequisite response validation', () => {
  it('accepts a valid relationship and maps it to a non-silent AI suggestion', () => {
    const result = parseAiRelationships(JSON.stringify({
      schema: 'studyplanner-prerequisites/v1',
      relationships: [{ source: 'a', target: 'b', kind: 'formal', rationale: 'Official requirement', evidence: 'Must pass CS101.' }],
    }), modules);
    expect(result.errors).toEqual([]);
    expect(result.relationships).toHaveLength(1);
    expect(toDependency(result.relationships[0])).toMatchObject({ kind: 'required', provenance: 'ai-suggested', relationshipConfidence: 'formal' });
  });

  it('rejects unknown module IDs and self-dependencies', () => {
    const result = parseAiRelationships(JSON.stringify({
      schema: 'studyplanner-prerequisites/v1',
      relationships: [
        { source: 'missing', target: 'b', kind: 'recommended', rationale: 'Unknown source' },
        { source: 'a', target: 'a', kind: 'recommended', rationale: 'Self reference' },
      ],
    }), modules);
    expect(result.relationships).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects formal prerequisite claims without evidence', () => {
    const result = parseAiRelationships(JSON.stringify({
      schema: 'studyplanner-prerequisites/v1',
      relationships: [{ source: 'a', target: 'b', kind: 'formal', rationale: 'Probably required' }],
    }), modules);
    expect(result.relationships).toHaveLength(0);
    expect(result.errors[0]).toContain('needs evidence');
  });

  it('rejects malformed or unexpected JSON schema', () => {
    expect(parseAiRelationships('not json', modules).errors.length).toBeGreaterThan(0);
    expect(parseAiRelationships('{"relationships":[]}', modules).errors[0]).toContain('Expected schema');
  });

  it('generates a prompt that distinguishes official prerequisites from recommendations', () => {
    const prompt = makePrerequisitePrompt({ name: 'Test degree', institution: 'Test university', modules, requirementGroups: [] });
    expect(prompt).toContain('A plausible academic progression is NOT a formal prerequisite');
    expect(prompt).toContain('studyplanner-prerequisites/v1');
    expect(prompt).toContain('"id": "a"');
  });
});
