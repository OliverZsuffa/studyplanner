# Request 009: Course availability, timetable, academic calendar, and editable dependencies

## Problem

The current planner supports personal semester assignments and a dependency graph, but it cannot represent when courses are offered, the real teaching sessions within a course, alternative tutorial groups, clashes, exams, or a calendar. Dependency connections can be created but are not fully manageable after creation.

The goal is to make the plan usable as a practical semester organiser while preserving the existing curriculum, elective-selection, progress, grade, import, and export features.

## Product rules

### 1. Starting semester and course availability

1. Add a global study-plan starting term consisting of the calendar semester (winter or summer) and calendar year. Use it to label/map the student's numbered planned semesters to winter/summer terms.
2. The starting term is for timeline clarity and semester-availability validation only. **Never infer, calculate, or fabricate a course's teaching start date or end date from the starting term or semester number.** Actual teaching dates are explicitly entered on each course component.
3. Each course has availability: winter only, summer only, or both.
4. A course may not be assigned to a planned semester whose mapped calendar term conflicts with its availability. Prevent the assignment and explain plainly why it is impossible; do not merely show a soft warning.
5. If an existing or imported plan contains a semester assignment that conflicts with newly supplied availability, preserve the user's data but flag the conflict clearly and require correction before treating the plan as valid. Do not silently move the course.
6. Keep the existing distinction between official/recommended curriculum semester and personal planned semester. Do not use the official recommended semester as evidence of actual teaching dates or availability.
7. Define and test the mapping from the global starting term to numbered planned semesters. Do not hard-code a single start year or assume the student always starts in winter.

### 2. Course components and alternative timeslots

Each course may have zero or more components. Use a fixed, user-facing component-type list:
- Lecture
- Tutorial
- Exercise class
- Practical / lab
- Seminar
- Project
- Other

Each component stores:
- stable ID and component type (plus an optional display name where useful, e.g. “Tutorial group”);
- teaching start date and end date, entered by the user;
- one or more alternative weekly timeslots.

Each timeslot alternative stores:
- stable ID;
- weekday;
- start time and end time;
- location (text, allowing a room/building or other location);
- whether that particular timeslot is available online.

A component's weekly times repeat only within its explicitly entered start/end date range. Do not derive or fill in missing date ranges. Validate that the end date is not earlier than the start date and that the end time is after the start time.

Online availability belongs to an individual timeslot, not to the component. Thus two alternatives for the same tutorial can have different online availability and different locations/times.

For each component, the user chooses at most one alternative for the timetable. Keep all alternatives in the course data. Provide a clear way to add, edit, remove, and select alternatives. Where a component has no complete valid schedule, explain that it is not yet schedulable rather than inventing values.

### 3. Timetable and conflict handling

1. Add a timetable view for the selected planned semester. It shows the selected weekly teaching sessions for courses planned in that semester, using each component's entered date range and selected timeslot.
2. Each component with alternatives displays its currently selected alternative. Hovering/focusing a session reveals the other alternatives, including weekday, time, location, and online status. Selecting or dragging to an alternative switches the choice for that component.
3. Support drag-and-drop where practical, but provide an accessible non-drag interaction for the same action (e.g. choosing an alternative from the session details). Keyboard users must be able to change a selection.
4. A change that would create a timetable clash is impossible: refuse the change and display a clear, specific explanation identifying the conflicting sessions/courses and overlapping times. Do not commit the invalid choice and do not silently move another session.
5. Clash detection applies to the selected alternatives for courses assigned to the same planned semester. Two weekly sessions conflict only when their weekdays and times overlap and their explicitly entered teaching date ranges intersect. Sessions with missing/invalid dates must be marked incomplete; do not guess their date range. A session ending exactly when another starts is not an overlap.
6. Do not accept a start time equal to or later than the end time. Do not invent timezone conversions.
7. Timetable semester navigation must be explicit. Changing the displayed semester must not change a course's assignment or selected timeslot.
8. Make the difference between the selected alternative and other available alternatives visually clear. Preserve the selected choice through reloads and JSON export/import.

### 4. Exams and calendar

1. A course can have zero or more exam entries. Each exam has a date and place/location. Support multiple exams for a single course (e.g. midterm and final); an optional human-readable label is useful. Do not require an exam time because the current requirement only specifies date and place.
2. Add a calendar view with two switchable presentations:
   - monthly calendar;
   - chronological list.
3. The calendar includes exam entries and the teaching sessions described by course components. For a component, display its weekly occurrences only within its entered start/end date range and according to the selected timeslot. Include the teaching period's start/end dates clearly (for example, as component details or date markers) so users can see when lectures/tutorials begin and end.
4. Calendar entries identify the course and component type; exam entries identify the exam and location. Clicking an entry should open the relevant course/component details.
5. The list view sorts events chronologically. The monthly view supports navigation between months and clearly handles months with many events. Both views use the same underlying event-generation logic.
6. Do not calculate a course or component's start/end dates from the global starting term. Only explicit component dates create teaching occurrences. An exam appears only on the entered date.
7. If a course has no exam data or a component has incomplete dates, do not fabricate an event. Make missing scheduling information discoverable in the editing UI.

### 5. Dependency graph editing

1. Preserve directed relationships: an edge A → B means the relationship points from A to B; retain the app's current relationship semantics where possible and label the direction clearly in editing UI.
2. Support two relationship types:
   - hard dependency: purple solid line;
   - soft dependency: dotted line.
3. Users can add, select, edit, and delete a connection. Editing includes source, target/direction, type, and any existing provenance/evidence fields that the model supports.
4. The graph must provide an understandable way to select an edge and open its editor/delete action. Confirm destructive deletion where appropriate. Provide keyboard-accessible controls where practical.
5. Keep the domain distinction intact: hard dependencies represent formal requirements only when backed by a source; soft dependencies are recommendations/useful prior knowledge, not formal blockers. Manual creation must not silently claim official evidence. Clearly identify manually entered relationships and allow evidence/source to be recorded where supported.
6. Prevent invalid edges such as a missing endpoint, self-connection, or duplicate relationship if duplicates have no meaningful supported use. Explain validation failures.
7. Preserve graph layout/dragging and all existing course-node interactions.

### 6. Data, migration, and portability

1. Extend the canonical plan data model rather than keeping separate timetable/calendar copies of course data. The timetable and calendar are derived views over the same saved course/component/exam data.
2. Extend the JSON export/import so it includes the global starting term, course availability, all course components, date ranges, all alternative timeslots and online flags, selected alternatives, exams, and full dependency data (direction, type, source/provenance/evidence where present).
3. The core portability requirement is a lossless move between devices: a user can export the JSON, lose or replace the original computer, open StudyPlanner on another device/browser, import the JSON, and resume with the same plan, settings, selections, grades, progress, components, timetable choices, exams, dependencies, and elective selections.
4. Import/export must not rely on browser localStorage being shared across devices. Keep localStorage as the working local save, but make the JSON file the complete portable backup.
5. Version the JSON schema or use a robust migration strategy. Existing exports and localStorage plans must remain usable; missing new fields receive explicit neutral defaults (e.g. availability “both”, no components/exams, no starting term until configured). Do not fabricate schedules or exam data.
6. Validate imported values and give actionable errors/warnings for malformed data. Avoid partial destructive import: validate before replacing the current plan, and explain what will happen.
7. Preserve existing curriculum-import data, requirement groups, selection state, grades, progress, recommendation metadata, planned semester assignments, and relationship evidence during migrations.
8. Keep the app client-only; no backend/account is required for this request.

### 7. General UX and accessibility

- Integrate timetable and calendar into the existing navigation without removing Plan/Kanban, Map/dependency graph, List, course details, electives, grading, or guided tour.
- Make course scheduling fields understandable and manageable from the course editor/details. Group course components and exams so they do not overwhelm the existing basic course metadata.
- Use clear empty states and incomplete-data indicators. A course without components is still a valid course record and must remain usable in the current planner.
- Use consistent visual treatment for online/in-person alternatives, hard/soft dependencies, selected alternatives, and clash errors; never rely on colour alone.
- Support light/dark themes and responsive layouts.
- Add the new views and controls to the guided tour or contextual help.
- Preserve accessibility for keyboard and screen-reader users; drag-and-drop is an enhancement, not the only way to schedule.

## Scope

### Include

- Inspect and extend course/plan/relationship types and localStorage/import/export migrations.
- Add global starting-term setting and pure semester-to-calendar-term mapping.
- Add course availability validation in all relevant assignment flows (Kanban drag, semester selector, course editor, and import/legacy validation).
- Add component CRUD with the fixed component types, explicit date ranges, and alternative timeslots.
- Add pure scheduling helpers for alternative selection, weekly occurrence generation, date-range overlap, and conflict detection.
- Add semester-scoped weekly timetable with alternative switching, drag/drop, and actionable conflict prevention.
- Add multiple exam entries per course.
- Add month/list calendar views combining teaching occurrences and exam dates.
- Add full create/edit/delete workflows for directed hard/soft graph edges, including evidence/provenance preservation.
- Extend JSON export/import and localStorage migrations so the plan remains portable and backwards-compatible.
- Add unit tests for mapping, availability enforcement, session/date validation, alternatives, clashes, occurrence generation, exam events, relationship CRUD/types/direction, and round-trip compatibility.
- Update the knowledge base and this request with actual implementation and verification results.

### Exclude

- Automatically determining course availability, teaching dates, room locations, or exam dates from university data or the starting semester.
- Automatically assigning or moving courses to resolve timetable clashes.
- Treating a soft relationship as a formal prerequisite.
- A backend, login/account, cross-device cloud sync, or third-party calendar integration.
- Generating official curriculum or exam information that the user has not entered.
- Removing or replacing existing planning, electives, import, grading, graph, local save, or export/import features.

## Implementation plan

Because the data model and scheduling logic are shared by several views, implement this in ordered stages with tests before layering on UI.

1. **Repository reconnaissance.** Inspect current types, persistence and JSON import/export, migrations, course form/details, Kanban semester assignment paths, relationship schema and graph edge/node rendering, existing tests, navigation, styling, and guided tour. Identify the smallest backwards-compatible schema change.
2. **Specify shared model and migrations.** Add types for starting term, availability, component, component type, timeslot alternative, selected alternative, and exam. Add relationship type/source editing semantics while preserving existing relationship records. Add versioned or robust migrations and safe defaults for old plans. Define IDs and validation rules centrally.
3. **Implement pure domain helpers first.** Test mapping a numbered planned semester to winter/summer from a configured starting term; validate course availability; validate component dates and times; generate weekly occurrences from explicit ranges; compare date ranges; detect overlapping selected sessions; create calendar event data; and validate relationship endpoints/direction/type. Never derive missing dates.
4. **Enforce semester availability throughout the app.** Update every path that can assign or import a planned semester. Prevent new invalid placements and give a clear explanation. Preserve but flag conflicts in legacy/imported plans rather than silently mutating them.
5. **Build course scheduling editor.** Add component and exam management within course details/editor. Use the fixed type list, allow multiple named alternatives per component, capture weekday/time/location/online for each alternative, and require explicit start/end dates for scheduled occurrences. Keep unscheduled components editable and clearly marked incomplete.
6. **Add timetable view.** Build a semester-scoped weekly grid from selected component alternatives. Add alternative chooser on hover/focus and accessible explicit selection; support drag/drop if compatible with the existing stack. Run conflict checks before committing a choice, reject clashes, and explain the exact conflict. Do not automatically rearrange other sessions.
7. **Add calendar event model and UI.** Generate occurrences only from explicitly dated components and selected alternatives, limited to each component's date range. Combine those with exam-date events. Implement month and chronological-list modes using the same events and course/component navigation.
8. **Complete graph relationship management.** Add clear edge selection/edit/delete UI and editor for source, target, hard/soft type, and supported provenance/evidence. Render hard dependencies as purple solid edges and soft dependencies as dotted edges. Validate self-links, duplicate edges, and missing endpoints.
9. **Complete portability.** Round-trip every new field and existing plan state through JSON. Validate import before replacing current state, migrate old exports safely, and ensure a backup imported into a clean browser reproduces the same plan and all schedule selections. Test both legacy-to-current migration and current-schema export/import.
10. **UX, responsive and accessibility pass.** Integrate navigation and contextual help/tour, design empty/incomplete states, validate light/dark themes, and provide keyboard alternatives to drag-and-drop.
11. **Regression and acceptance tests.** Run unit tests, TypeScript checks, production build, and any configured lint checks. Review changes for accidental feature loss, especially electives, recommendation/progress separation, grade calculations, curriculum import, and existing graph behaviour.
12. **Documentation and release verification.** Update the knowledge base and this request with the resulting schema, domain rules, tests actually run, CI status, merge and deployment state. Check the post-merge Pages workflow before claiming deployment success; do not claim a live browser smoke test unless one was actually performed.

## Acceptance criteria

- The user can set the starting calendar semester/year; it labels planned semester terms and does not generate course start/end dates.
- Course availability is winter, summer, or both; a course cannot be newly assigned to an incompatible term, and the reason is explained. Imported/legacy conflicts are flagged without silent reassignment.
- Each course can contain any number of lecture/tutorial/exercise/practical/seminar/project/other components and multiple exams.
- Each component has an explicit start/end date and one or more weekly alternatives with weekday, start/end time, location, and per-alternative online availability.
- A component's selected alternative persists. The other alternatives are discoverable on hover/focus and can be chosen without requiring drag-and-drop.
- The timetable displays selected sessions for the selected planned semester. An overlapping alternative cannot be selected; a clear conflict message identifies the affected sessions and times. No other session is silently moved.
- Conflict detection accounts for date-range intersection and weekday/time overlap; touching endpoints are not a clash.
- The calendar has month and chronological-list modes and includes teaching occurrences only inside entered date ranges plus exam entries on their explicit dates. It displays course/component, time/location when available, and teaching-period start/end information.
- A course can store multiple exam entries, each with date and place and optional label.
- The graph supports adding, editing, and deleting directed connections, including changing endpoints and hard/soft type. Hard is purple solid; soft is dotted.
- Relationship source/provenance/evidence remains available and manual soft suggestions are never presented as formal requirements.
- Existing Kanban, map, list, electives, grades, progress, import, local save, and guided onboarding continue to work.
- Existing JSON exports still import. New JSON exports include all new and old plan data, and a round-trip into a clean browser restores the same state.
- No teaching dates, exams, locations, or availability facts are invented.
- Tests and production build pass, and the request records the actual CI/deployment state.

## Manual acceptance scenarios

1. Set the starting term to Winter 2026/27. Verify planned semesters map to winter/summer labels in alternating order, but no course/component dates appear unless entered.
2. Set a course to summer-only and try to assign it to a winter term through every assignment UI. Each attempt is blocked with a reason. Import a legacy plan with the same conflict and verify it is flagged, not silently moved.
3. Create Economics I with a lecture and tutorial. Give the lecture a Monday alternative and the tutorial two alternatives with different locations and online flags. Verify only one alternative per component is selected and that choices persist.
4. Enter a component's explicit teaching range and verify weekly occurrences are only generated inside that range, including first/last weeks. Leave dates blank and verify no dates are invented.
5. Select two alternatives that overlap on the same weekday and intersecting date ranges. Verify the conflicting change is rejected and names both sessions. Verify sessions with adjacent endpoints do not clash and sessions with disjoint date ranges do not clash.
6. Hover/focus a timetable session and switch alternatives via both drag/drop and an accessible explicit control. Verify invalid moves do not change saved state.
7. Add two exams to one course. Verify both appear in the month and list calendar views at the correct dates and locations, in chronological order in list mode.
8. Verify calendar teaching occurrences and exam events open the corresponding course details and the calendar mode toggle does not lose navigation state unexpectedly.
9. Create a directed hard edge and a directed soft edge, edit each endpoint/type, and delete each edge. Verify hard/soft appearance, direction, provenance, and graph node dragging still work.
10. Export a populated plan, import it into a fresh browser with no prior local state, and verify starting term, course availability, all components and alternatives, selected choices, exams, dependencies, elective choices, progress, grades, and recommendations match.
11. Import a pre-request JSON backup and verify it remains usable with safe defaults and no fabricated schedule/exam data.
12. Test new screens in light/dark mode, narrow viewport, and keyboard-only navigation.

## Implementation status

Implemented on `feat/009-timetable-calendar-scheduling`:

- Extended the canonical plan schema with starting term, course availability, course components, alternative timeslots, per-timeslot online availability, and multiple exams. Legacy plans migrate with availability “both”, empty schedules/exams, and no starting term.
- Added semester-to-calendar-term mapping and availability checks in Kanban moves, course details, and the scheduling workspace. Existing incompatible placements are reported rather than silently reassigned.
- Added the Schedule workspace with course/component/exam editing, a semester timetable with alternative selection and clash prevention, a monthly/list calendar, and directed dependency CRUD.
- Calendar generation uses only explicit component date ranges and selected weekly slots, and marks teaching-period start/end dates separately. Exams appear only on entered dates.
- Added unit tests for term mapping, availability, migration defaults, time/date overlap, schedule conflicts, and calendar event generation.
- Export/import continue to serialize/migrate the canonical plan object, including the new fields.

## Verification

- GitHub Actions run [#88](https://github.com/OliverZsuffa/studyplanner/actions/runs/38174710899) passed on 2026-10-11: TypeScript check/production build, unit tests, and Pages artifact upload succeeded.
- The PR workflow does not deploy the site; post-merge Pages deployment remains unverified. A live browser smoke test has not been performed.
