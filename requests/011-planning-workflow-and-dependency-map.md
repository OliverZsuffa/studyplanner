# Request 011: Semester planning and dependency map improvements

## Problem and goal

Make semester planning faster and more consistent, distinguish courses completed before the current degree plan from courses completed during it, and make dependency relationships easier to follow. Preserve existing course data, electives, grades, schedule information, dependency semantics, and JSON portability.

## Confirmed decisions

1. Wintersemester and Sommersemester filters should appear wherever useful for selecting, inspecting, or planning courses. Use explicit course availability and the configured starting term. Never infer availability from recommended semester.
2. Move dependency creation, editing, and deletion from Schedule to Map, beside the dependency graph.
3. Reset plan clears only each course's personal planned semester. Preserve all other data. Ask for confirmation.
4. Applying recommended semesters fills only courses that are currently unplanned. Never overwrite existing assignments or change completion state. Respect season compatibility and eligibility, and explain skipped courses.
5. Add an explicit completion-through-prior-studies flag. Such a course remains completed and contributes to total degree ECTS, completed ECTS, and completed-course count. Its ECTS must not appear as workload still to complete in its assigned semester. Example: if S1 contains 50 ECTS including a 12 ECTS course already completed before this plan, S1 workload to complete is 38 ECTS. The course remains part of the degree's total ECTS. Normal completion during the planned degree remains distinguishable.
6. For a selected target semester, list every unplanned visible course, not only courses with an official recommended semester. Preselect eligible courses and let the student add all or choose a subset. Show excluded courses and reasons. A required predecessor planned in an earlier semester is assumed successfully completed for future-semester eligibility, without changing actual progress. Recommended relationships remain guidance and do not block planning.
7. Lay out Map by dependency depth, not planned semester. Courses with no predecessors start at the left, and dependants appear in later columns. Show availability on each card. Selecting a course highlights its incoming and outgoing edges and adjacent courses, while unrelated edges are de-emphasized where practical. Minimize crossings and overlap, handle cycles predictably, and retain usable pan, zoom, fit-to-view, selection, and mobile controls.

## Implementation plan

### 1. Inspect shared semantics
- Trace model migrations, eligibility rules, season mapping, workload calculations, elective visibility, graph generation, and all course selection surfaces.
- Implement shared pure helpers for seasonal compatibility, eligibility, recommended-semester assignment, and ECTS accounting where appropriate.
- Keep official recommended semester distinct from personal planned semester.

### 2. Prior-study completion and ECTS
- Add a migration-safe optional field that distinguishes prior-study completion from ordinary completion.
- Add a clear control in course details. Ensure the flag cannot remain set on a course that is not completed.
- Audit ECTS summaries and labels. Degree total ECTS includes all selected curriculum requirements. Prior-study courses count as completed, but are excluded from the ECTS workload still to complete in their assigned semester. Count each course only once and preserve elective selection rules.
- Preserve the flag through local storage and JSON import/export. Add regression tests for legacy plans, migration, overall totals, completed totals, and per-semester workload.

### 3. Semester planning actions and filters
- Add a confirmed reset that clears only planned-semester assignments.
- Add an action to fill recommended semesters for unplanned courses only. Report courses skipped due to availability or eligibility.
- For a chosen semester, preview recommended courses that match it and can currently be taken, then add them in one action.
- Add an individual selector for additional compatible courses, filtering by season and unmet dependencies. Exclude courses already assigned to the target semester and avoid misleading options such as already completed courses.
- Add winter and summer filters wherever they materially help course selection. Preserve all unrelated module fields, existing sessions, and schedule conflict checks.

### 4. Move dependency editing
- Reuse the current dependency editor in Map, preserving relationship types, duplicate checks, provenance, notes, and evidence handling.
- Remove dependency editing from Schedule while retaining teaching sessions, timetable, calendar, and exam features.
- Ensure all actions work without requiring graph dragging.

### 5. Dependency map
- Compute graph layers from dependency depth, independent of planned semester. Place a course after its acyclic predecessors and show it only once when it has multiple predecessors.
- Use repeated alternating barycentric ordering passes, sufficient vertical spacing, unlabelled edges, and separate smooth-step offsets to reduce crossings and visual clutter. Preserve distinct styling for required and recommended connections.
- Detect cycles or cyclic components and place them predictably with a clear explanation.
- Show winter, summer, or both availability on each card.
- Selecting a card highlights incoming and outgoing connections and neighbouring cards. De-emphasize unrelated connections without making them unreadable. Clearing selection restores the normal graph.
- Preserve pan, zoom, fit-to-view, course details, progress and recommendation indicators, and mobile usability.

### 6. Verification and documentation
- Test seasonal compatibility, dependency eligibility, reset, fill-only-unplanned behavior, bulk course selection, prior-study migration and accounting, dependency depth, multiple predecessors, cycles, and edge highlighting where practical.
- Run the full test suite and production build. Review the diff for regressions to electives, schedule conflicts, grades, progress, imports/exports, and saved assignments.
- Update the knowledge base and this request with implementation details and actual verification results. Verify GitHub Actions and deployment separately.

## Acceptance criteria

- Seasonal filters are available throughout relevant selection and planning workflows.
- Dependency editing is in Map, not Schedule.
- Reset changes only planned-semester assignments and requires confirmation.
- Applying recommended semesters never overwrites existing assignments.
- Prior-study ECTS count toward the degree and completed totals, but not the workload still to complete in the assigned semester.
- Bulk recommended course addition is previewable and excludes incompatible or ineligible courses with reasons. Additional courses are selected individually.
- The graph is layered by dependency depth, shows season availability, highlights selected-course relationships, reduces edge overlap, and handles cycles and multiple predecessors.
- Existing saved plans and JSON files continue to load without losing unrelated data.
- Tests and production build pass before the request is marked implemented.

## Status

Implemented and merged in [PR #11](https://github.com/OliverZsuffa/studyplanner/pull/11) and [PR #12](https://github.com/OliverZsuffa/studyplanner/pull/12). The final main-branch workflow succeeded in [run #38228244065](https://github.com/OliverZsuffa/studyplanner/actions/runs/38228244065), including TypeScript checking, production build, unit tests, Pages artifact upload, and GitHub Pages deployment. The dependency editor is in Map, semester planning previews eligible courses and explains exclusions, and prior-study ECTS are excluded from semester workload while retained in overall degree progress.
