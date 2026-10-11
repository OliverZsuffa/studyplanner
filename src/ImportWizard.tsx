import { useMemo, useState, type ChangeEvent } from 'react';
import './ImportWizard.css';
import { ArrowLeft, ArrowRight, Check, Clipboard, FileText, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RequirementGroup, StudyModule, StudyPlan } from './model';
import { createRequirementGroup, makeCurriculumExtractionPrompt, makePrerequisitePrompt, parseAiCurriculum, parseAiRelationships, parseCurriculumText, toDependency, type AiRelationship, type ParseWarning } from './curriculumImport';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = { currentPlan: StudyPlan; onApply: (plan: StudyPlan, mode: 'add' | 'replace') => void; onClose: () => void };
type Stage = 'source' | 'extract' | 'review' | 'ai' | 'finish';
const freshModule = (i: number): StudyModule => ({ id: `manual-${Date.now().toString(36)}-${i}`, title: '', code: '', semester: undefined, plannedSemester: null, recommendedSemester: null, ects: 5, status: 'not-started', description: '', category: 'Unclassified' });

async function extractPdf(file: File): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !('transform' in item)) continue;
      const y = Math.round(item.transform[5]);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], text: item.str });
      rows.set(y, row);
    }
    const pageText = [...rows.entries()].sort(([a], [b]) => b - a).map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ')).join('\n');
    pages.push(`[Page ${n}]\n${pageText}`);
  }
  return pages.join('\n\n');
}

export default function ImportWizard({ currentPlan, onApply, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('source');
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [programme, setProgramme] = useState(currentPlan.name);
  const [institution, setInstitution] = useState(currentPlan.institution);
  const [modules, setModules] = useState<StudyModule[]>([]);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [groups, setGroups] = useState<RequirementGroup[]>([]);
  const [groupTitle, setGroupTitle] = useState('Electives');
  const [groupRule, setGroupRule] = useState<RequirementGroup['rule']>('min-ects');
  const [groupTarget, setGroupTarget] = useState('6');
  const [prompt, setPrompt] = useState('');
  const [extractPrompt, setExtractPrompt] = useState(makeCurriculumExtractionPrompt());
  const [extractResponse, setExtractResponse] = useState('');
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [aiText, setAiText] = useState('');
  const [relations, setRelations] = useState<AiRelationship[]>([]);
  const [selectedRelations, setSelectedRelations] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<StudyPlan | null>(null);
  const totalEcts = useMemo(() => modules.reduce((sum, m) => sum + (Number.isFinite(m.ects) ? m.ects : 0), 0), [modules]);

  const loadText = (value: string, name: string) => {
    setText(value); setSourceName(name);
    const parsed = parseCurriculumText(value);
    setModules(parsed.modules); setWarnings(parsed.warnings); setGroups([]);
    setNotice(`Found ${parsed.modules.length} module candidates. Review them carefully.`);
    setStage('review');
  };
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setNotice('');
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(await file.text()) as StudyPlan;
        if (!parsed || !Array.isArray(parsed.modules) || !Array.isArray(parsed.dependencies) || typeof parsed.name !== 'string') throw new Error('This is not a valid Studyplanner backup.');
        setRestore(parsed); setStage('finish'); setNotice(`Backup contains ${parsed.modules.length} modules.`);
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        const value = await extractPdf(file);
        if (!value.trim()) { setNotice('This PDF has no selectable text. Scanned PDFs need OCR; paste text or add modules manually.'); return; }
        loadText(value, file.name);
      } else loadText(await file.text(), file.name);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not read this file.'); }
    finally { setBusy(false); }
  };
  const updateModule = (id: string, patch: Partial<StudyModule>) => setModules((list) => list.map((m) => m.id === id ? { ...m, ...patch } : m));
  const removeModule = (id: string) => { setModules((list) => list.filter((m) => m.id !== id)); setGroups((list) => list.map((g) => ({ ...g, moduleIds: g.moduleIds.filter((x) => x !== id) }))); };
  const validateExtraction = () => {
    const result = parseAiCurriculum(extractResponse);
    setErrors(result.errors);
    if (!result.draft) return;
    const stamp = Date.now().toString(36);
    const extractedModules: StudyModule[] = result.draft.modules.map((item, index) => ({
      id: `ai-${(item.code || item.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36)}-${stamp}-${index}`,
      title: item.title,
      code: item.code ?? '',
      ects: item.ects ?? 0,
      plannedSemester: item.recommendedSemester ?? null,
      recommendedSemester: item.recommendedSemester ?? null,
      status: 'not-started',
      description: item.description ?? '',
      category: item.category ?? 'Unclassified',
      sourceEvidence: item.sourceEvidence ?? '',
      sourceLocation: item.sourceLocation ?? '',
    }));
    const byCode = new Map(extractedModules.filter((m) => m.code).map((m) => [m.code, m.id]));
    const extractedGroups: RequirementGroup[] = result.draft.requirementGroups.map((group, index) => ({
      id: `ai-group-${stamp}-${index}`,
      title: group.title,
      rule: group.rule,
      target: group.target,
      moduleIds: group.moduleCodes.map((code) => byCode.get(code)).filter((id): id is string => Boolean(id)),
      selectedModuleIds: (group.selectedCodes ?? []).map((code) => byCode.get(code)).filter((id): id is string => Boolean(id)),
      sourceNote: group.sourceNote,
    }));
    setModules(extractedModules);
    setGroups(extractedGroups);
    setProgramme(result.draft.programme || currentPlan.name);
    setInstitution(result.draft.institution || currentPlan.institution);
    setSourceName('AI-extracted curriculum');
    setExtractWarnings(result.draft.warnings);
    setWarnings([]);
    setRelations([]);
    setSelectedRelations(new Set());
    setNotice('AI extraction loaded as a draft. Check missing ECTS, semesters, source evidence, and choice groups before importing.');
    setErrors(result.errors);
    setStage('review');
  };
  const parseAi = () => {
    const result = parseAiRelationships(aiText, modules);
    setRelations(result.relationships); setErrors(result.errors); setSelectedRelations(new Set());
    setStage('ai');
    setNotice(result.relationships.length ? `Validated ${result.relationships.length} relationships. Review them below.` : 'No valid relationships found. Review any validation errors below.');
  };
  const prepare = (): StudyPlan => {
    if (restore) return restore;
    const imported = modules.filter((m) => m.title.trim()).map((m) => ({ ...m, title: m.title.trim(), code: m.code.trim() || '—' }));
    const chosen = relations.filter((_, i) => selectedRelations.has(i)).map(toDependency);
    if (mode === 'replace') return { name: programme || 'Imported study programme', institution: institution || 'Imported curriculum', modules: imported, dependencies: chosen, requirementGroups: groups };
    const keys = new Set(currentPlan.modules.map((m) => `${m.code.toLowerCase()}|${m.title.toLowerCase()}`));
    const addedOriginal = imported.filter((m) => !keys.has(`${m.code.toLowerCase()}|${m.title.toLowerCase()}`));
    const existingIds = new Set(currentPlan.modules.map((m) => m.id));
    const remap = new Map(addedOriginal.map((m) => [m.id, existingIds.has(m.id) ? `imported-${m.id}` : m.id]));
    const added = addedOriginal.map((m) => ({ ...m, id: remap.get(m.id) ?? m.id }));
    const ids = new Set(addedOriginal.map((m) => m.id));
    const dependencies = chosen.filter((d) => ids.has(d.source) && ids.has(d.target)).map((d) => ({ ...d, source: remap.get(d.source) ?? d.source, target: remap.get(d.target) ?? d.target }));
    const groupsToAdd = groups.map((g) => ({ ...g, id: `imported-${g.id}`, moduleIds: g.moduleIds.filter((id) => ids.has(id)).map((id) => remap.get(id) ?? id), selectedModuleIds: (g.selectedModuleIds ?? []).filter((id) => ids.has(id)).map((id) => remap.get(id) ?? id) }));
    return { ...currentPlan, modules: [...currentPlan.modules, ...added], dependencies: [...currentPlan.dependencies, ...dependencies], requirementGroups: [...(currentPlan.requirementGroups ?? []), ...groupsToAdd] };
  };
  const apply = () => { const result = prepare(); if (!result.modules.length) { setNotice('There are no modules to import.'); return; } onApply(result, mode); };
  const step = ({ source: 1, extract: 2, review: 3, ai: 4, finish: 5 } as Record<Stage, number>)[stage];

  return <div className="import-overlay" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="import-modal">
    <header className="import-header"><div><div className="eyebrow"><Sparkles size={13} /> CURRICULUM IMPORT</div><h2 id="import-title">{restore ? 'Restore a backup' : 'Build your study plan'}</h2><p>AI-assisted curriculum extraction, manual review and optional prerequisite analysis.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
    <div className="import-steps">{['Source', 'AI extraction', 'Review', 'AI analysis', 'Apply'].map((label, i) => <div key={label} className={step === i + 1 ? 'current' : step > i + 1 ? 'done' : ''}><span>{step > i + 1 ? <Check size={12} /> : i + 1}</span>{label}</div>)}</div>
    {stage === 'source' && <section className="import-body">
      <label className="import-drop"><Upload size={23} /><strong>Choose a file</strong><span>Selectable-text PDF, TXT or Studyplanner JSON backup</span><input type="file" accept=".pdf,.txt,.json,application/pdf,text/plain,application/json" onChange={onFile} /></label>
      <div className="import-privacy"><FileText size={20} /><span><strong>Your curriculum stays in this browser.</strong> Studyplanner never uploads your files or sends data to an AI service. For difficult PDFs, use the AI extraction prompt and attach the source directly to your chosen AI tool.</span></div>
      <div className="import-callout"><Sparkles size={19} /><div><strong>Recommended: extract with your AI</strong><p>Works with module handbooks, tables, pasted text, and webpages if your chosen AI can access them. You review everything before it enters your plan.</p><button className="button button-primary" onClick={() => { setExtractPrompt(makeCurriculumExtractionPrompt()); setStage('extract'); }}>Create extraction prompt <ArrowRight size={15} /></button></div></div>
      <label className="import-label">Or paste curriculum text<textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Example:\nIN2010 Algorithms and Data Structures — 6 ECTS\nIN2020 Database Systems — 5 ECTS'} /></label>
      <div className="import-actions"><span className="import-hint">{notice || sourceName}</span><button className="button button-primary" disabled={!text.trim()} onClick={() => loadText(text, 'Pasted curriculum text')}>Extract modules <ArrowRight size={15} /></button></div>
    </section>}
    {stage === 'extract' && <section className="import-body">
      <div className="import-callout"><Sparkles size={19} /><div><strong>Use the AI service you trust</strong><p>Copy the prompt into your chosen AI and attach the module handbook, paste the source text, or include a webpage URL. Studyplanner itself does not upload files or fetch URLs.</p></div></div>
      <label className="import-label">Curriculum extraction prompt<textarea className="import-large-text" rows={14} value={extractPrompt} onChange={(e) => setExtractPrompt(e.target.value)} /></label>
      <div className="import-actions"><button className="button button-quiet" onClick={() => setStage('source')}><ArrowLeft size={15} /> Back</button><button className="button button-quiet" onClick={() => { void navigator.clipboard?.writeText(extractPrompt).then(() => setNotice('Extraction prompt copied.')).catch(() => setNotice('Clipboard unavailable; select and copy manually.')); }}><Clipboard size={15} /> Copy prompt</button></div>
      <label className="import-label">Paste the AI's JSON response<textarea className="import-large-text" rows={10} value={extractResponse} onChange={(e) => setExtractResponse(e.target.value)} placeholder={'{"schema":"studyplanner-curriculum/v1","modules":[],"requirementGroups":[],"warnings":[]}'} /></label>
      {notice && <p className="import-notice">{notice}</p>}
      {errors.length > 0 && <div className="import-errors"><strong>Validation issues</strong>{errors.map((e, i) => <p key={i}>{e}</p>)}</div>}
      <div className="import-actions"><span className="import-hint">JSON is checked for structure, not for factual accuracy.</span><button className="button button-primary" disabled={!extractResponse.trim()} onClick={validateExtraction}>Validate and review <ArrowRight size={15} /></button></div>
    </section>}
    {stage === 'review' && <section className="import-body">
      <div className="import-plan-fields"><label className="import-label">Programme<input value={programme} onChange={(e) => setProgramme(e.target.value)} /></label><label className="import-label">University / source<input value={institution} onChange={(e) => setInstitution(e.target.value)} /></label></div>
      <div className="import-summary"><strong>{modules.length} candidates</strong><span>{totalEcts} ECTS across all listed options</span><span>{sourceName}</span></div>
      {notice && <p className="import-notice">{notice}</p>}
      {extractWarnings.length > 0 && <details className="import-warnings"><summary>{extractWarnings.length} AI extraction notes</summary>{extractWarnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>}{warnings.length > 0 && <details className="import-warnings"><summary>{warnings.length} lines need attention</summary>{warnings.slice(0, 10).map((w, i) => <p key={i}>Line {w.line}: {w.reason}<small>{w.text}</small></p>)}</details>}
      <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Title</th><th>Code</th><th>ECTS</th><th>Official semester</th><th>Planned semester</th><th>Description / evidence</th><th /></tr></thead><tbody>{modules.map((m) => <tr key={m.id}><td><input aria-label="Module title" value={m.title} onChange={(e) => updateModule(m.id, { title: e.target.value })} /></td><td><input aria-label="Module code" value={m.code} onChange={(e) => updateModule(m.id, { code: e.target.value })} /></td><td><input aria-label="ECTS" type="number" min="0" max="60" step=".5" value={m.ects || ''} onChange={(e) => updateModule(m.id, { ects: Number(e.target.value) })} placeholder="Unknown" /></td><td><input aria-label="Official recommended semester" type="number" min="1" max="20" value={m.recommendedSemester ?? ''} onChange={(e) => updateModule(m.id, { recommendedSemester: e.target.value === '' ? null : Number(e.target.value), plannedSemester: e.target.value === '' ? m.plannedSemester : (m.plannedSemester ?? Number(e.target.value)) })} placeholder="Unknown" /></td><td><input aria-label="Your planned semester" type="number" min="1" max="20" value={m.plannedSemester ?? ''} onChange={(e) => updateModule(m.id, { plannedSemester: e.target.value === '' ? null : Number(e.target.value), semester: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Not planned" /></td><td><textarea aria-label="Module description" rows={2} value={m.description} onChange={(e) => updateModule(m.id, { description: e.target.value })} placeholder="Module description" />{(m.sourceEvidence || m.sourceLocation) && <div className="import-source-evidence"><small>{m.sourceEvidence ? `Evidence: ${m.sourceEvidence}` : ''}{m.sourceLocation ? ` (${m.sourceLocation})` : ''}</small><textarea aria-label="Source evidence" rows={2} value={m.sourceEvidence ?? ''} onChange={(e) => updateModule(m.id, { sourceEvidence: e.target.value })} placeholder="Source evidence" /></div>}</td></td><td><button className="import-icon-button" onClick={() => removeModule(m.id)} aria-label="Remove module"><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
      <button className="button button-quiet" onClick={() => setModules((list) => [...list, freshModule(list.length + 1)])}><Plus size={15} /> Add module manually</button>
      <div className="import-group-editor"><h3>Electives and choice groups</h3><p>A choice rule is separate from its possible courses; all options are not counted as required.</p>
        <div className="import-group-form"><input aria-label="Group title" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group title" /><select aria-label="Rule" value={groupRule} onChange={(e) => setGroupRule(e.target.value as RequirementGroup['rule'])}><option value="min-ects">At least X ECTS</option><option value="max-ects">At most X ECTS</option><option value="exact-ects">Exactly X ECTS</option><option value="module-count">Choose X modules</option><option value="one-from-each">One from each area</option></select><input aria-label="Target" type="number" min="1" value={groupTarget} onChange={(e) => setGroupTarget(e.target.value)} /><button className="button button-quiet" onClick={() => { if (!groupTitle.trim() || Number(groupTarget) < 1) { setNotice('Enter a group title and target greater than zero.'); return; } setGroups((list) => [...list, createRequirementGroup(groupTitle, groupRule, Number(groupTarget))]); setGroupTitle(''); }}>Add</button></div>
        {groups.map((g) => <div className="import-group" key={g.id}><strong>{g.title} <small>{g.rule}: {g.target}</small></strong><div className="import-group-options">{modules.filter((m) => m.title.trim()).map((m) => <div className="import-group-module" key={m.id}><label><input type="checkbox" checked={g.moduleIds.includes(m.id)} onChange={(e) => setGroups((list) => list.map((x) => x.id === g.id ? { ...x, moduleIds: e.target.checked ? [...x.moduleIds, m.id] : x.moduleIds.filter((id) => id !== m.id), selectedModuleIds: e.target.checked ? x.selectedModuleIds : (x.selectedModuleIds ?? []).filter((id) => id !== m.id) } : x))} />Option: {m.title}</label>{g.moduleIds.includes(m.id) && <label><input type="checkbox" checked={(g.selectedModuleIds ?? []).includes(m.id)} onChange={(e) => setGroups((list) => list.map((x) => x.id === g.id ? { ...x, selectedModuleIds: e.target.checked ? [...(x.selectedModuleIds ?? []), m.id] : (x.selectedModuleIds ?? []).filter((id) => id !== m.id) } : x))} />Plan to take</label>}</div>)}</div><button className="import-icon-button" onClick={() => setGroups((list) => list.filter((x) => x.id !== g.id))} aria-label="Remove group"><Trash2 size={14} /></button></div>)}
      </div>
      <div className="import-actions"><button className="button button-quiet" onClick={() => setStage('source')}><ArrowLeft size={15} /> Back</button><button className="button button-primary" onClick={() => { const clean = modules.filter((m) => m.title.trim()); if (!clean.length) { setNotice('Add at least one module.'); return; } setModules(clean); setPrompt(makePrerequisitePrompt({ name: programme || 'Study programme', institution: institution || 'Not specified', modules: clean, requirementGroups: groups })); setStage('ai'); }}>Generate AI prompt <Sparkles size={15} /></button></div>
    </section>}
    {stage === 'ai' && <section className="import-body">
      <div className="import-callout"><Sparkles size={19} /><div><strong>Use the AI service you trust</strong><p>Copy the prompt into your chosen AI assistant. If it supports browsing, ask it to check official sources. Studyplanner never sends the curriculum to the AI itself.</p></div></div>
      <label className="import-label">Generated prompt<textarea className="import-large-text" rows={12} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <div className="import-actions"><button className="button button-quiet" onClick={() => setStage('review')}><ArrowLeft size={15} /> Edit curriculum</button><button className="button button-quiet" onClick={() => { void navigator.clipboard?.writeText(prompt).then(() => setNotice('Prompt copied.')).catch(() => setNotice('Clipboard unavailable; select and copy manually.')); }}><Clipboard size={15} /> Copy prompt</button></div>
      <label className="import-label">Paste the AI's JSON response<textarea rows={7} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={'{"schema":"studyplanner-prerequisites/v1","relationships":[]}'} /></label>
      <div className="import-actions"><span className="import-hint">{notice || 'You can skip AI analysis and import without relationships.'}</span><button className="button button-primary" disabled={!aiText.trim()} onClick={parseAi}>Validate response <ArrowRight size={15} /></button><button className="button button-quiet" onClick={() => { setRelations([]); setSelectedRelations(new Set()); setStage('finish'); }}>Skip AI</button></div>
      {errors.length > 0 && <div className="import-errors"><strong>Validation issues</strong>{errors.map((e, i) => <p key={i}>{e}</p>)}</div>}
      {relations.length > 0 && <><div className="import-callout warning"><FileText size={18} /><div><strong>AI output is unverified</strong><p>Review the evidence yourself. Only explicitly approved formal prerequisites will act as blockers.</p></div></div><div className="import-relations">{relations.map((r, i) => { const source = modules.find((m) => m.id === r.source); const target = modules.find((m) => m.id === r.target); return <label className="import-relation" key={r.source + r.target}><input type="checkbox" checked={selectedRelations.has(i)} onChange={(e) => setSelectedRelations((current) => { const next = new Set(current); e.target.checked ? next.add(i) : next.delete(i); return next; })} /><div className="import-relation-content"><div className="import-relation-top"><strong>{source?.title} → {target?.title}</strong><span className={'relation-kind ' + r.kind}>{r.kind === 'formal' ? 'Formal prerequisite' : r.kind === 'recommended' ? 'Recommended' : 'Uncertain'}</span></div><p>{r.rationale}</p>{r.evidence && <blockquote>{r.evidence}</blockquote>}{r.url && <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}</div></label>; })}</div><div className="import-actions"><span className="import-hint">Selected: {selectedRelations.size} / {relations.length}</span><button className="button button-primary" onClick={() => setStage('finish')}>Review import <ArrowRight size={15} /></button></div></>}
    </section>}
    {stage === 'finish' && <section className="import-body">
      {restore ? <div className="import-callout"><FileText size={20} /><div><strong>Backup ready to restore</strong><p>{restore.modules.length} modules and {restore.dependencies.length} relationships. Restoring replaces the active plan.</p></div></div> : <>
        <div className="import-summary"><strong>{modules.filter((m) => m.title.trim()).length} modules</strong><span>{groups.length} choice groups</span><span>{selectedRelations.size} AI relationships selected</span></div>
        <p className="import-final-warning">Review all extracted fields, especially missing ECTS/semesters, choice rules, and evidence. AI claims and cited sources have not been independently verified.</p>
        <fieldset className="import-mode"><legend>Apply import</legend><label><input type="radio" name="import-mode" checked={mode === 'add'} onChange={() => setMode('add')} /> Add to current plan <small>Likely duplicate courses are skipped.</small></label><label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace current plan <small>Replace modules and relationships.</small></label></fieldset>
      </>}
      {notice && <p className="import-notice">{notice}</p>}
      <div className="import-actions"><button className="button button-quiet" onClick={() => setStage(restore ? 'source' : 'ai')}><ArrowLeft size={15} /> Back</button><button className="button button-primary" onClick={apply}><Check size={15} /> {restore ? 'Restore backup' : mode === 'replace' ? 'Replace plan' : 'Add to plan'}</button></div>
    </section>}
    {busy && <div className="import-busy">Reading file locally…</div>}
  </div></div>;
}
