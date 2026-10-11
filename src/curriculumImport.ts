import type { Dependency, RequirementGroup, StudyModule, StudyPlan } from './model';

export type ParseWarning = { line: number; text: string; reason: string };
export type ParsedCurriculum = { modules: StudyModule[]; warnings: ParseWarning[] };

const ECTS_PATTERN = /(?:\b(\d{1,2}(?:[.,]\d+)?)\s*(?:ECTS(?:-Punkte|\s*credits?)?|Leistungspunkte|LP)\b|\bECTS\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?))/i;
const CODE_PATTERN = /^([A-ZÄÖÜ][A-ZÄÖÜ0-9._/-]{1,24})\s{1,}(.*)$/;

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'module';
}

export function parseCurriculumText(text: string): ParsedCurriculum {
  const modules: StudyModule[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index].replace(/\s+/g, ' ').trim();
    if (!original || original.length < 5 || original.length > 300) continue;
    const ectsMatch = original.match(ECTS_PATTERN);
    if (!ectsMatch) continue;
    const ectsValue = Number((ectsMatch[1] ?? ectsMatch[2] ?? '').replace(',', '.'));
    if (!Number.isFinite(ectsValue) || ectsValue <= 0 || ectsValue > 60) {
      warnings.push({ line: index + 1, text: original, reason: 'ECTS value is outside the expected range.' });
      continue;
    }
    let before = original.slice(0, ectsMatch.index).replace(/[|;,:–—-]+\s*$/, '').trim();
    before = before.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim();
    const codeMatch = before.match(CODE_PATTERN);
    const code = codeMatch ? codeMatch[1] : '';
    let title = (codeMatch ? codeMatch[2] : before).replace(/\s*[([](?:Pflicht|Wahlpflicht|elective|compulsory).*$/i, '').trim();
    title = title.replace(/^[:|–—-]+\s*/, '').trim();
    if (title.length < 3 || /^(ects|credits|leistungspunkte)$/i.test(title)) {
      warnings.push({ line: index + 1, text: original, reason: 'Could not confidently identify a module title.' });
      continue;
    }
    const key = (code || title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    modules.push({
      id: `import-${slug(code || title)}-${index + 1}`,
      title,
      code,
      plannedSemester: null,
      recommendedSemester: null,
      ects: ectsValue,
      status: 'not-started',
      description: '',
      category: 'Unclassified',
    });
  }
  if (modules.length === 0 && text.trim()) {
    warnings.push({ line: 1, text: text.trim().slice(0, 180), reason: 'No clear module lines with ECTS were found. Add modules manually or try copying a table as text.' });
  }
  return { modules, warnings };
}

export type AiRelationship = {
  source: string;
  target: string;
  kind: 'formal' | 'recommended' | 'uncertain';
  rationale: string;
  evidence?: string;
  url?: string;
};

export function makePrerequisitePrompt(plan: Pick<StudyPlan, 'name' | 'institution' | 'modules' | 'requirementGroups'>): string {
  const curriculum = {
    programme: plan.name,
    institution: plan.institution,
    modules: plan.modules.map(({ id, title, code, semester, ects, description, category }) => ({ id, title, code, semester, ects, description, category })),
    requirementGroups: plan.requirementGroups ?? [],
  };
  return `You are analysing a university curriculum to help a student plan their studies. Analyse only the modules provided below; do not invent modules or module IDs.

TASK
1. Identify formal prerequisites only when supported by explicit official evidence (e.g. examination regulations or an official module handbook). A plausible academic progression is NOT a formal prerequisite.
2. Suggest useful prior knowledge separately, based on module descriptions, learning outcomes, and credible official sources if browsing is available.
3. Use "uncertain" for a plausible relationship that lacks enough evidence. Prefer no relationship over an invented one.
4. For every relationship, explain the rationale briefly. For formal prerequisites, include a precise quotation or reference and an official source URL whenever available. If evidence is missing, do not label it formal.
5. Relationships are directed: source is the earlier/prerequisite module; target is the later module.
6. Do not create cycles. Avoid redundant relationships where possible.
7. Return ONLY valid JSON, with no Markdown fences or prose, matching this schema exactly:
{
  "schema": "studyplanner-prerequisites/v1",
  "relationships": [
    {
      "source": "EXACT MODULE ID",
      "target": "EXACT MODULE ID",
      "kind": "formal | recommended | uncertain",
      "rationale": "Short explanation",
      "evidence": "Quote or explanation of evidence, optional",
      "url": "Official source URL, optional"
    }
  ]
}
Use the exact module IDs from the input. Do not claim that you verified sources you did not access. If you cannot establish any relationships, return an empty relationships array.

CURRICULUM JSON
${JSON.stringify(curriculum, null, 2)}`;
}

export function parseAiRelationships(raw: string, modules: StudyModule[]): { relationships: AiRelationship[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { relationships: [], errors: ['This is not valid JSON. Ask the AI to return only the JSON object, without commentary.'] };
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { schema?: unknown }).schema !== 'studyplanner-prerequisites/v1' || !Array.isArray((parsed as { relationships?: unknown }).relationships)) {
    return { relationships: [], errors: ['Expected schema "studyplanner-prerequisites/v1" and a relationships array.'] };
  }
  const moduleIds = new Set(modules.map((module) => module.id));
  const relationships: AiRelationship[] = [];
  const seen = new Set<string>();
  for (const [index, item] of (parsed as { relationships: unknown[] }).relationships.entries()) {
    if (!item || typeof item !== 'object') { errors.push(`Relationship ${index + 1}: not an object.`); continue; }
    const row = item as Record<string, unknown>;
    if (typeof row.source !== 'string' || typeof row.target !== 'string' || !moduleIds.has(row.source) || !moduleIds.has(row.target)) {
      errors.push(`Relationship ${index + 1}: source or target is not a known module ID.`); continue;
    }
    if (row.source === row.target) { errors.push(`Relationship ${index + 1}: a module cannot depend on itself.`); continue; }
    if (!['formal', 'recommended', 'uncertain'].includes(String(row.kind))) { errors.push(`Relationship ${index + 1}: unknown relationship kind.`); continue; }
    if (typeof row.rationale !== 'string' || !row.rationale.trim()) { errors.push(`Relationship ${index + 1}: missing rationale.`); continue; }
    if (row.kind === 'formal' && !(typeof row.evidence === 'string' && row.evidence.trim()) && !(typeof row.url === 'string' && /^https?:\/\//i.test(row.url))) { errors.push(`Relationship ${index + 1}: a formal prerequisite needs evidence or an official source URL.`); continue; }
    const key = `${row.source}->${row.target}`;
    if (seen.has(key)) { errors.push(`Relationship ${index + 1}: duplicate relationship ignored.`); continue; }
    seen.add(key);
    relationships.push({
      source: row.source,
      target: row.target,
      kind: row.kind as AiRelationship['kind'],
      rationale: row.rationale.trim().slice(0, 1000),
      ...(typeof row.evidence === 'string' ? { evidence: row.evidence.slice(0, 1500) } : {}),
      ...(typeof row.url === 'string' && /^https?:\/\//i.test(row.url) ? { url: row.url.slice(0, 1000) } : {}),
    });
  }
  return { relationships, errors };
}

export function toDependency(relationship: AiRelationship): Dependency {
  return {
    id: `ai-${relationship.source}-${relationship.target}`,
    source: relationship.source,
    target: relationship.target,
    kind: relationship.kind === 'formal' ? 'required' : 'recommended',
    provenance: 'ai-suggested',
    note: [relationship.rationale, relationship.evidence, relationship.url].filter(Boolean).join('\n'),
    relationshipConfidence: relationship.kind,
  };
}

export function createRequirementGroup(title: string, rule: RequirementGroup['rule'], target: number): RequirementGroup {
  return { id: `group-${slug(title)}-${Date.now().toString(36)}`, title: title.trim() || 'Elective group', rule, target, moduleIds: [], selectedModuleIds: [] };
}


export type AiCurriculumModule = {
  code?: string | null;
  title: string;
  ects?: number | null;
  recommendedSemester?: number | null;
  description?: string;
  category?: string;
  sourceEvidence?: string;
  sourceLocation?: string;
};
export type AiCurriculumDraft = {
  programme?: string;
  institution?: string;
  modules: AiCurriculumModule[];
  requirementGroups: { title: string; rule: RequirementGroup['rule']; target: number; moduleCodes: string[]; selectedCodes?: string[]; sourceNote?: string }[];
  warnings: string[];
};

export function makeCurriculumExtractionPrompt(): string {
  return `Read the attached or pasted university module handbook / official study plan, or the webpage URL supplied with this prompt. Extract the curriculum faithfully for the Studyplanner app. Do not invent details and do not infer semester placement from course difficulty or academic sequence.

Return ONLY valid JSON matching this schema:
{
  "schema": "studyplanner-curriculum/v1",
  "programme": "degree name or null",
  "institution": "university name or null",
  "modules": [
    {
      "code": "official module code or null",
      "title": "exact module title",
      "ects": 6,
      "recommendedSemester": 1,
      "description": "short description or null",
      "category": "compulsory/elective area if clear, otherwise null",
      "sourceEvidence": "short exact excerpt supporting important extracted facts, or null",
      "sourceLocation": "page number, table, section or heading, or null"
    }
  ],
  "requirementGroups": [
    {
      "title": "name of elective group",
      "rule": "min-ects | max-ects | exact-ects | module-count | one-from-each",
      "target": 6,
      "moduleCodes": ["CODE1", "CODE2"],
      "selectedCodes": [],
      "sourceNote": "official wording or null"
    }
  ],
  "warnings": ["uncertainties, conflicting values, and details that need human review"]
}

Rules:
- recommendedSemester is only the semester explicitly shown in the official study plan; otherwise null.
- ECTS must be a number only when supported by the source; otherwise null.
- Keep alternative modules as alternatives in requirementGroups, not as compulsory modules. Do not duplicate alternatives as separate compulsory requirements.
- Include all relevant module options when the source gives an elective catalogue. If the handbook contains many unrelated module descriptions, prioritize modules in the supplied study plan.
- Preserve official module codes exactly. Never create a code, ECTS value, semester, quote, source location, or URL.
- Separate the official recommended semester from formal prerequisites. This extraction schema does not encode prerequisite relationships; do not guess them here.
- Only report formal elective rules if the source explicitly states them. If unclear, add a warning and do not invent a rule.
- Use null for unknown scalar fields. Do not include Markdown fences or explanatory prose.
- JSON schema name must be exactly "studyplanner-curriculum/v1".`;
}

export function parseAiCurriculum(raw: string): { draft: AiCurriculumDraft | null; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { draft: null, errors: ['This is not valid JSON. Ask the AI to return only the JSON object, without commentary.'] };
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { schema?: unknown }).schema !== 'studyplanner-curriculum/v1') {
    return { draft: null, errors: ['Expected schema "studyplanner-curriculum/v1". Copy the complete extraction response.'] };
  }
  const row = parsed as Record<string, unknown>;
  if (!Array.isArray(row.modules)) return { draft: null, errors: ['The response must contain a modules array.'] };
  const modules: AiCurriculumModule[] = [];
  for (const [index, value] of row.modules.entries()) {
    if (!value || typeof value !== 'object') { errors.push(`Module ${index + 1}: expected an object.`); continue; }
    const module = value as Record<string, unknown>;
    if (typeof module.title !== 'string' || !module.title.trim()) { errors.push(`Module ${index + 1}: missing title.`); continue; }
    if (module.ects !== null && module.ects !== undefined && (typeof module.ects !== 'number' || !Number.isFinite(module.ects) || module.ects <= 0 || module.ects > 60)) { errors.push(`Module ${index + 1}: ECTS must be a number from 0 to 60 or null.`); continue; }
    if (module.recommendedSemester !== null && module.recommendedSemester !== undefined && (!Number.isInteger(module.recommendedSemester) || Number(module.recommendedSemester) < 1 || Number(module.recommendedSemester) > 20)) { errors.push(`Module ${index + 1}: recommendedSemester must be an integer from 1 to 20 or null.`); continue; }
    modules.push({
      title: module.title.trim(),
      code: typeof module.code === 'string' && module.code.trim() ? module.code.trim() : null,
      ects: typeof module.ects === 'number' ? module.ects : null,
      recommendedSemester: typeof module.recommendedSemester === 'number' ? module.recommendedSemester : null,
      description: typeof module.description === 'string' ? module.description : '',
      category: typeof module.category === 'string' && module.category.trim() ? module.category.trim() : 'Unclassified',
      sourceEvidence: typeof module.sourceEvidence === 'string' ? module.sourceEvidence.slice(0, 1500) : '',
      sourceLocation: typeof module.sourceLocation === 'string' ? module.sourceLocation.slice(0, 300) : '',
    });
  }
  const requirementGroups: AiCurriculumDraft['requirementGroups'] = [];
  if (row.requirementGroups !== undefined && !Array.isArray(row.requirementGroups)) errors.push('requirementGroups must be an array.');
  if (Array.isArray(row.requirementGroups)) {
    for (const [index, value] of row.requirementGroups.entries()) {
      if (!value || typeof value !== 'object') { errors.push(`Choice group ${index + 1}: expected an object.`); continue; }
      const group = value as Record<string, unknown>;
      if (typeof group.title !== 'string' || !group.title.trim() || !['min-ects','max-ects','exact-ects','module-count','one-from-each'].includes(String(group.rule)) || typeof group.target !== 'number' || !Number.isFinite(group.target) || group.target < 1 || !Array.isArray(group.moduleCodes) || !group.moduleCodes.every((code) => typeof code === 'string')) {
        errors.push(`Choice group ${index + 1}: invalid title, rule, target, or moduleCodes.`); continue;
      }
      const knownCodes = new Set(modules.map((module) => module.code).filter((code): code is string => Boolean(code)));
      const moduleCodes = (group.moduleCodes as string[]).filter((code) => knownCodes.has(code));
      if (moduleCodes.length !== group.moduleCodes.length) errors.push(`Choice group "${group.title}": unknown module codes were ignored.`);
      requirementGroups.push({ title: group.title.trim(), rule: group.rule as RequirementGroup['rule'], target: group.target, moduleCodes, selectedCodes: Array.isArray(group.selectedCodes) ? group.selectedCodes.filter((code): code is string => typeof code === 'string' && knownCodes.has(code)) : [], sourceNote: typeof group.sourceNote === 'string' ? group.sourceNote.slice(0, 1000) : undefined });
    }
  }
  if (modules.length === 0) errors.push('No valid modules were found in the response.');
  const warnings = Array.isArray(row.warnings) ? row.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 100) : [];
  return { draft: modules.length ? { programme: typeof row.programme === 'string' ? row.programme : undefined, institution: typeof row.institution === 'string' ? row.institution : undefined, modules, requirementGroups, warnings } : null, errors };
}
