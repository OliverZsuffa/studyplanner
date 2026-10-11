# Request 002: Make the Studyplanner intuitive and useful

## Goals
- Make dark mode the default, remember the user's theme preference, and increase contrast.
- Remove fixed semester headings from the draggable graph.
- Make dependency lines and card boundaries easier to see.
- Record a course result and German grade; calculate an ECTS-weighted average from passed, graded courses.
- Show planned ECTS workload and passed ECTS per semester, with editable semester assignments.
- Give new users a compact, actionable starting guide.

## Implementation notes
- Grade/result fields are optional, preserving existing local plans and imports.
- Theme preference is stored separately from plan data.
- Semester is course metadata, not a fixed graph column.
- The grade average is weighted by ECTS; failed and ungraded courses are excluded.
- Earned ECTS count only modules marked as passed.

## Verification
- Production build and unit tests pass in GitHub Actions.
- Deployment must complete before the live link is considered updated.
