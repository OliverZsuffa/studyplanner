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
      semester: 1,
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
  return { id: `group-${slug(title)}-${Date.now().toString(36)}`, title: title.trim() || 'Elective group', rule, target, moduleIds: [] };
}
