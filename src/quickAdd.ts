export interface QuickCourseDraft {
  key: string;
  title: string;
  code: string;
  ects: string;
  semester: string;
  category: string;
}

export interface QuickCourseDuplicate {
  existing: boolean;
  batch: boolean;
}

const CODE_LIKE = /^(?=.*[A-Z])(?=.*\\d)[A-Z0-9][A-Z0-9._/-]{2,}$/i;

function separatorFor(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes("|")) return "|";
  if (line.includes(";")) return ";";
  if (line.includes(",")) return ",";
  return null;
}

function headerField(value: string): keyof Omit<QuickCourseDraft, 'key'> | null {
  const normalized = value.toLowerCase().trim().replace(/[._-]+/g, ' ');
  if (/^(title|course|course title|module|module title|name|subject|veranstaltung|modul)$/.test(normalized)) return 'title';
  if (/^(code|module code|course code|id|kennung|modulnummer)$/.test(normalized)) return 'code';
  if (/^(ects|credits|credit points|lp|leistungspunkte)$/.test(normalized)) return 'ects';
  if (/^(semester|planned semester|term|fachsemester)$/.test(normalized)) return 'semester';
  if (/^(category|type|area|kategorie|bereich)$/.test(normalized)) return 'category';
  return null;
}

export function parseQuickCourseLines(text: string, defaults: { ects: string; semester: string; category: string }): QuickCourseDraft[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const firstSeparator = separatorFor(lines[0]);
  const firstFields = firstSeparator ? lines[0].split(firstSeparator).map((part) => part.trim()) : [];
  const headerMap = firstFields.length > 1 ? firstFields.map(headerField) : [];
  const hasHeader = headerMap.some((field) => field === 'title') && headerMap.some((field) => field === 'ects' || field === 'code' || field === 'semester');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const mapHeader = hasHeader ? headerMap : null;

  return dataLines.map((line, index) => {
    const separator = separatorFor(line);
    const fields = separator ? line.split(separator).map((part) => part.trim()) : [line];
    const draft: QuickCourseDraft = {
      key: `quick-${index}-${line.toLowerCase()}`,
      title: fields[0] ?? '',
      code: '',
      ects: defaults.ects,
      semester: defaults.semester,
      category: defaults.category,
    };
    if (mapHeader) {
      mapHeader.forEach((field, fieldIndex) => {
        if (field && fields[fieldIndex] !== undefined && fields[fieldIndex] !== '') draft[field] = fields[fieldIndex];
      });
    } else if (fields.length > 1) {
      const codeFirst = CODE_LIKE.test(fields[0]) && !/^\d+(?:[.,]\d+)?$/.test(fields[0]);
      draft.title = codeFirst ? (fields[1] ?? '') : fields[0];
      draft.code = codeFirst ? fields[0] : (fields[1] ?? '');
      if (fields[2] !== undefined && fields[2] !== '') draft.ects = fields[2];
      if (fields[3] !== undefined && fields[3] !== '') draft.semester = fields[3];
      if (fields[4] !== undefined && fields[4] !== '') draft.category = fields[4];
    }
    draft.title = draft.title.trim();
    draft.code = draft.code.trim();
    draft.ects = draft.ects.trim();
    draft.semester = draft.semester.trim();
    draft.category = draft.category.trim() || defaults.category;
    return draft;
  }).filter((draft) => draft.title.length > 0);
}

export function getQuickCourseDuplicateFlags(
  drafts: QuickCourseDraft[],
  existing: Array<{ title: string; code: string }>,
): QuickCourseDuplicate[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const existingTitles = new Set(existing.map((module) => normalize(module.title)).filter(Boolean));
  const existingCodes = new Set(existing.map((module) => normalize(module.code)).filter(Boolean));
  const seenTitles = new Set<string>();
  const seenCodes = new Set<string>();
  return drafts.map((draft) => {
    const title = normalize(draft.title);
    const code = normalize(draft.code);
    const existingDuplicate = (!!title && existingTitles.has(title)) || (!!code && existingCodes.has(code));
    const batchDuplicate = (!!title && seenTitles.has(title)) || (!!code && seenCodes.has(code));
    if (title) seenTitles.add(title);
    if (code) seenCodes.add(code);
    return { existing: existingDuplicate, batch: batchDuplicate };
  });
}
