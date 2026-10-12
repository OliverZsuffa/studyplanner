import { useState } from 'react';
import type { Dependency, StudyPlan } from './model';
import './SchedulingPanel.css';

type Props = {
  plan: StudyPlan;
  setPlan: (update: StudyPlan | ((current: StudyPlan) => StudyPlan)) => void;
};

const newId = () => globalThis.crypto?.randomUUID?.() ?? 'dep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function DependencyEditor({ plan, setPlan }: Props) {
  const [draft, setDraft] = useState({ id: '', source: '', target: '', kind: 'required' as Dependency['kind'], note: '' });
  const [notice, setNotice] = useState('');
  const save = () => {
    if (!draft.source || !draft.target || draft.source === draft.target) {
      setNotice('Choose two different courses for a connection.');
      return;
    }
    if (plan.dependencies.some(item => item.id !== draft.id && item.source === draft.source && item.target === draft.target && item.kind === draft.kind)) {
      setNotice('That connection already exists.');
      return;
    }
    const next: Dependency = {
      id: draft.id || newId(),
      source: draft.source,
      target: draft.target,
      kind: draft.kind,
      note: draft.note.trim() || undefined,
      provenance: 'user',
      relationshipConfidence: draft.kind === 'required' ? 'uncertain' : 'recommended',
    };
    setPlan(current => ({
      ...current,
      dependencies: draft.id
        ? current.dependencies.map(item => item.id === draft.id ? next : item)
        : [...current.dependencies, next],
    }));
    setDraft({ id: '', source: '', target: '', kind: 'required', note: '' });
    setNotice('Connection saved. Manually entered hard dependencies remain unverified until evidence is recorded.');
  };
  const edit = (item: Dependency) => {
    setDraft({ id: item.id, source: item.source, target: item.target, kind: item.kind, note: item.note ?? '' });
    setNotice('');
  };

  return <section className="map-dependency-editor schedule-card" aria-label="Dependency editor">
    <div className="dependency-editor-heading"><div><h3>Dependencies</h3><p className="schedule-muted">Connections flow from prerequisite or preparation to the course that depends on it.</p></div></div>
    {notice && <p className="schedule-notice" role="status">{notice}</p>}
    <div className="schedule-fields">
      <label>From course<select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}><option value="">Choose course</option>{plan.modules.map(module => <option value={module.id} key={module.id}>{module.code} · {module.title}</option>)}</select></label>
      <label>To course<select value={draft.target} onChange={event => setDraft({ ...draft, target: event.target.value })}><option value="">Choose course</option>{plan.modules.map(module => <option value={module.id} key={module.id}>{module.code} · {module.title}</option>)}</select></label>
      <label>Connection type<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Dependency['kind'] })}><option value="required">Required prerequisite</option><option value="recommended">Recommended preparation</option></select></label>
      <label>Evidence or note<input value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="Source or explanation (optional)" /></label>
    </div>
    <div className="schedule-actions"><button type="button" className="schedule-primary" onClick={save}>{draft.id ? 'Save connection' : 'Add connection'}</button>{draft.id && <button type="button" className="schedule-secondary" onClick={() => setDraft({ id: '', source: '', target: '', kind: 'required', note: '' })}>Cancel edit</button>}</div>
    <div className="dependency-list">{plan.dependencies.map(item => <article key={item.id} className="dependency-item"><span className={'dependency-line ' + (item.kind === 'required' ? 'hard' : 'soft')} /><div><strong>{plan.modules.find(module => module.id === item.source)?.title ?? item.source} → {plan.modules.find(module => module.id === item.target)?.title ?? item.target}</strong><p>{item.kind === 'required' ? 'Required prerequisite' : 'Recommended preparation'} · {item.provenance === 'user' ? 'Manually entered' : item.provenance}{item.note ? ' · ' + item.note : ''}</p></div><button type="button" onClick={() => edit(item)}>Edit</button><button type="button" className="schedule-danger" onClick={() => { if (window.confirm('Delete this dependency connection?')) setPlan(current => ({ ...current, dependencies: current.dependencies.filter(candidate => candidate.id !== item.id) })); }}>Delete</button></article>)}{plan.dependencies.length === 0 && <p className="schedule-empty">No dependency connections yet.</p>}</div>
  </section>;
}
