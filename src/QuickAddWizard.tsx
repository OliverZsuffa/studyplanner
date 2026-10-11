import { useMemo, useState } from 'react';
import { Check, ClipboardPaste, Plus, X } from 'lucide-react';
import type { StudyModule, StudyPlan } from './model';
import { getQuickCourseDuplicateFlags, parseQuickCourseLines, type QuickCourseDraft } from './quickAdd';
import './QuickAddWizard.css';

interface Props {
  currentPlan: StudyPlan;
  onApply: (modules: StudyModule[]) => void;
  onClose: () => void;
}

export default function QuickAddWizard({ currentPlan, onApply, onClose }: Props) {
  const [text, setText] = useState('');
  const [defaultEcts, setDefaultEcts] = useState('5');
  const [defaultSemester, setDefaultSemester] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('Core');
  const [drafts, setDrafts] = useState<QuickCourseDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [parsed, setParsed] = useState(false);

  const duplicates = useMemo(() => getQuickCourseDuplicateFlags(drafts, currentPlan.modules), [drafts, currentPlan.modules]);
  const selectedCount = drafts.filter((draft) => selectedKeys.has(draft.key)).length;
  const errors = drafts.map((draft) => {
    const ects = Number(draft.ects.replace(',', '.'));
    const semester = draft.semester.trim() ? Number(draft.semester) : null;
    const messages: string[] = [];
    if (!draft.title.trim()) messages.push('Add a title');
    if (!draft.ects.trim() || !Number.isFinite(ects) || ects < 0 || ects > 60) messages.push('ECTS must be between 0 and 60');
    if (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 20)) messages.push('Semester must be 1–20 or blank');
    return messages;
  });
  const invalidSelected = drafts.some((draft, index) => selectedKeys.has(draft.key) && errors[index].length > 0);

  const parse = () => {
    const next = parseQuickCourseLines(text, { ects: defaultEcts, semester: defaultSemester, category: defaultCategory || 'Core' });
    setDrafts(next);
    const flags = getQuickCourseDuplicateFlags(next, currentPlan.modules);
    setSelectedKeys(new Set(next.filter((draft, index) => !flags[index].existing && !flags[index].batch).map((draft) => draft.key)));
    setParsed(true);
  };

  const updateDraft = (key: string, field: keyof Omit<QuickCourseDraft, 'key'>, value: string) => {
    setDrafts((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item));
  };

  const addSelected = () => {
    const modules = drafts.filter((draft, index) => selectedKeys.has(draft.key) && errors[index].length === 0).map((draft, index): StudyModule => {
      const semester = draft.semester.trim() ? Number(draft.semester) : null;
      const ects = Number(draft.ects.replace(',', '.'));
      return {
        id: `quick-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        title: draft.title.trim(),
        code: draft.code.trim() || 'CUSTOM',
        semester: semester ?? undefined,
        plannedSemester: semester,
        recommendedSemester: null,
        ects,
        status: 'not-started',
        description: '',
        category: draft.category.trim() || 'Core',
      };
    });
    if (modules.length) onApply(modules);
  };

  const toggleAll = (checked: boolean) => setSelectedKeys(new Set(checked ? drafts.filter((draft, index) => errors[index].length === 0).map((draft) => draft.key) : []));

  return <div className="quick-add-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="quick-add-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <header className="quick-add-header">
        <div><div className="eyebrow"><ClipboardPaste size={13} /> BATCH ENTRY</div><h2 id="quick-add-title">Add many courses at once</h2><p>Paste a list or spreadsheet rows, review once, then add them together.</p></div>
        <button type="button" className="icon-button" aria-label="Close batch entry" onClick={onClose}><X size={18} /></button>
      </header>
      {!parsed ? <>
        <label className="quick-add-label">Course list<textarea autoFocus rows={9} value={text} onChange={(event) => setText(event.target.value)} placeholder={'One course per line:\nIntroduction to Informatics\nAlgorithms and Data Structures\nDatabases\n\nOr paste spreadsheet rows with columns: Title, Code, ECTS, Semester, Category.'} /></label>
        <div className="quick-add-defaults">
          <label>Default ECTS<input type="number" min="0" max="60" step=".5" value={defaultEcts} onChange={(event) => setDefaultEcts(event.target.value)} /></label>
          <label>Default semester<select value={defaultSemester} onChange={(event) => setDefaultSemester(event.target.value)}><option value="">Leave unplanned</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Semester {index + 1}</option>)}</select></label>
          <label>Default category<input value={defaultCategory} onChange={(event) => setDefaultCategory(event.target.value)} placeholder="Core" /></label>
        </div>
        <p className="quick-add-hint">A header row is detected automatically. Without headers, separated rows use Title · Code · ECTS · Semester · Category; a code-first row is also recognised. Missing values use the defaults above.</p>
        <footer className="quick-add-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={!text.trim() || !defaultEcts.trim() || !Number.isFinite(Number(defaultEcts)) || Number(defaultEcts) < 0 || Number(defaultEcts) > 60} onClick={parse}>Preview courses <Plus size={15} /></button></footer>
      </> : <>
        <div className="quick-add-summary"><strong>{drafts.length} courses found</strong><span>{selectedCount} selected to add</span><button type="button" className="text-link" onClick={() => setParsed(false)}>Back to pasted list</button></div>
        {drafts.length === 0 ? <div className="quick-add-empty">No course titles found. Go back and paste one course per line.</div> : <div className="quick-add-table-wrap"><table className="quick-add-table"><thead><tr><th><input type="checkbox" aria-label="Select all valid courses" checked={selectedCount === drafts.length && drafts.length > 0} onChange={(event) => toggleAll(event.target.checked)} /></th><th>Course title</th><th>Code</th><th>ECTS</th><th>Semester</th><th>Category</th></tr></thead><tbody>{drafts.map((draft, index) => {
          const duplicate = duplicates[index].existing || duplicates[index].batch;
          const selected = selectedKeys.has(draft.key);
          const problem = errors[index].join('. ');
          return <tr key={draft.key} className={duplicate ? 'is-duplicate' : ''}>
            <td><input type="checkbox" aria-label={`Include ${draft.title}`} checked={selected} disabled={errors[index].length > 0} onChange={(event) => setSelectedKeys((current) => { const next = new Set(current); if (event.target.checked) next.add(draft.key); else next.delete(draft.key); return next; })} /></td>
            <td><input aria-label={`Title for row ${index + 1}`} value={draft.title} onChange={(event) => updateDraft(draft.key, 'title', event.target.value)} />{problem && <small className="quick-add-error">{problem}</small>}{duplicate && <small className="quick-add-duplicate">{duplicates[index].existing ? 'Already in your plan' : 'Repeated in this list'} · review before adding</small>}</td>
            <td><input aria-label={`Code for ${draft.title}`} value={draft.code} onChange={(event) => updateDraft(draft.key, 'code', event.target.value)} /></td>
            <td><input aria-label={`ECTS for ${draft.title}`} type="number" min="0" max="60" step=".5" value={draft.ects} onChange={(event) => updateDraft(draft.key, 'ects', event.target.value)} /></td>
            <td><select aria-label={`Semester for ${draft.title}`} value={draft.semester} onChange={(event) => updateDraft(draft.key, 'semester', event.target.value)}><option value="">Unplanned</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={String(i + 1)}>S{i + 1}</option>)}</select></td>
            <td><input aria-label={`Category for ${draft.title}`} value={draft.category} onChange={(event) => updateDraft(draft.key, 'category', event.target.value)} /></td>
          </tr>;
        })}</tbody></table></div>}
        <p className="quick-add-hint">Duplicates are unchecked by default, never overwritten automatically. You can include one deliberately. This step creates courses only; it does not invent prerequisites, elective rules, or official semester recommendations.</p>
        <footer className="quick-add-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={!selectedCount || invalidSelected} onClick={addSelected}><Check size={15} /> Add {selectedCount} {selectedCount === 1 ? 'course' : 'courses'}</button></footer>
      </>}
    </section>
  </div>;
}
