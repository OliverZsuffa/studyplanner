# Request 005: Improve planning UX and make curriculum import reliable

## Problem

The planner currently makes users move between controls that belong together. Semester planning is not as direct as it should be, and the graph is useful for understanding dependencies but is not the clearest place to arrange a personal semester plan. Course creation/editing and the import/review workflow should also feel more coherent.

Separately, AI-assisted curriculum import can extract individual modules but fail to represent an elective requirement as a separate rule. A curriculum can look plausible while omitting a requirement such as a statistics elective. A requirement may also be explicit even when the source does not list all candidate modules.

## Goal

Make the planner easier to understand and operate by providing a semester-first Kanban planning view, clearer course management, and more coherent progress/ECTS information while retaining the graph as a dependency visualization. Improve curriculum extraction and review so that requirements, options, and uncertainty are preserved.

Treat this as one coordinated UX and reliability improvement. Keep the client-only architecture and existing curriculum data compatible where possible.

## Product decisions and rules

### Planning and navigation

1. **Semester Kanban as the main planning workspace.** Provide semester columns with course cards that users can drag between semesters. Include an unplanned/backlog area so a course need not be assigned immediately.
2. **Keep the dependency graph.** The graph remains available as a separate view for understanding course relationships. Do not remove or replace it with the Kanban board.
3. **Graph layout must not imply semester restrictions.** Users should be able to move graph nodes freely. Semester assignment is planning metadata, not a fixed graph coordinate or a rule that constrains the graph layout.
4. **Make view purpose clear.** Kanban answers “what am I planning to take, and when?”; graph answers “how are these courses connected?” Keep the two views consistent through shared course data.
5. **Group related controls.** Put semester assignment, progress/pass status, grades, and other course-specific actions together rather than scattering them around the page.

### Course management and progress

6. **Simplify add/edit course flows.** Use one coherent, easy-to-scan course form for creating and editing modules. Keep advanced or less frequently used fields out of the way without removing access to them.
7. **Make course relationships legible.** In the graph, make it easier to tell which course cards/nodes are connected and why; show relationship type clearly and preserve the distinction between formal prerequisites and recommended prior knowledge.
8. **Support progress and grades.** Show course completion/pass status and grades where relevant, and calculate a weighted average from valid graded results. Do not treat ungraded, failed, passed-without-grade, or unattempted courses as ordinary numeric grades; document the exact calculation and handle edge cases explicitly.
9. **Plan ECTS per semester.** Show semester ECTS totals and make workload distribution easy to compare. Count only the chosen option from an elective requirement group toward the student's plan, not every alternative.
10. **Dark mode.** Provide a consistent dark appearance across the planner, including graph, cards, forms, dialogs, warnings, and Kanban columns.
11. **Keep planning flexible.** Preserve the distinction between official recommended semester and the user's own planned semester. Users can move modules freely without overwriting the official recommendation.

### Curriculum import and elective reliability

12. **Extract requirements as well as courses.** An explicit compulsory, elective, specialization, or subject-area requirement is a first-class item, not merely a category attached to individual modules.
13. **Do not lose an empty requirement.** If a requirement is explicit but its possible modules are not listed or cannot be identified, emit a requirement group with an empty `moduleCodes` list and explain the gap in `sourceNote` or `warnings`.
14. **Keep distinct groups distinct.** Separate or nested subject areas must not be merged simply because they are part of the same degree or use similar wording.
15. **Separate rules from options.** A group's ECTS/module target is the requirement; its candidate modules are alternatives. The existence of several alternatives does not make all of them compulsory.
16. **Represent only supported rules.** Preserve the rule stated by the source. If the wording cannot confidently be mapped to the supported schema, flag it for review instead of guessing.
17. **Review remains authoritative.** AI output is an unverified draft. The user must be able to inspect and correct requirements before applying the import.
18. **Keep the prompt concise.** Add only high-value instructions to `makeCurriculumExtractionPrompt()`; avoid duplicating existing rules or turning the prompt into a long checklist.

## Scope

### Include

- Add a semester Kanban board as the main planning view, with draggable module cards, semester columns, and an unplanned/backlog area.
- Retain the dependency graph as a separate view, allow free node positioning, and ensure graph positions do not dictate semester assignment.
- Keep graph and Kanban synchronized through the same course/planning state.
- Reorganize navigation and controls so related planning actions are grouped together.
- Simplify and unify module creation/editing, preserving access to all currently supported fields.
- Improve dependency-edge/card readability and keep formal prerequisites distinct from recommendations and uncertain relationships.
- Show per-semester planned ECTS and a clear total, respecting elective-choice semantics.
- Surface completion/pass status and grades; implement and document a weighted grade average with sensible exclusions and tests.
- Add consistent dark mode.
- Tighten the `studyplanner-curriculum/v1` choice-requirement extraction prompt.
- Add actionable review warnings for requirement groups with no linked options and other obvious group inconsistencies that can be detected without guessing.
- Add tests for Kanban moves, view synchronization, semester ECTS, grade calculations, graph positioning semantics, prompt wording, parsing/mapping, and empty-group warnings.
- Add representative synthetic regression fixtures for an elective requirement with multiple options and an explicit requirement whose options are absent.
- Update `knowledge/README.md` and this request with implementation and verification results.

### Exclude

- Removing the dependency graph or forcing graph nodes into fixed semester columns.
- Treating the official recommended semester as the user's personal plan, or vice versa.
- A new AI provider/API integration, backend, or automatic upload of curriculum documents.
- Automatic scraping of arbitrary university URLs or OCR for scanned PDFs.
- Inventing or assuming details of the TUM Wirtschaftsinformatik curriculum. Use an official source supplied/approved for factual TUM-specific fixtures; otherwise keep fixtures clearly synthetic.
- Changing the prerequisite-analysis prompt/schema unless a directly related regression is found.
- Counting all modules in an elective catalogue toward planned ECTS.
- Unnecessary data/schema migrations. Preserve existing saved plans and JSON import/export compatibility where practical; document any migration that proves necessary.

## Implementation plan

Implement in coherent, reviewable stages, all within this request unless repository architecture or test results show that a split is necessary:

1. **Inspect current state.** Read the relevant knowledge/request docs and inspect app components, data model, persistence/migration, graph behavior, import prompt/review UI, and tests. Identify what already exists so the work extends rather than duplicates it.
2. **Plan the shared interaction model.** Confirm how planned semester, progress, grade, elective selection, ECTS, and graph position are represented. Keep academic data separate from view-only graph coordinates.
3. **Build the semester Kanban.** Add semester columns and an unplanned area; support accessible drag/drop and a non-drag alternative for moving courses. Update personal planned semester and persist changes. Keep recommended semester visible as separate reference information.
4. **Unify course management and overview controls.** Simplify add/edit flows; group course-specific controls; improve course-card details, relationship visibility, and navigation between Kanban and graph.
5. **Improve progress, grades, and workload.** Show pass/completion status, grades, weighted average, and semester ECTS totals. Define edge cases before coding and test calculations, including elective alternatives.
6. **Add consistent dark mode.** Ensure both views and all supporting UI use the same theme.
7. **Improve extraction reliability.** Add a short prompt instruction block equivalent to:
   - Extract every explicitly stated compulsory, elective, specialization, and subject-area requirement as well as individual modules.
   - Always emit a `requirementGroups` entry for an explicit elective requirement, even if its options are unknown or absent. In that case use an empty `moduleCodes` array and explain the missing information in `sourceNote` or `warnings`.
   - Keep distinct or nested elective areas separate; do not merge them merely because they belong to the same subject.
   - Distinguish the amount required from the number of available alternatives; do not count every alternative as compulsory.
   - If a stated rule cannot confidently be mapped to the supported schema, flag it for review rather than guessing.
8. **Improve import review and regression coverage.** Preserve empty groups and show a clear, non-blocking warning that permits manual linking. Keep unknown-code warnings. Add normal, missing-options, distinct-groups, unknown-code, and empty-group fixtures/tests.
9. **Verify compatibility and quality.** Run the full available test suite and production build; inspect existing-plan migration and JSON import/export, and review the diff for scope creep, usability, accessibility, and prompt length.
10. **Update documentation and deployment evidence.** Update the knowledge base and this request with actual results. Check the GitHub Actions run and deployed Pages site before claiming the live app is updated.

## Acceptance criteria

### Planning UX

- The semester Kanban is the default/main planning workspace.
- A module can be moved between semester columns and into/out of the unplanned area; the change persists after reload.
- Moving a module changes only the user's planned semester, not the official recommended semester.
- There is a clear way to move modules without drag-and-drop.
- The graph remains available, synchronized with the same modules and planning data, and nodes can be repositioned independently of semester assignment.
- Switching views does not lose edits or progress.
- Add/edit course actions are coherent and the user can still access all existing supported module fields.
- Relationship edges and their meanings are easy to distinguish; formal and recommended relationships remain separate.
- Semester ECTS totals update when modules move and do not double-count elective alternatives.
- Completion/pass status and grades are visible and editable where applicable; weighted average follows documented rules and is covered by tests.
- Dark mode is consistent across both views and the surrounding UI.

### Import reliability

- The extraction prompt concisely instructs the model to preserve explicit elective requirements even when no options are found.
- A requirement with listed alternatives creates one group with the correct supported rule and only those alternatives linked to it.
- Alternative modules are not made compulsory merely because they appear in the same catalogue.
- An explicit requirement with no available option list still produces a group with an empty option list and an explanatory note or warning.
- Distinct elective areas remain separate groups.
- Unknown or fabricated module codes are not silently linked; validation warns about them.
- A group with zero linked options is preserved in review and has a clear, non-blocking warning.
- Users can manually correct the import before applying it.

### Quality and compatibility

- Existing valid `studyplanner-curriculum/v1` responses and saved plans remain compatible, or any necessary migration is documented and tested.
- Tests cover Kanban state changes, persistence/view synchronization, semester and elective ECTS, grade calculations, graph layout semantics, prompt content, normal alternatives, missing option catalogues, distinct groups, unknown codes, and empty-group review warnings.
- Build and all tests pass.
- Deployment is verified before claiming the live site is updated.

## Status

Planning only. No application code has been changed for this request. The scope now includes the previously discussed planning UX and curriculum-import reliability work.
