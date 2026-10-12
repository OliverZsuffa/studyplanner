import { useMemo, useState } from 'react';
import { availabilityConflict, findScheduleConflict, getCalendarEvents, getPlannedSemester, getTermForSemester, getTermLabel, getSelectedAlternativeIds, validTimeRange, type CourseComponent, type CourseComponentType, type CourseExam, type Dependency, type StudyModule, type StudyPlan, type TimeSlotAlternative, type Weekday } from './model';
import './SchedulingPanel.css';

type Props = { plan: StudyPlan; setPlan: (update: StudyPlan | ((current: StudyPlan) => StudyPlan)) => void; onSelectModule?: (id: string) => void; compact?: boolean; compactModuleId?: string };
type PanelTab = 'courses' | 'timetable' | 'calendar' | 'dependencies';
const componentTypes: CourseComponentType[] = ['Lecture', 'Tutorial', 'Exercise class', 'Practical / lab', 'Seminar', 'Project', 'Other'];
const weekdays: { value: Weekday; label: string }[] = [{value:1,label:'Monday'},{value:2,label:'Tuesday'},{value:3,label:'Wednesday'},{value:4,label:'Thursday'},{value:5,label:'Friday'},{value:6,label:'Saturday'},{value:0,label:'Sunday'}];
const uid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const emptySlot = (): TimeSlotAlternative => ({ id: uid(), weekday: 1, startTime: '10:00', endTime: '12:00', location: '', online: false });
const emptyComponent = (): CourseComponent => ({ id: uid(), type: 'Lecture', name: '', startDate: '', endDate: '', alternatives: [emptySlot()], requiredTimeslotCount: 1, selectedAlternativeIds: [] });
const emptyExam = (): CourseExam => ({ id: uid(), label: 'Exam', date: '', location: '' });

export default function SchedulingPanel({ plan, setPlan, onSelectModule, compact = false, compactModuleId }: Props) {
  const [tab, setTab] = useState<PanelTab>('courses');
  const [selectedModuleId, setSelectedModuleId] = useState(plan.modules[0]?.id ?? '');
  const [semester, setSemester] = useState(1);
  const [notice, setNotice] = useState('');
  const [draggedComponentKey, setDraggedComponentKey] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<'month' | 'list'>('month');
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [depDraft, setDepDraft] = useState({ id: '', source: '', target: '', kind: 'required' as Dependency['kind'], note: '' });
  const [componentDrafts, setComponentDrafts] = useState<Record<string, CourseComponent>>({});
  const [examDrafts, setExamDrafts] = useState<Record<string, CourseExam>>({});
  const [copyTargetId, setCopyTargetId] = useState('');
  const selectedModule = plan.modules.find(m => m.id === (compactModuleId ?? selectedModuleId)) ?? plan.modules[0];
  const semesters = Array.from({length: Math.max(8, ...plan.modules.map(m => getPlannedSemester(m) ?? 0), 1)}, (_,i) => i+1);
  const term = getTermForSemester(plan.startingTerm, semester);
  const events = useMemo(() => getCalendarEvents(plan), [plan]);
  const updateModule = (id: string, change: Partial<StudyModule>) => setPlan(current => ({...current, modules: current.modules.map(m => m.id === id ? {...m, ...change} : m)}));
  const updateComponent = (module: StudyModule, component: CourseComponent) => updateModule(module.id, {components: (module.components ?? []).map(c => c.id === component.id ? component : c)});
  const updateSlot = (module: StudyModule, component: CourseComponent, slotId: string, change: Partial<TimeSlotAlternative>) => {
    const nextComponent = {...component, alternatives: component.alternatives.map(slot => slot.id === slotId ? {...slot, ...change} : slot)};
    const nextPlan = {...plan, modules: plan.modules.map(item => item.id !== module.id ? item : {...item, components: (item.components ?? []).map(c => c.id === component.id ? nextComponent : c)})};
    const semesterNumber = getPlannedSemester(module);
    if (getSelectedAlternativeIds(component).includes(slotId) && semesterNumber !== null) {
      const conflict = findScheduleConflict(nextPlan, semesterNumber, module.id, component.id, slotId);
      if (conflict) { setNotice(`Impossible: this edit overlaps ${conflict.module.title}, ${conflict.component.name || conflict.component.type} (${conflict.slot.startTime}–${conflict.slot.endTime}). The change was not saved.`); return; }
    }
    setPlan(nextPlan);
  };
  const copyTeachingComponents = (source: StudyModule) => {
    if (!copyTargetId || copyTargetId === source.id) return;
    const components = (source.components ?? []).map(component => {
      const idMap = new Map(component.alternatives.map(slot => [slot.id, uid()]));
      const selectedAlternativeIds = getSelectedAlternativeIds(component).map(id => idMap.get(id)).filter(id => id !== undefined);
      return { ...component, id: uid(), alternatives: component.alternatives.map(slot => ({ ...slot, id: idMap.get(slot.id)! })), selectedAlternativeIds, selectedAlternativeId: selectedAlternativeIds[0] };
    });
    if (components.length === 0) { setNotice('There are no teaching components to copy yet.'); return; }
    const target = plan.modules.find(module => module.id === copyTargetId);
    if (!target) return;
    setPlan(current => ({ ...current, modules: current.modules.map(module => module.id === copyTargetId ? { ...module, components: [...(module.components ?? []), ...components] } : module) }));
    setNotice(`Copied ${components.length} teaching component${components.length === 1 ? '' : 's'} to ${target.title}. Existing sessions were kept. Review dates, groups and locations for the target course.`);
    setCopyTargetId('');
  };
  const addComponent = (module: StudyModule) => {
    const component = componentDrafts[module.id] ?? emptyComponent();
    if (component.startDate && component.endDate && component.endDate < component.startDate) { setNotice('The teaching end date must be on or after the start date.'); return; }
    if (component.alternatives.some(s => !validTimeRange(s.startTime, s.endTime))) { setNotice('Each timeslot must have an end time later than its start time.'); return; }
    updateModule(module.id, {components: [...(module.components ?? []), component]});
    setComponentDrafts({...componentDrafts, [module.id]: emptyComponent()}); setNotice('Teaching component added.');
  };
  const addExam = (module: StudyModule) => {
    const exam = examDrafts[module.id] ?? emptyExam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exam.date) || !exam.location.trim()) { setNotice('Enter an exam date and location before adding it.'); return; }
    updateModule(module.id, {exams: [...(module.exams ?? []), exam]});
    setExamDrafts({...examDrafts, [module.id]: emptyExam()}); setNotice('Exam added.');
  };
  const selectAlternative = (module: StudyModule, component: CourseComponent, alternativeId: string) => {
    const slot = component.alternatives.find(s => s.id === alternativeId);
    if (!slot) { setNotice('This timeslot no longer exists.'); return; }
    const required = Math.max(1, component.requiredTimeslotCount ?? 1);
    const currentIds = getSelectedAlternativeIds(component);
    const key = `${module.id}:${component.id}`;
    if (currentIds.includes(alternativeId)) {
      if (required === 1) { updateComponent(module, {...component, selectedAlternativeIds: [alternativeId], selectedAlternativeId: alternativeId}); setDraggedComponentKey(null); setNotice('Timeslot selected.'); return; }
      const selectedAlternativeIds = currentIds.filter(id => id !== alternativeId);
      updateComponent(module, {...component, selectedAlternativeIds, selectedAlternativeId: selectedAlternativeIds[0]});
      setDraggedComponentKey(key);
      setNotice(`${selectedAlternativeIds.length} of ${required} required timeslots selected.`);
      return;
    }
    if (!validTimeRange(slot.startTime, slot.endTime)) { setNotice('This timeslot is invalid. Its end time must be later than its start time.'); return; }
    if (!component.startDate || !component.endDate || component.endDate < component.startDate) { setNotice('Enter a valid teaching start and end date before scheduling this component.'); return; }
    if (required > 1 && currentIds.length >= required) { setNotice(`This component requires ${required} timeslots. Remove a selected timeslot before choosing a replacement.`); return; }
    const s = getPlannedSemester(module);
    if (s !== null) {
      const conflict = findScheduleConflict(plan, s, module.id, component.id, alternativeId);
      if (conflict) { setNotice(`Impossible: ${module.title} (${slot.startTime}–${slot.endTime}) overlaps ${conflict.module.title}, ${conflict.component.name || conflict.component.type} (${conflict.slot.startTime}–${conflict.slot.endTime}) on ${weekdays.find(d=>d.value===slot.weekday)?.label}. The alternative was not selected.`); return; }
    }
    const selectedAlternativeIds = required === 1 ? [alternativeId] : [...currentIds, alternativeId];
    updateComponent(module, {...component, selectedAlternativeIds, selectedAlternativeId: selectedAlternativeIds[0]});
    setDraggedComponentKey(required > 1 && selectedAlternativeIds.length < required ? key : null);
    setNotice(required === 1 ? 'Timeslot selected.' : `${selectedAlternativeIds.length} of ${required} required timeslots selected.`);
  };
  const updateRequiredTimeslotCount = (module: StudyModule, component: CourseComponent, count: number) => {
    if (!Number.isFinite(count) || count < 1) return;
    const requiredTimeslotCount = Math.min(10, Math.floor(count));
    const selectedAlternativeIds = getSelectedAlternativeIds(component).slice(0, requiredTimeslotCount);
    updateComponent(module, {...component, requiredTimeslotCount, selectedAlternativeIds, selectedAlternativeId: selectedAlternativeIds[0]});
  };
  const saveDependency = () => {
    if (!depDraft.source || !depDraft.target || depDraft.source === depDraft.target) { setNotice('Choose two different courses for a connection.'); return; }
    if (plan.dependencies.some(d => d.id !== depDraft.id && d.source === depDraft.source && d.target === depDraft.target && d.kind === depDraft.kind)) { setNotice('That connection already exists.'); return; }
    const next: Dependency = {id: depDraft.id || uid(), source: depDraft.source, target: depDraft.target, kind: depDraft.kind, note: depDraft.note, provenance: 'user', relationshipConfidence: depDraft.kind === 'required' ? 'uncertain' : 'recommended'};
    setPlan(current => ({...current, dependencies: depDraft.id ? current.dependencies.map(d => d.id === depDraft.id ? {...d, ...next} : d) : [...current.dependencies, next]}));
    setDepDraft({id:'',source:'',target:'',kind:'required',note:''}); setNotice('Connection saved. Manually added hard dependencies remain unverified until you record evidence.');
  };
  const editDependency = (d: Dependency) => setDepDraft({id:d.id,source:d.source,target:d.target,kind:d.kind,note:d.note ?? ''});
  const monthEvents = events.filter(e => { const [y,m] = e.date.split('-').map(Number); return y === year && m === month + 1; });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsOnDay = (day: number) => monthEvents.filter(e => Number(e.date.slice(-2)) === day);
  const tabs: {id: PanelTab; label: string}[] = [{id:'courses',label:'Course sessions'},{id:'timetable',label:'Timetable'},{id:'calendar',label:'Calendar & exams'}];

  return <section className={'schedule-panel ' + (compact ? 'schedule-panel-compact' : '')}>
    {!compact && <><div className="schedule-heading"><div><div className="eyebrow">STUDY ORGANISER</div><h2>Timetable & calendar</h2><p>Enter real course information yourself. The planner never guesses teaching dates, exam dates or locations.</p></div></div>
    <div className="schedule-tabs" role="tablist" aria-label="Scheduling sections">
      {tabs.map(t => <button type="button" role="tab" aria-selected={tab===t.id} className={tab===t.id?'active':''} key={t.id} onClick={()=>{setTab(t.id);setNotice('');}}>{t.label}</button>)}
    </div></>}
    {notice && <div className={notice.startsWith('Impossible') || notice.includes('must') || notice.includes('Enter') || notice.includes('conflict') || notice.includes('prerequisite') || notice.includes('Set the starting') ? 'schedule-notice error' : 'schedule-notice success'} role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}

    {(compact || tab === 'courses') && <div className="schedule-content">
      {!compact && <section className="schedule-card starting-term"><h3>Study timeline</h3><p>This labels numbered semesters and checks winter/summer availability. It does not determine any course's teaching dates.</p>
        <label>Starting semester <select value={plan.startingTerm?.season ?? ''} onChange={e=>setPlan(current=>({...current,startingTerm:e.target.value ? {season:e.target.value as 'winter'|'summer',year:current.startingTerm?.year ?? new Date().getFullYear()} : null}))}><option value="">Not set</option><option value="winter">Winter semester</option><option value="summer">Summer semester</option></select></label>
        <label>Starting year <input type="number" min="1900" max="2200" value={plan.startingTerm?.year ?? ''} placeholder="e.g. 2026" onChange={e=>setPlan(current=>({...current,startingTerm:e.target.value ? {season:current.startingTerm?.season ?? 'winter',year:Number(e.target.value)} : null}))}/></label>
        {plan.startingTerm && <p className="schedule-muted">Semester 1: {getTermLabel(plan.startingTerm)} · Semester 2: {getTermLabel(getTermForSemester(plan.startingTerm,2))}</p>}{plan.modules.filter(m=>getPlannedSemester(m)!==null && availabilityConflict(m,getTermForSemester(plan.startingTerm,getPlannedSemester(m)!))).length>0 && <div className="schedule-notice error"><span>Some saved course placements conflict with their availability. Review: {plan.modules.filter(m=>getPlannedSemester(m)!==null && availabilityConflict(m,getTermForSemester(plan.startingTerm,getPlannedSemester(m)!))).map(m=>m.title).join(', ')}.</span></div>}
      </section>}
      {!compact && <label className="schedule-module-picker">Course to edit <select value={selectedModule?.id ?? ''} onChange={e=>setSelectedModuleId(e.target.value)}>{plan.modules.map(m=><option key={m.id} value={m.id}>{m.code} · {m.title}</option>)}</select></label>}
      {selectedModule && <section className="schedule-card"><div className="schedule-card-title"><div><h3>{selectedModule.title}</h3><p>{selectedModule.code} · {selectedModule.ects} ECTS</p></div><label>Availability <select value={selectedModule.availability ?? 'both'} onChange={e=>updateModule(selectedModule.id,{availability:e.target.value as StudyModule['availability']})}><option value="both">Winter and summer</option><option value="winter">Winter only</option><option value="summer">Summer only</option></select></label></div>
        <label>Planned semester <select value={getPlannedSemester(selectedModule) ?? ''} onChange={e=>{const n=e.target.value ? Number(e.target.value) : null; const mapped=n===null?null:getTermForSemester(plan.startingTerm,n); if(n!==null && selectedModule.availability && selectedModule.availability!=='both' && !mapped){setNotice('Set the starting semester and year before assigning a winter-only or summer-only course.');return;} const problem=n===null?null:availabilityConflict(selectedModule,mapped); if(problem){setNotice(problem);return;} const invalidRequiredOrder=n===null?null:plan.dependencies.find(d=>{if(d.kind!=='required')return false;if(d.target===selectedModule.id){const p=plan.modules.find(m=>m.id===d.source);const ps=p?getPlannedSemester(p):null;return ps!==null&&ps>=n&&p?.status!=='completed';}if(d.source===selectedModule.id){const t=plan.modules.find(m=>m.id===d.target);const ts=t?getPlannedSemester(t):null;return ts!==null&&ts<=n&&t?.status!=='completed';}return false;}); if(invalidRequiredOrder){setNotice('This semester conflicts with a required prerequisite order. Place the prerequisite in an earlier semester.');return;} updateModule(selectedModule.id,{plannedSemester:n,semester:n ?? undefined});setNotice('Planned semester updated.');}}><option value="">Not planned</option>{semesters.map(s=><option value={s} key={s}>S{s} · {getTermLabel(getTermForSemester(plan.startingTerm,s))}</option>)}</select></label>
        {getPlannedSemester(selectedModule)!==null && availabilityConflict(selectedModule,getTermForSemester(plan.startingTerm,getPlannedSemester(selectedModule)!)) && <p className="schedule-error">{availabilityConflict(selectedModule,getTermForSemester(plan.startingTerm,getPlannedSemester(selectedModule)!))}</p>}
        <h4>Teaching components</h4><p className="schedule-muted">Each component repeats weekly only between the dates you enter. Every alternative has its own location and online availability.</p>
        {(selectedModule.components ?? []).length > 0 && plan.modules.length > 1 && <div className="copy-sessions-row"><label>Reuse these sessions in another course<select value={copyTargetId} onChange={event => setCopyTargetId(event.target.value)}><option value="">Choose destination course…</option>{plan.modules.filter(module => module.id !== selectedModule.id).map(module => <option value={module.id} key={module.id}>{module.code} · {module.title}</option>)}</select></label><button type="button" className="schedule-secondary" disabled={!copyTargetId} onClick={() => copyTeachingComponents(selectedModule)}>Copy sessions</button><small>Appends copies with new IDs; it never replaces existing sessions. Review dates and details after copying.</small></div>}
        {(selectedModule.components ?? []).map(component=><article className="component-editor" key={component.id}><div className="component-title"><strong>{component.type}{component.name ? ' · '+component.name : ''}</strong><button type="button" className="schedule-danger" onClick={()=>updateModule(selectedModule.id,{components:(selectedModule.components??[]).filter(c=>c.id!==component.id)})}>Remove</button></div>
          <div className="schedule-fields"><label>Type<select value={component.type} onChange={e=>updateComponent(selectedModule,{...component,type:e.target.value as CourseComponentType})}>{componentTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Display name<input value={component.name} placeholder="e.g. Group A" onChange={e=>updateComponent(selectedModule,{...component,name:e.target.value})}/></label><label>Teaching starts<input type="date" value={component.startDate} onChange={e=>updateComponent(selectedModule,{...component,startDate:e.target.value})}/></label><label>Teaching ends<input type="date" value={component.endDate} onChange={e=>updateComponent(selectedModule,{...component,endDate:e.target.value})}/></label><label>Required timeslots<input type="number" min="1" max="10" value={component.requiredTimeslotCount??1} onChange={e=>updateRequiredTimeslotCount(selectedModule,component,Number(e.target.value))}/></label></div><p className="schedule-muted">Select {component.requiredTimeslotCount??1} of {component.alternatives.length} alternatives to schedule this component. {getSelectedAlternativeIds(component).length} currently selected.</p>{component.alternatives.length < (component.requiredTimeslotCount??1) && <p className="schedule-error">Add at least {component.requiredTimeslotCount??1} alternatives. This component currently has only {component.alternatives.length}.</p>}
          {(!component.startDate || !component.endDate || component.endDate<component.startDate) && <p className="schedule-error">Enter a valid teaching date range before this component can be scheduled.</p>}
          <h5>Possible timeslots</h5>{component.alternatives.map(slot=><div className="slot-editor" key={slot.id}><label>Weekday<select value={slot.weekday} onChange={e=>updateSlot(selectedModule,component,slot.id,{weekday:Number(e.target.value) as Weekday})}>{weekdays.map(d=><option value={d.value} key={d.value}>{d.label}</option>)}</select></label><label>Start<input type="time" value={slot.startTime} onChange={e=>updateSlot(selectedModule,component,slot.id,{startTime:e.target.value})}/></label><label>End<input type="time" value={slot.endTime} onChange={e=>updateSlot(selectedModule,component,slot.id,{endTime:e.target.value})}/></label><label>Location<input value={slot.location} placeholder="Room / building" onChange={e=>updateSlot(selectedModule,component,slot.id,{location:e.target.value})}/></label><label className="online-toggle"><input type="checkbox" checked={slot.online} onChange={e=>updateSlot(selectedModule,component,slot.id,{online:e.target.checked})}/> Available online</label><button type="button" className="schedule-danger" onClick={()=>{const alternatives=component.alternatives.filter(s=>s.id!==slot.id);const selectedAlternativeIds=getSelectedAlternativeIds(component).filter(id=>id!==slot.id);updateComponent(selectedModule,{...component,alternatives,selectedAlternativeIds,selectedAlternativeId:selectedAlternativeIds[0]});}}>Remove slot</button>{!validTimeRange(slot.startTime,slot.endTime)&&<small className="schedule-error">End time must be later than start time.</small>}</div>)}
          <button type="button" className="schedule-secondary" onClick={()=>updateComponent(selectedModule,{...component,alternatives:[...component.alternatives,emptySlot()]})}>+ Add alternative</button>
          {component.alternatives.length===0 && <p className="schedule-muted">Add at least one timeslot alternative to schedule this component.</p>}
        </article>)}
        <div className="component-new"><h4>Add teaching component</h4>{(()=>{const draft=componentDrafts[selectedModule.id]??emptyComponent();return <><div className="schedule-fields"><label>Type<select value={draft.type} onChange={e=>setComponentDrafts({...componentDrafts,[selectedModule.id]:{...draft,type:e.target.value as CourseComponentType}})}>{componentTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Display name<input value={draft.name} placeholder="e.g. Lecture" onChange={e=>setComponentDrafts({...componentDrafts,[selectedModule.id]:{...draft,name:e.target.value}})}/></label><label>Teaching starts<input type="date" value={draft.startDate} onChange={e=>setComponentDrafts({...componentDrafts,[selectedModule.id]:{...draft,startDate:e.target.value}})}/></label><label>Teaching ends<input type="date" value={draft.endDate} onChange={e=>setComponentDrafts({...componentDrafts,[selectedModule.id]:{...draft,endDate:e.target.value}})}/></label><label>Required timeslots<input type="number" min="1" max="10" value={draft.requiredTimeslotCount??1} onChange={e=>setComponentDrafts({...componentDrafts,[selectedModule.id]:{...draft,requiredTimeslotCount:Math.max(1,Math.min(10,Number(e.target.value)||1))}})}/></label></div><p className="schedule-muted">First timeslot: {weekdays.find(d=>d.value===draft.alternatives[0]?.weekday)?.label ?? '—'} {draft.alternatives[0]?.startTime ?? ''}–{draft.alternatives[0]?.endTime ?? ''}. You can add alternatives after creating it.</p><button type="button" className="schedule-primary" onClick={()=>addComponent(selectedModule)}>Add component</button></>})()}</div>
        <h4>Exams</h4>{(selectedModule.exams??[]).map(exam=><div className="exam-row" key={exam.id}><strong>{exam.label||'Exam'}</strong><span>{exam.date} · {exam.location}</span><button type="button" className="schedule-danger" onClick={()=>updateModule(selectedModule.id,{exams:(selectedModule.exams??[]).filter(e=>e.id!==exam.id)})}>Remove</button></div>)}
        {(()=>{const draft=examDrafts[selectedModule.id]??emptyExam();return <div className="schedule-fields"><label>Exam label<input value={draft.label} onChange={e=>setExamDrafts({...examDrafts,[selectedModule.id]:{...draft,label:e.target.value}})}/></label><label>Date<input type="date" value={draft.date} onChange={e=>setExamDrafts({...examDrafts,[selectedModule.id]:{...draft,date:e.target.value}})}/></label><label>Location<input value={draft.location} placeholder="Room / building" onChange={e=>setExamDrafts({...examDrafts,[selectedModule.id]:{...draft,location:e.target.value}})}/></label><button type="button" className="schedule-primary" onClick={()=>addExam(selectedModule)}>Add exam</button></div>})()}
      </section>}
    </div>}

    {!compact && tab === 'timetable' && <div className="schedule-content">
      <div className="schedule-toolbar"><label>Semester <select value={semester} onChange={e=>setSemester(Number(e.target.value))}>{semesters.map(s=><option key={s} value={s}>S{s} · {getTermLabel(getTermForSemester(plan.startingTerm,s))}</option>)}</select></label><span>{term ? getTermLabel(term) : 'Set a starting semester to label terms.'}</span></div>
      <p className="schedule-muted">Drag a session to pick it up. Its possible timeslots appear as holograms at their actual weekdays and times. On a touch screen, tap a session and then tap a destination. Green slots are available, red slots are blocked.</p>
      {draggedComponentKey && <p className="schedule-drag-hint" role="status">Choose a highlighted destination. For components requiring multiple sessions, each selection is added until the required number is reached. Tap the picked-up session again to cancel.</p>}
      <div className="timetable-grid">
        <div className="time-gutter"><span>Time</span>{Array.from({length:14},(_,i)=><span key={i}>{String(i+7).padStart(2,'0')}:00</span>)}</div>
        {weekdays.map(day=><div className="timetable-day" key={day.value}>
          <h4>{day.label}</h4>
          <div className="timetable-track">
            {Array.from({length:14},(_,i)=><div className="timetable-hour" key={i}/>)}
            {plan.modules.filter(m=>getPlannedSemester(m)===semester).flatMap(m=>(m.components??[]).flatMap(c=>{
              const selectedIds=getSelectedAlternativeIds(c);
              const selectedSlots=selectedIds.map(id=>c.alternatives.find(slot=>slot.id===id)).filter((slot):slot is TimeSlotAlternative=>!!slot);
              const displaySlots=selectedSlots.length?selectedSlots:c.alternatives.slice(0,1);
              return displaySlots.filter(slot=>slot.weekday===day.value).map(slot=>{
                const key=`${m.id}:${c.id}`;
                const isPickedUp=draggedComponentKey===key;
                const start=Number(slot.startTime.slice(0,2))+Number(slot.startTime.slice(3))/60;
                const end=Number(slot.endTime.slice(0,2))+Number(slot.endTime.slice(3))/60;
                const top=Math.max(0,(start-7)*48);
                const height=Math.max(30,(end-start)*48);
                const required=Math.max(1,c.requiredTimeslotCount??1);
                return <article className={'timetable-session '+(slot.online?'online ':'')+(!selectedIds.includes(slot.id)?'unselected ':'')+(isPickedUp?'session-being-dragged':'')} key={c.id+'-'+slot.id} style={{top,height}} draggable onClick={event=>{if((event.target as HTMLElement).closest('button,select,input,a'))return;setDraggedComponentKey(current=>current===key?null:key);}} onDragStart={event=>{setDraggedComponentKey(key);event.dataTransfer.setData('text/studyplanner-component',key);event.dataTransfer.effectAllowed='move';}} onDragEnd={event=>{if(event.dataTransfer.dropEffect==='none')setDraggedComponentKey(null);}}>
                  <strong>{m.title}</strong><span>{c.name||c.type}</span>
                  <small>{slot.startTime}–{slot.endTime} · {slot.location||'Location not entered'}{slot.online?' · Online available':''}</small>
                  <small className="timetable-selection-status">{selectedIds.length} of {required} required timeslots selected</small>
                  {isPickedUp&&<small>Picked up. Choose a highlighted destination.</small>}
                  {onSelectModule&&<button type="button" onClick={()=>onSelectModule(m.id)}>Open course</button>}
                </article>;
              });
            }))}
            {draggedComponentKey && (() => {
              const [dragModuleId,dragComponentId]=draggedComponentKey.split(':');
              const dragModule=plan.modules.find(item=>item.id===dragModuleId);
              const dragComponent=dragModule?.components?.find(item=>item.id===dragComponentId);
              if(!dragModule||!dragComponent)return null;
              const selectedIds=getSelectedAlternativeIds(dragComponent);
              const required=Math.max(1,dragComponent.requiredTimeslotCount??1);
              return dragComponent.alternatives.filter(option=>option.weekday===day.value).map(option=>{
                const alreadySelected=selectedIds.includes(option.id);
                const valid=alreadySelected||(validTimeRange(option.startTime,option.endTime)&&!!dragComponent.startDate&&!!dragComponent.endDate&&dragComponent.endDate>=dragComponent.startDate&&(required===1||selectedIds.length<required)&&!findScheduleConflict(plan,semester,dragModule.id,dragComponent.id,option.id));
                const start=Number(option.startTime.slice(0,2))+Number(option.startTime.slice(3))/60;
                const end=Number(option.endTime.slice(0,2))+Number(option.endTime.slice(3))/60;
                const top=Math.max(0,(start-7)*48);
                const height=Math.max(30,(end-start)*48);
                return <button type="button" key={'drop-'+option.id} className={'timetable-drop-target '+(valid?'valid':'invalid')+(alreadySelected?' selected':'')} style={{top,height}} aria-label={(alreadySelected?'Deselect ':'Select ')+(dragComponent.name||dragComponent.type)+' '+weekdays.find(d=>d.value===option.weekday)?.label+' '+option.startTime} onClick={()=>{if(valid)selectAlternative(dragModule,dragComponent,option.id);}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=valid?'move':'none';}} onDrop={event=>{event.preventDefault();if(valid){event.dataTransfer.dropEffect='move';selectAlternative(dragModule,dragComponent,option.id);}else setDraggedComponentKey(null);}} title={alreadySelected?'Click to remove this selected timeslot':valid?'Drop here to select this timeslot':'Unavailable: invalid time/date, required selection count reached, or timetable clash'}>
                  <strong>{alreadySelected?'✓ Selected':valid?'＋ Available':'× Unavailable'}</strong><span>{option.startTime}–{option.endTime}</span><small>{option.location||'Location not entered'}</small>
                </button>;
              });
            })()}
          </div>
        </div>)}
      </div>
      {plan.modules.filter(m=>getPlannedSemester(m)===semester).every(m=>(m.components??[]).length===0) && <p className="schedule-empty">No teaching components are entered for this semester yet.</p>}
    </div>}
    
    {!compact && tab === 'calendar' && <div className="schedule-content"><div className="schedule-toolbar"><div className="schedule-switch"><button className={calendarMode==='month'?'active':''} onClick={()=>setCalendarMode('month')}>Month</button><button className={calendarMode==='list'?'active':''} onClick={()=>setCalendarMode('list')}>List</button></div>{calendarMode==='month'&&<div className="month-nav"><button onClick={()=>{if(month===0){setMonth(11);setYear(year-1)}else setMonth(month-1)}} aria-label="Previous month">←</button><strong>{new Date(year,month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</strong><button onClick={()=>{if(month===11){setMonth(0);setYear(year+1)}else setMonth(month+1)}} aria-label="Next month">→</button></div>}</div>
      {calendarMode==='month'?<><div className="calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><strong className="calendar-weekday" key={d}>{d}</strong>)}{Array.from({length:firstWeekday},(_,i)=><div className="calendar-blank" key={'blank'+i}/>)}{Array.from({length:daysInMonth},(_,i)=>{const day=i+1;return <div className="calendar-day" key={day}><strong>{day}</strong>{eventsOnDay(day).slice(0,3).map(e=><button type="button" key={e.id} className={'calendar-event '+e.kind} title={e.title+' · '+e.location} onClick={()=>onSelectModule?.(e.moduleId)}><span>{e.startTime?e.startTime+' ':''}{e.title}</span></button>)}{eventsOnDay(day).length>3&&<small>+{eventsOnDay(day).length-3} more</small>}</div>})}</div><p className="schedule-muted">Teaching occurrences are generated only from explicit component dates and the selected weekly timeslot. Exam dates are shown only when entered.</p></>:<div className="calendar-list">{events.map(e=><button type="button" key={e.id} className={'calendar-list-event '+e.kind} onClick={()=>onSelectModule?.(e.moduleId)}><time>{new Date(e.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}{e.startTime?' · '+e.startTime+'–'+e.endTime:''}</time><strong>{e.title}</strong><span>{e.subtitle} · {e.location||'Location not entered'}</span></button>)}{events.length===0&&<p className="schedule-empty">No teaching dates or exams have been entered yet.</p>}</div>}
    </div>}

    {!compact && tab === 'dependencies' && <div className="schedule-content"><section className="schedule-card"><h3>{depDraft.id?'Edit connection':'Add dependency connection'}</h3><p className="schedule-muted">Direction is source → target. Hard dependencies are purple solid lines; soft dependencies are dotted. A manually entered hard dependency is not official evidence by itself.</p><div className="schedule-fields"><label>From (source)<select value={depDraft.source} onChange={e=>setDepDraft({...depDraft,source:e.target.value})}><option value="">Choose course</option>{plan.modules.map(m=><option value={m.id} key={m.id}>{m.code} · {m.title}</option>)}</select></label><label>To (target)<select value={depDraft.target} onChange={e=>setDepDraft({...depDraft,target:e.target.value})}><option value="">Choose course</option>{plan.modules.map(m=><option value={m.id} key={m.id}>{m.code} · {m.title}</option>)}</select></label><label>Type<select value={depDraft.kind} onChange={e=>setDepDraft({...depDraft,kind:e.target.value as Dependency['kind']})}><option value="required">Hard dependency (formal only if evidenced)</option><option value="recommended">Soft dependency / useful prior knowledge</option></select></label><label>Evidence / note<input value={depDraft.note} placeholder="Source or explanation (optional)" onChange={e=>setDepDraft({...depDraft,note:e.target.value})}/></label></div><div className="schedule-actions"><button type="button" className="schedule-primary" onClick={saveDependency}>{depDraft.id?'Save changes':'Add connection'}</button>{depDraft.id&&<button type="button" className="schedule-secondary" onClick={()=>setDepDraft({id:'',source:'',target:'',kind:'required',note:''})}>Cancel edit</button>}</div></section>
      <div className="dependency-list">{plan.dependencies.map(d=><article key={d.id} className="dependency-item"><span className={'dependency-line '+(d.kind==='required'?'hard':'soft')}/><div><strong>{plan.modules.find(m=>m.id===d.source)?.title??d.source} → {plan.modules.find(m=>m.id===d.target)?.title??d.target}</strong><p>{d.kind==='required'?'Hard dependency':'Soft dependency'} · {d.provenance==='user'?'Manually entered':d.provenance}{d.note?' · '+d.note:''}</p></div><button type="button" onClick={()=>editDependency(d)}>Edit</button><button type="button" className="schedule-danger" onClick={()=>{if(window.confirm('Delete this dependency connection?'))setPlan(current=>({...current,dependencies:current.dependencies.filter(x=>x.id!==d.id)}));}}>Delete</button></article>)}{plan.dependencies.length===0&&<p className="schedule-empty">No dependency connections yet.</p>}</div>
    </div>}
  </section>;
}
