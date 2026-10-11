# Request 005: Make AI curriculum extraction preserve elective requirements

## Problem

AI-assisted curriculum import can extract individual modules but fail to represent an elective requirement as a separate rule. This is especially damaging when a degree programme specifies a subject area such as statistics with a required ECTS amount and a catalogue of alternative modules. The result may look plausible while omitting the actual degree requirement.

The current prompt already mentions elective groups, but its instructions do not make preservation of the requirement itself explicit enough when its options are missing, nested, or described separately from the rule.

## Goal

Improve the existing provider-neutral extraction prompt and review validation so that explicit curriculum requirements are preserved, including elective groups whose possible modules are not fully known, without materially increasing prompt length or inventing facts.

This is a targeted reliability improvement, not a redesign of the import flow.

## Product rules

1. **Extract requirements as well as courses.** An explicit compulsory, elective, specialization, or subject-area requirement is a first-class item, not merely a category attached to individual modules.
2. **Do not lose an empty requirement.** If a requirement is explicit but its possible modules are not listed or cannot be identified, emit a requirement group with an empty `moduleCodes` list and explain the gap in `sourceNote` or `warnings`.
3. **Keep distinct groups distinct.** Separate or nested subject areas must not be merged simply because they are part of the same degree or use similar wording.
4. **Separate rules from options.** A group’s ECTS/module target is the requirement; its candidate modules are alternatives. The existence of several alternatives does not make all of them compulsory.
5. **Represent only supported rules.** Preserve the rule stated by the source. If the wording cannot confidently be mapped to the supported schema, flag it for review instead of guessing.
6. **Keep prompts concise.** Add only high-value instructions to `makeCurriculumExtractionPrompt()`; avoid duplicating existing rules or turning the prompt into a long checklist.
7. **Preserve uncertainty and provenance.** Do not fabricate module codes, ECTS values, source wording, group membership, or citations. Keep evidence/location when available.
8. **Review remains authoritative.** AI output is an unverified draft. The user must be able to inspect and correct requirements before applying the import.

## Scope

### Include

- Tighten the choice-requirement section of the `studyplanner-curriculum/v1` extraction prompt.
- Ensure the prompt explicitly requests each stated elective requirement even when the option catalogue is absent or incomplete.
- Add actionable review warnings for requirement groups with no linked options, and for any other obvious group inconsistency that can be detected without guessing.
- Ensure those warnings do not discard the group or block the user from correcting it.
- Add tests for prompt wording, parsing, and the mapping of extracted module codes to group module IDs.
- Add a representative regression fixture for a subject-area elective requirement (e.g. a statistics elective requirement) with multiple possible modules, and a second case where the requirement is explicit but its options are not listed.
- Update the knowledge base and record implementation/test results in this request after implementation.

### Exclude

- Redesigning the whole import wizard or its layout.
- A new AI provider/API integration, backend, or automatic upload of curriculum documents.
- Automatic scraping of arbitrary university URLs or OCR for scanned PDFs.
- Inventing or assuming details of the TUM Wirtschaftsinformatik curriculum. Use an official source supplied/approved for factual TUM-specific fixtures; otherwise keep fixtures clearly synthetic.
- Changing the prerequisite-analysis prompt/schema unless a directly related regression is found.
- Reworking requirement-group ECTS accounting beyond what is necessary to verify that alternatives are not all counted as compulsory.

## Prompt change

Add a short, non-redundant instruction block equivalent to:

- Extract every explicitly stated compulsory, elective, specialization, and subject-area requirement as well as individual modules.
- Always emit a `requirementGroups` entry for an explicit elective requirement, even if its options are unknown or absent. In that case use an empty `moduleCodes` array and explain the missing information in `sourceNote` or `warnings`.
- Keep distinct or nested elective areas separate; do not merge them merely because they belong to the same subject.
- Distinguish the amount required from the number of available alternatives; do not count every alternative as compulsory.
- If a stated rule cannot confidently be mapped to the supported schema, flag it for review rather than guessing.

Integrate this with existing rules and keep the final prompt compact.

## Review behaviour

- A requirement group with no linked modules must remain present and editable.
- The review screen should clearly flag that the group has no options linked, explain that the source may omit the catalogue, and allow the user to add/link modules manually.
- The warning is informational: an empty group may be correct if the source states the requirement but lists options elsewhere.
- Existing warnings about unknown module codes remain visible. Unknown codes must not be silently treated as linked modules.
- The import must not claim that an empty group is complete merely because its JSON is valid.

## Acceptance criteria

- The extraction prompt contains concise, explicit instructions to preserve elective requirements even when no options are found.
- A source describing a requirement for a specified amount of ECTS from a list of alternative modules produces one requirement group with the correct supported rule and only those alternatives linked to it.
- Alternative modules are not turned into compulsory modules merely because they appear in the same catalogue.
- An explicit requirement with no available option list still produces a group with an empty option list and an explanatory note or warning.
- Two distinct elective areas remain separate groups.
- Unknown or fabricated module codes are not silently linked; validation warns about them.
- A group with zero linked options is preserved in the review and has a clear, non-blocking warning.
- The review workflow still allows manual correction before applying the import.
- Existing valid `studyplanner-curriculum/v1` responses remain compatible; no schema migration is required unless tests prove it necessary.
- Tests cover prompt content, normal alternatives, missing option catalogues, distinct groups, unknown codes, and empty-group review warnings.
- Build and all tests pass; deployment is checked before claiming the live app is updated.

## Implementation plan

1. Inspect the current extraction prompt, group parsing/mapping, review UI, and related tests.
2. Add the smallest useful prompt change and focused tests.
3. Add a clear, non-blocking review warning for groups without linked options, reusing existing validation presentation where possible.
4. Add synthetic or officially sourced regression fixtures for a subject-area elective requirement, including the missing-options case.
5. Run unit tests and production build; review the diff for scope creep and prompt length.
6. Update `knowledge/README.md` and this request with actual implementation and verification results.
7. Verify GitHub Actions and the deployed Pages site before reporting completion.

## Status

Planning only. No application code has been changed for this request.
