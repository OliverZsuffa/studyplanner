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
