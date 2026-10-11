# Request 010: Major usability and mobile-first workflow refresh

## Problem
The planner has many capabilities, but a student entering or arranging around 35 courses has to repeat too many small interactions. The desktop-first semester board also makes the main workflow awkward on narrow screens. A long course form is useful for editing a single course, but it should not be the default way to enter a whole curriculum.

## Goal
Reduce repetitive setup work dramatically while preserving every existing capability and all saved data. Prioritize high-leverage batch operations, fast keyboard/touch interactions, clear defaults, progressive disclosure, and mobile layouts that do not require precision dragging or excessive horizontal scrolling.

## UX principles
- Most courses need only a title, ECTS, and perhaps a planned semester to get started. Code, category, description, grade, and source evidence remain optional.
- Repeated data is entered once as defaults or pasted in batches, not once per course.
- Bulk operations always preview what will change; duplicate detection is visible and never silently overwrites existing courses.
- Drag and drop is an enhancement, never the only way to act.
- Keep existing Plan, Map, List, Schedule, import/export, electives, dependencies, grades, progress, availability and timetable conflict handling.
- On phones, controls must be touch-sized, text must wrap, and essential actions must remain reachable without precision gestures.

## Implementation plan
1. **Fast batch course entry**
   - Add a “Quick add many” workflow alongside the detailed single-course editor and curriculum importer.
   - Accept one course per line; support plain titles and common pasted tab/comma/semicolon/pipe-separated rows with title, code, ECTS, semester, and category where supplied.
   - Provide reusable defaults for ECTS/category/semester, an editable preview, row-level validation, and duplicate warnings against existing courses and within the batch.
   - Add all selected courses in one action; preserve the official/recommended semester as distinct from the student's planned semester and never create dependencies or requirement groups from guesses.
2. **Reduce repetitive planning interactions**
   - Keep one-step semester movement controls available alongside drag-and-drop.
   - Add search focus shortcut and visible clear-search/filter affordances where they improve repeated use.
   - Make empty states point to the fastest next action (paste many courses, import curriculum, or add one course).
   - Ensure batch actions preserve all unrelated module fields and plan metadata.
3. **Mobile and responsive pass**
   - Fix header/action wrapping, toolbar layout, touch target sizing, modal dimensions, table overflow, and long text wrapping.
   - Replace cramped multi-column Kanban on phones with a usable swipeable semester board and visible scroll cues; keep keyboard/select alternatives.
   - Ensure course selection/editing, filters, import, schedule, dependency management, electives, and dialogs work at 320px–760px.
   - Respect reduced-motion preferences and focus visibility.
4. **Verification**
   - Add parser and duplicate-detection tests for blank lines, different separators, optional fields, invalid ECTS/semester, repeated courses, and Unicode titles.
   - Run the complete CI pipeline: type-check, production build, unit tests, Pages artifact and deployment.
   - Review changes for preservation of existing schedule/elective/dependency semantics; update the knowledge base and this request with evidence-backed status.

## Acceptance criteria
- A user can add 35 course titles by pasting a list and confirming one preview, without opening 35 individual forms.
- Pasted spreadsheet rows retain the fields that can be safely identified; missing fields use explicit defaults and remain editable.
- Existing and in-batch duplicates are flagged before commit, not silently overwritten.
- No import path silently invents prerequisite edges, requirement groups, official semesters, or timetable dates.
- The detailed single-course editor and every existing workspace remain available.
- Mobile layouts avoid page-level horizontal overflow at 320px and preserve usable touch controls; Kanban columns can be reached without dragging cards.
- Automated checks pass and the Pages deployment workflow succeeds before calling the work complete.

## Status
Planning complete; implementation in progress.
