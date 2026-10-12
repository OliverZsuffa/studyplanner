# Request 014: Consistent course editing, replanning, and timetable drag targets

## Status

Implementation committed on `feat/unified-course-editing-and-drag-targets`. TypeScript/build and unit-test workflow passed on commit `6bb2faf90c10a49041cd22afc4c9bde096ec12d0` in [GitHub Actions run #38248411061](https://github.com/OliverZsuffa/studyplanner/actions/runs/38248411061). The post-merge Pages build and deployment succeeded in [GitHub Actions run #38248597927](https://github.com/OliverZsuffa/studyplanner/actions/runs/38248597927). A live browser smoke test has not been performed.

## User problems addressed

1. Course properties were not consistently available between the course details panel and the edit dialog.
2. Semester-specific planning considered unplanned courses only, making deliberate replanning of existing assignments cumbersome.
3. The timetable did not reveal all possible placements while a course session was being dragged.

## Implementation

### Consistent course editing

- Added course recommendation, seasonal availability, and prior-study completion to the shared Add/Edit Course dialog, alongside the existing planned semester, personal recommended semester, progress, result, grade, description, category, ECTS, and personal recommended semester fields.
- Course details continue to open this same editor. Teaching components and exams remain available from the course-context scheduling editor rather than duplicating a second scheduling form.
- The editor now checks semester assignment changes against season availability and required-prerequisite ordering before saving.

### Replanning courses

- Added an opt-in checkbox, “Include courses already planned elsewhere”, to the semester planning workflow.
- Added the shared `getSemesterPlanningCandidates` model helper. By default it returns only unplanned courses. When enabled, it additionally includes courses assigned to a different semester, while leaving courses already in the target semester out of the move list.
- Candidate rows show the current semester and proposed move. Ineligible candidates display their blocking reason.
- Confirmation reports additions and moves separately. No planned assignment changes until the user confirms.
- Required prerequisite order and seasonal availability are checked. A move that would put a prerequisite in the same or a later semester than its dependent is shown as blocked.

### Timetable drag targets

- Timetable session cards can be dragged.
- During dragging, saved alternatives for that component are shown at their actual weekday and time in the timetable as drop targets. Valid targets are green and blocked targets are red.
- Drop targets are created only from saved alternatives. The drop handler calls the existing alternative-selection validation, including explicit date-range, time-range, and clash checks.
- The existing alternative selector and buttons remain available for users who do not want to drag.

## Tests added

- Default planning candidates include unplanned courses only.
- Enabling the option includes courses planned in a different semester but not courses already in the target semester.
- Candidate previews report the existing semester without changing the plan.
- Moving a prerequisite into the same semester as its dependent is blocked.

## Verification and release

- CI result: passed. TypeScript check, production build, unit tests, and Pages artifact upload succeeded in [run #38248411061](https://github.com/OliverZsuffa/studyplanner/actions/runs/38248411061).
- Pages deployment: succeeded in [run #38248597927](https://github.com/OliverZsuffa/studyplanner/actions/runs/38248597927).
- Live browser smoke test: not performed in this environment.
- Live browser smoke test: not yet performed.
