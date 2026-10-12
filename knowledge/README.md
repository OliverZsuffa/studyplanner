# Knowledge base

Read this file and the relevant linked notes before creating a new implementation plan.

## Product
Studyplanner turns a study programme into a personal, interactive module plan. The semester Kanban is the primary planning workspace; the dependency graph remains available to explore relationships, and the list view provides a compact alternative.

## Non-negotiable domain rule
Never conflate formal examination prerequisites with recommended prior knowledge. Every relationship must have a type and a source. AI-generated relationships are suggestions until a human confirms them.

## First release
Client-only React + TypeScript app, hosted on GitHub Pages. No account or backend is needed for the first useful version. Store personal progress locally and provide JSON export/import.

## Initial example
Use a clearly labelled illustrative curriculum for the first experience. Do not present inferred module details as official or verified TUM facts. Replace the example with a verified dataset when the user supplies or approves one.

## Architecture decisions
- Vite, React, TypeScript.
- React Flow for the graph.
- Plain localStorage for local persistence in the prototype.
- JSON file import/export for portability.
- GitHub Actions builds and deploys the Vite output to GitHub Pages.
- Keep data types and availability logic separate from UI components as the app grows.

## Working process
1. Read this knowledge base and relevant existing request documents.
2. Write a Markdown implementation plan in requests/.
3. If clarification is required, create a separate compact Markdown document in requests/questions/.
4. Wait for explicit approval before implementing ordinary requests.
5. On approval, implement, run available tests/build checks, review the diff, and update the knowledge base.
6. Record outcomes and remaining work in the request document.
7. This initial product discovery request is the one-time exception: the user explicitly authorised documenting and implementing the first complete-feeling prototype without waiting for a separate approval.

## Testing and honesty
Report only tests actually run. A configured GitHub Actions workflow is not proof that it has passed. Verify the deployed Pages URL and workflow status before claiming the live site works.

## Deployment debugging
- The initial build blockers were addressed by removing the unused `updateSelected` helper and separating Vite's production configuration from Vitest's test configuration. Verification is tracked in request 001.

## Curriculum import

The curriculum import workflow is implemented in `src/ImportWizard.tsx` and `src/curriculumImport.ts`. It extracts selectable-text PDF pages locally with PDF.js, parses pasted/TXT text heuristically, and stages editable module candidates for review. The AI extraction prompt explicitly preserves each stated elective/subject-area requirement even if no options are found; empty groups remain editable and show a non-blocking warning. Elective requirement groups store their possible modules separately from planned selections; only selected options count toward ECTS workload. The wizard generates a provider-neutral prerequisite-analysis prompt, validates pasted JSON responses, and requires users to select AI-suggested relationships explicitly. Formal AI prerequisite claims require evidence or a source URL; recommendations remain non-blocking. No API key, AI API call, or backend is used. Scanned PDFs/OCR and arbitrary URL scraping remain unsupported. Treat parser output and AI analysis as unverified until checked by the student.

## Current implementation state
The prototype includes a semester Kanban with drag-and-drop plus an accessible semester selector, a React Flow dependency map, and list view. The views share the same plan state. Course creation and editing use one form; semester workload and an ECTS-weighted grade average are shown. LocalStorage persistence, JSON import/export, progress statuses, and dark mode are supported. The current sample is illustrative and only uses recommended links, because verified official prerequisites have not yet been supplied. The Pages workflow builds and tests the app before deploying; check the Actions run and live URL before saying the deployment is ready.


## Curriculum extraction and semester semantics (Request 004)
- The recommended import path is a provider-neutral AI prompt plus pasted JSON review. The browser does not upload curriculum documents or fetch arbitrary URLs for the user.
- The AI extraction schema is `studyplanner-curriculum/v1`; prerequisite analysis remains a separate flow using `studyplanner-prerequisites/v1`.
- Official study-plan semester (`recommendedSemester`) and the student's personal semester (`plannedSemester`) are distinct. Legacy `semester` values migrate to personal planned semester only; they are not treated as official recommendations.
- The local text parser is a fallback and leaves semester unknown rather than defaulting to semester 1.
- Formal availability checks only required dependencies. Next-step recommendations exclude a module when any known required or recommended predecessor remains incomplete.


## Planning UX (Request 005)
- The Kanban board is the default planning view, with semester columns and an unplanned column. Moving a card updates the student's `plannedSemester` and legacy `semester` field only; `recommendedSemester` remains unchanged.
- The graph remains a separate freely draggable dependency view. Relationship kinds remain visually distinct and the graph is not used to infer the student's planned semester.
- Module creation/editing uses a shared form. Weighted grade average includes only selected/countable modules marked passed with a numeric grade from 1.0 through 4.0 and positive ECTS; failed, ungraded, invalid-grade, and unselected elective alternatives are excluded.
- The progress denominator and total ECTS exclude unselected alternatives in elective groups.
- Request 005 adds regression tests for empty elective option lists, distinct groups, weighted grade averages, and elective workload. Check the PR's GitHub Actions status before treating tests/build as verified.


## Elective selection and module recommendation state (Request 006)

- Requirement-group alternatives remain in the plan data, but only modules selected in every requirement group that references them are counted and shown in the Kanban, dependency graph, and list. Modules outside all requirement groups remain visible by default.
- The Electives & requirements panel is the explicit choice interface. It shows each option, current selection, selected ECTS/count, target status, and disabled reasons for selections that would exceed exact/max ECTS or module-count limits.
- `one-from-each` is explicitly marked as needing review because the current requirement-group schema does not represent its separate subgroups. It is not guessed or silently treated as an ordinary ECTS group.
- `ModuleStatus` remains progress only (`not-started`, `in-progress`, `completed`). `recommendation` is a separate optional field (`not-reviewed`, `recommended`, `strongly-recommended`); legacy plans migrate to `not-reviewed`. Recommendation does not affect progress, ECTS, grade averages, or elective selection.
- Recommendation labels accompany colours across graph nodes, Kanban cards, list rows, and module details. Dark-mode styles are provided.
- Required dependency warnings identify unfinished predecessors for planned modules and required relationships whose known semester order is same/later. Recommended relationships are not presented as formal blockers.
- Overlapping requirement-group membership counts a module only when it is selected in every group that references it; the choice panel calls this out. The module's ECTS is counted once because plan totals iterate modules, not group memberships.
- Request 006's unit tests cover exact ECTS boundaries, unselected alternative visibility/accounting, overlapping groups, legacy recommendation migration, and unsupported `one-from-each`. GitHub Actions run [#72](https://github.com/OliverZsuffa/studyplanner/actions/runs/38165253379) passed the type-check/production build, unit tests, and Pages artifact upload. After merge, main workflow run [#73](https://github.com/OliverZsuffa/studyplanner/actions/runs/38165311407) also completed successfully, including the GitHub Pages deploy job. The web-fetch environment could not independently open the published Pages URL, so the workflow's deployment success is verified but a separate browser smoke test remains unconfirmed.


## Usability refresh (Request 007)

- Added a direct workflow for linking an existing course to an elective/choice group from the course details panel. First tick the group to add the course as an option; then tick “Plan to take” to select it. The Electives & requirements section explains when a group has no linked courses.
- Elective groups and the how-to guide are collapsible. The course details panel can be collapsed while keeping its header and course title visible.
- Source evidence, optional personal recommendation, and prerequisite/connection details are tucked into disclosure sections instead of being shown all at once.
- Recommendation is optional personal guidance, not an official evaluation. “No recommendation set” is the default meaning; neutral recommendation pills are hidden to reduce noise.
- Added explicit progress colours for not started, in progress, and completed, with separate high-contrast dark-mode colours. Import form fields and table cells receive explicit foreground, background, border, and placeholder colours in both themes.
- Build and test status must be checked in the Request 007 GitHub Actions run before considering this refresh verified.


## Guided onboarding and plain-language UX (Request 008)

- A five-step first-run guided tour introduces the overview, electives, semester planning, and course details. It can be skipped, resumed through the top-bar “Guided tour” button, and is marked seen in local browser storage after dismissal.
- Added concise plain-language descriptions that change with Plan / Map / List views and explained that local browser storage does not sync between devices.
- Elective help now explains the exact path for adding a missing course; recommendation states are not shown as “Not reviewed” noise in elective options, Kanban cards, or list rows.
- Renamed “Add module” to “Add course” and clarified the progress and planned-semester labels. No existing planning, import/export, dependency, or grading capabilities were removed.
- Check Request 008's GitHub Actions build/test and deployment status before claiming it is live.


## Scheduling workspace (Request 009)

- The plan model now stores a global starting term, per-course availability, teaching components, alternative weekly slots, per-slot online availability, and multiple exams. Older plans migrate to availability “both”, empty component/exam lists, and no starting term; this does not invent dates.
- Planned-semester labels can be mapped to winter/summer terms from the configured starting term. A course offered only in the opposite season is blocked from new assignments through the Kanban move selector, course details, and scheduling editor. Existing incompatible placements are surfaced for review rather than silently moved.
- The Schedule workspace contains course session editing, a semester timetable, a month/list calendar, and dependency management. Components have explicit teaching date ranges and a fixed type list. The calendar creates weekly events only for the chosen alternative inside that date range, and separately marks component start/end dates and explicit exam dates.
- Timetable alternative changes are validated against other selected sessions in the same planned semester, including shared weekdays in overlapping date ranges. The editor refuses a clash and explains which sessions overlap. Alternative selection is also available as a normal select control rather than requiring drag-and-drop.
- Dependency management supports creating, editing, and deleting directed hard/soft connections. Hard connections are purple solid edges; soft connections are dotted. Manually entered hard dependencies are marked uncertain unless supported with evidence.
- JSON export serializes the full plan object, so these new fields travel with the existing progress, grades, elective choices, recommendations and dependencies. JSON import passes through the shared migration function.
- Request 009's scheduling helper tests cover semester mapping, seasonal availability, legacy migration defaults, time/date overlap, schedule conflicts, and teaching/exam calendar events. GitHub Actions run [#88](https://github.com/OliverZsuffa/studyplanner/actions/runs/38174710899) passed the TypeScript check/production build, unit tests, and Pages artifact upload. Post-merge Pages deployment and a live browser smoke test still need verification.


## Major usability and mobile refresh (Request 010)

- `Quick add many` supports pasting plain course lists or separated/header-labelled spreadsheet rows, setting ECTS/category/semester defaults once, editing a review table, and adding multiple courses in one action.
- Duplicate titles/codes against the current plan or within the pasted batch are flagged and unchecked by default; they are never overwritten silently. The batch workflow creates course records only and does not infer dependencies, elective requirements, official semesters, or teaching dates.
- Parser tests cover plain lists, blank lines, header-based column mapping, code-first rows, defaults, punctuation, and duplicate detection.
- `Ctrl/⌘+K` focuses course search; Escape closes the active dialog.
- Mobile CSS uses touch-sized controls, a swipeable semester board, responsive filters/actions, full-width bottom-sheet-style forms, safe-area spacing, and reduced-motion handling. Drag-and-drop remains optional; semester selects are retained.
- Existing Plan/Map/List/Schedule workspaces, JSON portability, import/export, electives, prerequisites, grades, course availability, calendar, exams, and timetable conflict validation remain in place.
- Verification is tracked in Request 010 and PR #9. The feature is not considered complete/live until the current branch's TypeScript/build/test workflow and the post-merge Pages deployment both succeed. A real-device/browser smoke test remains a separate check if no browser test environment is available.


## Semester planning and dependency map (Request 011)

- Course availability filters distinguish winter, summer, and courses offered in both seasons. They use explicit availability and never infer a season from the official recommended semester.
- Semester planning is a step-by-step workflow: for a chosen semester, the course picker lists every unplanned visible course, preselects courses eligible by season and required prerequisites, and lets the student select a subset before adding. Recommended semester is editable per course and is distinct from the official source semester; a user recommendation overrides the official value for bulk assignment. Required prerequisites assigned to earlier planned semesters are assumed passed for later-semester eligibility, without changing actual completion status. Recommended relationships are guidance, not formal blockers. Reset clears only planned semester assignments; applying recommended semesters fills only unplanned courses; exclusions remain visible with reasons. Applying recommended semesters also reports each course that could not be assigned and why.
- A course completed through prior studies remains part of the degree's total ECTS and completed ECTS, but is excluded from the workload still to complete in its assigned semester. Legacy plans default this flag to false, and it is retained in the existing full-object JSON persistence/export path.
- Dependency editing is located in Map. The graph layers courses by dependency depth, uses repeated alternating barycentric ordering passes and generous vertical spacing to reduce crossings, avoids repeating relationship labels on every edge, gives edges separate smooth-step offsets, displays seasonal availability, highlights selected-course connections, and puts unresolved cyclic components in a clearly flagged final layer.
- Request 011 implementation is tracked in [PR #11](https://github.com/OliverZsuffa/studyplanner/pull/11). Only report the work as complete after the latest build and tests pass, the PR is merged, and the Pages deployment and live site are verified.

- Validation feedback must be semantic and persistent where useful: impossible season or prerequisite-order placements are errors, highlighted red on affected courses and described in a collapsible error list. Never warn merely because a prerequisite is not yet completed. Valid drop targets are green, invalid targets red. Keep dense controls and secondary course details collapsible.
