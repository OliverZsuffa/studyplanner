# Request 007: Make the study planner easier to understand

## Problems reported

- Users cannot tell how to link a newly added course to an existing elective/choice group.
- The page has too many simultaneously visible details and technical explanations.
- The meaning of the module recommendation field is unclear, and “Not reviewed” appears on almost every module.
- Status colours are missing or too subtle, and import inputs/table cells sometimes have poor text contrast.

## Changes

1. Add a visible course-details workflow to link/unlink the selected course to any existing requirement group, then separately mark it as a planned choice.
2. Make course details, elective groups, source evidence, prerequisite connections, recommendation guidance, and the how-to guide collapsible.
3. Rename the default recommendation meaning to “No recommendation set” in the UI, hide neutral recommendation badges, and explain that this is optional personal guidance rather than an official assessment.
4. Apply distinct, high-contrast progress colours for not started, in progress, and completed, with explicit dark-mode variants.
5. Set explicit text/background/border/placeholder colours for import inputs, textareas, and table fields in both themes.
6. Explain how to add a missing elective option in the empty group state.

## Verification

Pending GitHub Actions after the pull request is opened. Do not mark the build or deployment as successful until the workflow confirms it.
