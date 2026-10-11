import { describe, expect, it } from 'vitest';
import { availabilityConflict, dateRangesOverlap, dateRangesShareWeekday, findScheduleConflict, getCalendarEvents, getTermForSemester, getTermLabel, migrateStudyPlan, timesOverlap, validTimeRange, type StudyModule, type StudyPlan } from './model';

const baseModule = (id: string, semester: number, startDate: string, endDate: string, slotId: string, weekday: 1, startTime: string, endTime: string): StudyModule => ({
  id, title: id, code: id.toUpperCase(), plannedSemester: semester, ects: 5, status: 'not-started', description: '', category: 'Core', availability: 'both',
  components: [{id:'component-'+id,type:'Lecture',name:'Lecture',startDate,endDate,selectedAlternativeId:slotId,alternatives:[{id:slotId,weekday,startTime,endTime,location:'Room 1',online:false}]}],
  exams: [],
});
const planOf = (...modules: StudyModule[]): StudyPlan => ({name:'Test',institution:'TUM',modules,dependencies:[]});

describe('semester timeline and availability', () => {
  it('maps semesters from either starting season without deriving course dates', () => {
    expect(getTermLabel(getTermForSemester({season:'winter',year:2026},1))).toBe('Winter semester 2026/27');
    expect(getTermForSemester({season:'winter',year:2026},2)).toEqual({season:'summer',year:2027});
    expect(getTermForSemester({season:'summer',year:2026},2)).toEqual({season:'winter',year:2027});
    expect(getTermForSemester(null,1)).toBeNull();
  });
  it('blocks a winter/summer availability mismatch but allows both', () => {
    const winterOnly = {...baseModule('a',1,'2026-10-01','2027-02-01','a-slot',1,'10:00','11:00'),availability:'winter' as const};
    expect(availabilityConflict(winterOnly,{season:'summer',year:2027})).toContain('impossible');
    expect(availabilityConflict({...winterOnly,availability:'both'},{season:'summer',year:2027})).toBeNull();
  });
  it('migrates old plans with neutral scheduling defaults', () => {
    const old = {name:'Old',institution:'TUM',modules:[{id:'x',title:'X',code:'X',ects:5,status:'not-started' as const,description:'',category:'Core'}],dependencies:[]};
    const migrated = migrateStudyPlan(old);
    expect(migrated.startingTerm).toBeNull();
    expect(migrated.modules[0].availability).toBe('both');
    expect(migrated.modules[0].components).toEqual([]);
    expect(migrated.modules[0].exams).toEqual([]);
  });
});

describe('weekly schedule validation', () => {
  it('validates times and treats adjacent slots as non-overlapping', () => {
    expect(validTimeRange('10:00','11:00')).toBe(true);
    expect(validTimeRange('11:00','10:00')).toBe(false);
    expect(validTimeRange('10:00','10:00')).toBe(false);
    expect(timesOverlap('10:00','11:00','11:00','12:00')).toBe(false);
    expect(timesOverlap('10:00','11:30','11:00','12:00')).toBe(true);
  });
  it('compares date ranges inclusively', () => {
    expect(dateRangesOverlap('2026-10-01','2026-12-01','2026-12-01','2027-02-01')).toBe(true);
    expect(dateRangesOverlap('2026-10-01','2026-11-30','2026-12-01','2027-02-01')).toBe(false);
    expect(dateRangesShareWeekday('2026-10-05','2026-10-06','2026-10-06','2026-10-10',1)).toBe(false);
    expect(dateRangesOverlap('','2026-11-30','2026-12-01','2027-02-01')).toBe(false);
  });
  it('detects same-weekday clashes only in the same planned semester and intersecting date ranges', () => {
    const a = baseModule('a',1,'2026-10-01','2027-02-01','a-slot',1,'10:00','11:00');
    const b = baseModule('b',1,'2026-11-01','2027-01-01','b-slot',1,'10:30','11:30');
    const c = baseModule('c',1,'2027-03-01','2027-04-01','c-slot',1,'10:30','11:30');
    const plan = planOf(a,b,c);
    expect(findScheduleConflict(plan,1,'a','component-a','a-slot')?.module.id).toBe('b');
    expect(findScheduleConflict(plan,2,'a','component-a','a-slot')).toBeNull();
    expect(findScheduleConflict(plan,1,'a','component-a','a-slot')?.module.id).not.toBe('c');
  });
  it('generates only explicitly dated selected teaching occurrences and entered exam dates', () => {
    const module = baseModule('a',1,'2026-10-05','2026-10-19','a-slot',1,'10:00','11:00');
    module.exams = [{id:'exam-1',label:'Final',date:'2026-10-20',location:'Auditorium'}];
    const events = getCalendarEvents(planOf(module));
    expect(events.filter(e=>e.kind==='teaching').map(e=>e.date)).toEqual(['2026-10-05','2026-10-12','2026-10-19']);
    expect(events.filter(e=>e.kind==='teaching-start')).toHaveLength(1);
    expect(events.filter(e=>e.kind==='teaching-end')).toHaveLength(1);
    expect(events.find(e=>e.kind==='exam')).toMatchObject({date:'2026-10-20',location:'Auditorium',title:'Final'});
    const unscheduled = {...module,components:module.components?.map(c=>({...c,startDate:'',endDate:''}))};
    expect(getCalendarEvents(planOf(unscheduled)).filter(e=>e.kind==='teaching')).toHaveLength(0);
  });
});
