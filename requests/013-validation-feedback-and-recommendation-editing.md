# Request 013: Editable recommendations and clear planning validation

## Goals
Make recommended semester values editable, provide direct visual feedback for invalid placements, surface only actionable planning errors, and reduce interface clutter.

## Changes
- Add editable recommended semester controls to both the course detail panel and Edit Course modal. The value remains distinct from the student's actual planned semester.
- Validate season compatibility and recorded required-prerequisite ordering before changing a course's semester.
- During drag and drop, highlight a valid target in green and an invalid target in red with a specific explanation.
- Change notifications to semantic success, info, and error states. Errors must be red, not green.
- Replace vague prerequisite completion warnings with a collapsible list of actual contradictions: a required prerequisite is planned in the same or a later semester, or a planned course is offered in the wrong season.
- Mark affected course cards and show a compact collapsible error summary.
- Preserve collapsible course detail sections and improve small interaction cues.

## Acceptance criteria
- A student can set, change, or clear a course's recommended semester.
- Invalid season and required-order placements are rejected and explain why.
- Drop targets preview whether a course can be placed there.
- No warning is shown solely because a prerequisite is not yet completed.
- Build and tests pass and Pages deploys successfully.
