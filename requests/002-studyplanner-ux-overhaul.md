# Request 002: Make the Studyplanner intuitive and useful

## Goals
- Make dark mode the default, remember the user's theme preference, and increase contrast throughout the interface.
- Replace misleading fixed semester headings above a freely draggable graph with semester labels on cards only.
- Make dependency lines and card boundaries easier to see.
- Let users record a course result (passed/failed) and a German grade.
- Calculate a simple average from courses marked passed that have a grade entered; label it as unweighted.
- Show the planned ECTS workload per semester, passed ECTS, and course count. Allow changing a course's planned semester.
- Simplify the introductory copy and make course editing more discoverable.

## Implementation notes
- Grade/result fields are optional to preserve existing local plans and imports.
- Existing localStorage plans remain compatible because new fields are optional.
- Theme preference is stored separately from plan data.
- The graph keeps semester as course metadata but does not imply fixed columns after dragging.

## Verification
- Build and unit tests must pass in GitHub Actions.
- Check the published site after the deployment completes.
