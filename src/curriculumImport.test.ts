import { describe, expect, it } from 'vitest';
import { makePrerequisitePrompt, parseAiRelationships, parseCurriculumText, toDependency } from './curriculumImport';
import type { StudyModule } from './model';

const modules: StudyModule[] = [
  { id: 'a', title: 'Algorithms', code: 'CS101', semester: 1, ects: 5, status: 'not-started', description: 'Data structures', category: 'CS' },
  { id: 'b', title: 'Databases', code: 'CS201', semester: 2, ects: 5, status: 'not-started', description: 'Relational databases', category: 'CS' },
];

describe('curriculum text parser', () => {
  it('extracts module title, code and ECTS without inventing the semester', () => {
    const result = parseCurriculumText('CS101 Algorithms and Data Structures — 6 ECTS\nCS201 Database Systems 5 ECTS');
    expect(result.modules).toHaveLength(2);
    expect(result.modules[0]).toMatchObject({ code: 'CS101', title: 'Algorithms and Data Structures', ects: 6, semester: 1 });
    expect(result.modules[1]).toMatchObject({ code: 'CS201', title: 'Database Systems', ects: 5 });
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
