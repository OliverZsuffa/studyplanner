# Request 012: Sequential semester eligibility and dependency map readability

## Goal
Replace the recommended-semester-only preview with a genuine step-by-step course planner, and make the dependency map easier to read by reducing edge crossings and clutter.

## Decisions
1. For any target semester, show all unplanned visible courses, including courses without an official recommended semester.
2. Preselect all eligible courses, but allow the student to uncheck any before adding. Show ineligible courses with clear reasons.
3. Eligibility checks explicit seasonal availability and formal required dependencies. A required predecessor assigned to an earlier planned semester is assumed successfully completed for eligibility in the target semester. This is a planning assumption only and must not change actual progress or grades.
4. Recommended dependency links are advisory and must not block assignment as if they were formal prerequisites.
5. Keep the existing individual course-add selector as a quick-add path, using the same semester-aware eligibility logic.
6. Improve map layout with alternating barycentric ordering sweeps, more vertical space between nodes, no repeated text labels on every edge, and separate smooth-step edge offsets. Preserve selected-course highlighting and edge-type styling.

## Implementation
- Update the shared assignment blocker to distinguish required from recommended relationships and treat earlier planned semesters as assumed completed.
- Change the semester preview into an all-course checklist with all eligible courses selected by default.
- Add tests for semester-one eligibility, semester-two prerequisite simulation, season compatibility, and advisory relationships.
- Improve dependency map ordering and edge rendering.
- Update knowledge and request documentation.

## Acceptance criteria
- Semester 1 lists courses without unmet required prerequisites and matching seasonal availability.
- Semester 2 unlocks courses whose required predecessors are planned in Semester 1, without marking them completed.
- The picker does not depend on official recommended semester values.
- Students can select all eligible courses or a subset.
- Courses blocked by season or required dependencies explain why.
- The map has less edge and label overlap while retaining clear required/recommended distinction.
- Build, tests, and deployment workflow pass.

## Status
Implemented in [PR #13](https://github.com/OliverZsuffa/studyplanner/pull/13). The initial PR workflow passed type-check/build and unit tests. Final merge and Pages deployment verification are pending.
