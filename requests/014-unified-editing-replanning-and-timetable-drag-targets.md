# Request 014: Consistent course editing, replanning, and timetable drag targets

## Status

Plan drafted. Awaiting explicit approval before implementation, following the repository workflow.

## Problems

1. Course information is editable in different places, but the available fields differ by entry point. For example, selecting a course in the planner does not expose the recommended-semester control, so the user must discover a different editor to change a course property.
2. Semester-specific planning primarily considers unplanned courses. A student cannot conveniently use the same recommendation workflow to move a course that is already assigned to another semester when replanning.
3. Timetable drag-and-drop does not provide the intended direct-manipulation feedback. While dragging a course/session, the user should be able to see every valid destination immediately, rather than having to guess where it can be dropped.

## Goals

- Make course editing consistent and predictable across course details, the edit dialog, and planning/scheduling entry points.
- Preserve one source of truth for course fields and validation.
- Let the user optionally include already planned courses when building a semester plan, so they can deliberately move courses between semesters.
- Make timetable drag-and-drop discoverable, with live highlighting of valid and invalid destinations while an item is being dragged.
- Preserve keyboard, touch, and select-based alternatives. Dragging must not become the only way to edit or schedule.
- Preserve existing data, validations, import/export, and planning behaviour unless the user explicitly changes a value.

## Proposed implementation

### 1. Consistent course editing

- Audit every place where a course can be viewed or edited: course detail panel, Add/Edit Course dialog, semester planner, Plan/Kanban card actions, and Schedule workspace.
- Define a shared set of editable course fields and reuse shared field/editor components or a shared edit dialog rather than maintaining subtly different forms.
- Ensure fields such as planned semester, personal recommended semester, progress, grade/result, availability, description, and scheduling details can be reached from the relevant context without unnecessary navigation.
- Keep official/source recommendation metadata read-only and distinct from the editable personal recommendation and actual planned semester.
- Where a compact contextual view is appropriate, expose a clear “Edit course details” action that opens the same editor. Do not duplicate a partial form that can drift from the main editor.
- Keep teaching sessions and exams editable directly from the course context using the existing scheduling editor, without requiring the user to switch the main workspace.
- Add explicit labels and sensible grouping so core planning fields are easy to find and advanced/source details remain collapsible.

### 2. Replanning courses already assigned to semesters

- Add an explicit option in the semester-planning workflow, such as “Include courses already planned in other semesters”.
- When enabled, include eligible courses currently assigned to a different semester, particularly courses whose personal/official fallback recommendation points to the target semester. Also make the included candidates and their current semester visible, so the user can understand why each appears.
- Show each candidate's current assignment and the proposed target assignment in the preview. Clearly label moves, for example “Move from Semester 3 to Semester 2”.
- Require confirmation before applying changes. The preview should show which courses will be added, which will be moved, and which are excluded with a concrete reason.
- Do not silently move any course. Keep already planned courses untouched when the option is disabled.
- Reuse existing season and required-prerequisite ordering validation for both new assignments and moves. If moving a prerequisite would make another planned course invalid, show the resulting contradiction before confirmation and do not hide it.
- Keep existing behaviour for unplanned courses and individually selectable compatible extras. Preserve the reset action's existing semantics.

### 3. Timetable drag-and-drop with live destinations

- Inspect the current Schedule/timetable components and their drag/drop implementation before changing interactions.
- Support dragging a course teaching session or its selected alternative as a clear draggable item.
- While a drag is active, evaluate the possible timetable destinations continuously and visibly distinguish:
  - valid destinations, highlighted as available;
  - invalid destinations, clearly marked as unavailable with a reason where the UI supports it;
  - the current hover target, with a stronger focus/hover treatment.
- Possible destinations must be grounded in actual saved course component alternatives and the existing schedule grid. Do not invent days, times, rooms, dates, or new alternatives merely to create drop targets.
- Reuse the existing conflict checks, including weekday/time overlap, intersecting explicit teaching date ranges, and same-planned-semester scope. Reject invalid drops and explain the conflict.
- Dropping onto a valid alternative changes only the intended component's selected alternative. It must not silently move other sessions or change the course's planned semester.
- If the intended interaction is to move a session to another semester, treat that as a distinct explicit action and validate course availability and prerequisite ordering as well.
- Keep alternative-selection controls available to keyboard and touch users. Make drag targets large enough to use and do not rely on colour alone.

## Data and compatibility constraints

- Prefer reusing the existing plan schema and scheduling helpers. Add no new persisted field unless the implementation audit proves it is necessary.
- Do not alter the meaning of official recommended semester, personal suggested semester, planned semester, course availability, or selected timeslot.
- Keep existing localStorage plans and JSON import/export compatible.
- Preserve incomplete schedules as incomplete. Never infer actual teaching dates or times from semester labels.
- Preserve Plan, Map, List, Schedule, calendar, electives, dependencies, progress, grades, and prior-study accounting.

## Test plan

- Add tests for shared edit-field wiring or shared editor behaviour where practical, especially personal recommendation, planned semester, availability, progress, grade/result, and scheduling details.
- Test that a course can be edited from its details context without losing existing values and that official source metadata remains unchanged.
- Test semester-planning candidates with the option disabled and enabled, including unplanned courses, courses assigned elsewhere, target-semester recommendations, manual deselection, and exclusion reasons.
- Test that previewing a move does not mutate the plan and that applying it changes only confirmed courses.
- Test moves that violate season availability or required-prerequisite order and ensure they are blocked or explicitly identified before applying.
- Test timetable drag feedback for valid targets, season/semester constraints where relevant, date-range overlap, and time clashes.
- Test valid timetable drops persist the selected alternative and invalid drops leave plan state unchanged.
- Run the repository's unit tests, TypeScript check, production build, and GitHub Actions workflow. Verify the post-merge Pages deployment before claiming it is live.
- Review the final diff for regressions and update the knowledge base and this request with actual test and deployment results.

## Acceptance criteria

- The same course property is not inexplicably editable in one place but missing from another. Contextual views either expose the field or open the shared editor directly.
- A student can edit the personal recommended semester from course details without hunting for a separate dialog, and can reach all core course fields from the same consistent editing experience.
- The semester planner offers a clear opt-in to include already planned courses, displays current and proposed semesters, previews moves, and applies only confirmed changes.
- Existing planned courses are never moved by default or silently.
- During timetable drag, every currently valid destination is visibly highlighted before the drop. Invalid destinations are visibly differentiated, and a drop is validated again before state changes.
- All scheduling decisions use real saved alternatives and existing conflict logic. No times or sessions are fabricated.
- Non-drag controls remain usable, and all existing plan data remains portable.
- Automated checks and deployment are verified and recorded honestly.

## Implementation notes

The first implementation step should map the current editing fields and Schedule drag/drop paths, then consolidate duplicated behaviour before adding new interactions. Avoid a cosmetic-only drag highlight: the visible destination state and the final drop validator must use the same domain rules.
