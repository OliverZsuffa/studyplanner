import { describe, expect, it } from 'vitest';
import { getQuickCourseDuplicateFlags, parseQuickCourseLines } from './quickAdd';

describe('parseQuickCourseLines', () => {
  const defaults = { ects: '5', semester: '', category: 'Core' };

  it('parses plain course lists and ignores blank lines', () => {
    expect(parseQuickCourseLines('Algorithms\n\nDatabase Systems\n 茶 und Kultur ', defaults).map((item) => item.title)).toEqual(['Algorithms', 'Database Systems', '茶 und Kultur']);
  });

  it('parses header-labelled spreadsheet rows in any column order', () => {
    const rows = parseQuickCourseLines('Code\tTitle\tSemester\tECTS\tCategory\nIN2000\tAlgorithms\t2\t6\tComputer Science', defaults);
    expect(rows[0]).toMatchObject({ title: 'Algorithms', code: 'IN2000', semester: '2', ects: '6', category: 'Computer Science' });
  });

  it('parses simple separated rows and recognises code-first data', () => {
    expect(parseQuickCourseLines('IN2000 | Algorithms | 6 | 2\nDatabases;IN3000;5;3;Core', defaults)).toMatchObject([
      { title: 'Algorithms', code: 'IN2000', ects: '6', semester: '2' },
      { title: 'Databases', code: 'IN3000', ects: '5', semester: '3' },
    ]);
  });

  it('applies defaults when fields are missing', () => {
    expect(parseQuickCourseLines('Statistics', { ects: '6', semester: '3', category: 'Elective' })[0]).toMatchObject({ ects: '6', semester: '3', category: 'Elective' });
  });

  it('flags duplicates in the current plan and within the batch', () => {
    const drafts = parseQuickCourseLines('Algorithms\nAlgorithms\nDatabases\tIN3000\nOther\tIN3000', defaults);
    expect(getQuickCourseDuplicateFlags(drafts, [{ title: 'Algorithms', code: 'IN2000' }])).toEqual([
      { existing: true, batch: false },
      { existing: true, batch: true },
      { existing: false, batch: false },
      { existing: false, batch: true },
    ]);
  });
});
