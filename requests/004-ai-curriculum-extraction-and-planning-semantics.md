# Request 004: AI-assisted curriculum extraction, dual semester assignments, and dependency-aware next steps

## Goal

Make curriculum import work with real-world module handbooks and university study-plan pages without relying on fragile line-by-line parsing. Preserve the university's suggested study sequence separately from the student's actual plan, and ensure the graph does not recommend a module before its recommended prior knowledge has been completed.

This is a planning document only. Do not implement until the user explicitly approves.

## Context and existing constraints

- The app is a client-only React + TypeScript app deployed on GitHub Pages.
- No backend, API key field, or direct AI API call is wanted. The user chooses and operates their preferred AI service.
- The current import wizard can locally extract selectable PDF text and parse text heuristically, but its parser often misses real curriculum layouts.
- The current StudyModule.semester is used as the single semester value for graph layout, filters, and workload totals.
- Dependencies have required and recommended kinds. Current formal availability logic only blocks on required links; the "good next step" card can therefore suggest a module even when a recommended predecessor is unfinished.
- Read knowledge/README.md and requests/003-reliable-curriculum-import.md before implementation.

## Product decisions

1. **AI-assisted extraction is the primary robust import path.** The website generates a provider-neutral prompt. The user supplies the source to their chosen AI, pastes the returned JSON into the app, and reviews it. No content is sent by the website to a third party.
2. **Keep local parsing as a fallback, not as the expected universal solution.** It remains useful for quick text imports, but the UI must not imply that heuristic parsing can reliably understand every module handbook.
3. **Preserve the source's suggested semester and the user's planned semester as separate fields.** Never overwrite the source's semester when the user changes their plan.
4. **A recommended dependency is not a formal examination blocker, but it does affect next-step advice.** Keep formal availability and learning-sequence advice as distinct concepts.
5. **Only reviewed data changes the active plan.** Extraction and AI relationship results remain a draft until the user approves them.
6. **Do not silently invent missing fields.** Unknown semesters, ECTS, module codes, and relationships remain unknown and are flagged for review.

## Workstream A: AI-assisted curriculum extraction

### User flow

1. In Import, offer two clearly labelled paths:
   - **Extract curriculum with AI** (recommended): create a prompt for the user to copy into their chosen AI tool.
   - **Import text locally**: retain the current paste/TXT/selectable-text PDF parser as a fallback.
   - Keep Studyplanner JSON backup restore separate from curriculum extraction.
2. For AI extraction, let the user choose or indicate the available source:
   - attach/upload a module handbook or study-plan PDF to the external AI;
   - paste copied text into the external AI;
   - provide a webpage URL to the external AI, asking it to use the page if it can access it.
   The website should explain that it does not itself fetch arbitrary URLs or upload files to an AI provider.
3. Generate a copyable prompt that instructs the AI to read the attached/pasted/linked source and return only JSON conforming to a documented Studyplanner extraction schema.
4. User pastes the response into the wizard.
5. Validate the schema and references, then display a review draft with editable fields and source evidence before applying.
6. If AI output is invalid, show actionable errors and preserve the pasted response so the user can correct it or ask the AI to repair it.

### Extraction schema and fields

For each module, request:
- stable ID created by the importer or a source code where available;
- official module code (nullable);
- title;
- ECTS (nullable);
- suggested semester in the official study plan (nullable; not guessed);
- description/learning outcomes where present;
- category/requirement-group membership where the source makes it clear;
- source title/URL if available;
- evidence excerpt and page/section/heading when available;
- per-field confidence or review flag, using a small documented vocabulary.

For curriculum structure, request:
- compulsory modules;
- elective catalogues and choice groups;
- exact requirement rules when stated (ECTS minimum/maximum/exact total, module count, one-from-each group);
- explicit formal prerequisites only when supported by source wording;
- ambiguity notes for unclear or conflicting source content.

The prompt must distinguish:
- **official study-plan placement** (the semester shown by the curriculum);
- **formal prerequisite** (an official rule that must be satisfied);
- **recommended prior knowledge / sensible learning order**;
- **uncertain inference**.

The prompt must not ask the AI to infer a semester from academic difficulty or course sequence. It must preserve alternatives rather than importing all options as compulsory. It must not invent module IDs, ECTS, source quotes, or citations. Missing values must be null with a reason or warning.

### Review UI

- Show a source summary and extraction warnings.
- Show suggested semester separately from planned semester.
- Make uncertain fields easy to correct inline.
- Show evidence excerpts and source location where provided.
- Show possible duplicates against the current plan.
- Let the user review elective groups and their exact rules.
- Show proposed dependencies separately from extracted module data.
- Keep add-to-plan and replace-plan actions explicit; canceling leaves the current plan unchanged.
- Clearly state that JSON validation checks structure, not whether AI claims or citations are true.

### Local parser

- Retain the current parser as a fallback.
- Improve semester detection only where it can be done conservatively and with tests.
- Do not treat a missing semester as semester 1.
- If a local parse cannot identify fields confidently, surface them as unknown rather than producing a plausible but false result.
- Do not spend this task trying to write regexes for every arbitrary PDF layout; robust extraction is the AI-assisted flow.

## Workstream B: Separate official and personal semesters

### Data model

Replace the single-semester assumption with two explicit concepts, with names chosen consistently in code:
- recommendedSemester (nullable): semester shown by the official study plan/source;
- plannedSemester (nullable or validated positive integer): semester the student currently intends to take the module.

Migration/compatibility:
- Existing saved plans only have semester. On loading legacy data, preserve the old value as plannedSemester; leave recommendedSemester unknown unless an official value is supplied by the user/import. Do not silently claim that the legacy value was official.
- Imported official study-plan semesters populate recommendedSemester. For newly imported modules, initialise plannedSemester to the same value only as a clearly editable starting proposal; if the official semester is unknown, do not silently set it to 1.
- Keep JSON import/export compatible with the new model and avoid losing old backup data.

### UI and calculations

- In module details/list, display both official recommended semester and personal planned semester when known.
- Let the user edit the personal planned semester without altering the official one.
- The semester workload grid, semester filters, and graph columns must use plannedSemester, not recommendedSemester.
- Provide a visible way to compare official sequence vs personal plan, such as displaying the official semester as secondary metadata in each module card and list row.
- If the planned semester is unknown, handle it explicitly in the UI rather than silently assigning semester 1.
- Clarify ECTS workload labels so they refer to the student's plan, not the official curriculum distribution.
- Keep progress and grades attached to modules, independent of semester assignment.

## Workstream C: Dependency-aware next-step advice

### Required distinction

Keep two separate questions:
1. **Formally available:** Are all formal (required) prerequisites completed?
2. **Good next step:** Is this module a sensible choice given both formal requirements and confirmed recommended prior knowledge?

A module connected by a recommended edge must not be suggested as the next step while the predecessor is incomplete. The recommended edge does not become a formal blocker; it affects advice only.

### Recommendation rule

- The "A good next step" card must not choose a module with any incoming required or recommended dependency whose source module exists in the plan and is not completed.
- If a required predecessor is incomplete, the module is not formally available.
- If only a recommended predecessor is incomplete, the module may still be formally available, but should not be presented as the recommended next step.
- The UI should explain which prior module is still outstanding, and distinguish formal requirement from recommended preparation.
- The "Ready to take" metric should retain its formal meaning (no unfinished required prerequisites) unless the label is deliberately redesigned. Do not quietly redefine formal availability to include recommendations.
- If every formally available module has unfinished recommended predecessors, avoid recommending one anyway. Say that no clear next step is available yet and show the relevant recommendations.
- Completed predecessors should no longer suppress the dependent module from next-step recommendations.
- Do not automatically infer dependency edges in this task beyond existing reviewed relationships.

### Graph presentation

- Preserve visual distinction between required and recommended edges.
- Make it clear that recommended links influence suggested learning order but are not examination requirements.
- Keep edge direction consistent: predecessor/source -> later module/target.
- Avoid adding redundant relationships or cycles automatically. Validation warnings are desirable if they can be implemented safely within scope.

## Testing and acceptance criteria

### AI extraction
- Prompt includes the extraction schema and all distinctions above.
- Valid AI JSON can produce a draft with module title, code, ECTS, official semester, choice groups, source evidence, and dependency suggestions.
- Invalid JSON, unknown schema versions, missing fields, invalid semester values, and malformed groups produce clear errors without changing the active plan.
- Missing values remain unknown and do not default to semester 1.
- User can edit the draft and cancel without changing the active plan.
- Choice alternatives are not counted as all compulsory workload.
- Local parsing remains available and is labelled as heuristic/fallback.

### Dual semesters
- Legacy JSON with only semester loads without data loss; old values become personal planned semesters, not official recommended semesters.
- Changing the planned semester leaves the recommended semester untouched.
- Graph layout, semester filters, workload totals, and grade/workload summaries use the personal planned semester.
- Unknown planned semester is handled without implicit assignment to semester 1.
- JSON export/import round-trip preserves both semester values and source metadata.

### Next-step logic
- Given A -> B as recommended, if A is incomplete, B is not shown as the suggested next step.
- B can still count as formally available if no required prerequisite is unfinished.
- When A is completed, B may become eligible for next-step advice.
- Required dependencies continue to block formal availability.
- The app does not fall back to recommending B merely because all other candidates are blocked by recommended links.
- UI wording does not describe recommended dependencies as formal requirements.

### Verification
- Add/update unit tests for extraction schema validation, migration of old plans, semester calculations, and recommendation filtering.
- Run unit tests and production build.
- Review the final diff and update knowledge/README.md plus this request with implementation status and known limitations.
- Verify deployment only if the relevant GitHub Actions run and live URL can actually be checked.

## Suggested implementation order

1. Update data model and legacy-plan migration for the two semester fields.
2. Update all semester displays, graph layout, filters, workload summaries, and import/export to use personal planned semester.
3. Implement and test the distinct next-step recommendation selector.
4. Add the AI extraction prompt and schema, pasted-JSON validation, and draft review.
5. Retain and label the local parser fallback; add conservative semester parsing tests.
6. Run tests/build, review behavior and data migration, then update the knowledge base.

## Open design notes

- Do not add a backend or direct AI provider integration.
- Prefer a clear extraction prompt/schema over more heuristic parsing rules.
- Keep the existing prerequisite-analysis prompt if useful, but separate it from the new curriculum-extraction prompt: extraction reads the source and returns curriculum facts; prerequisite analysis reasons about the already reviewed module set.
- The import wizard may share review components between the two AI flows, but do not combine their schemas or stages in a way that confuses extraction facts with relationship suggestions.


## Implementation status (2026-10-11)

Implemented on branch `feature/004-ai-curriculum-dual-semesters`, proposed in PR #2.

- Added `studyplanner-curriculum/v1` prompt generation and pasted-JSON validation for module codes, titles, ECTS, official semesters, evidence, source locations, warnings, and choice groups.
- Added a separate AI extraction stage before the editable review stage. Users attach/paste/link source material in their chosen AI service; the app itself does not upload documents or fetch URLs.
- Retained local parsing as a fallback and stopped assigning semester 1 by default.
- Added `plannedSemester` and `recommendedSemester`, legacy saved-plan migration, review controls, source evidence display, and planned-semester workload/filter/graph behavior.
- Kept formal availability separate from next-step advice; incomplete incoming recommended links now suppress the target from next-step recommendations.
- Added tests for AI extraction validation, unknown semester behavior, legacy migration, and recommended-dependency filtering.

Verification status: GitHub Actions build/deploy workflow was started for the PR and was still in progress at the time of this update. Final test/build result remains to be confirmed. Limitations: extraction output still needs human factual review; unknown ECTS are represented as 0 in the current numeric model and should be corrected in the review screen before relying on ECTS totals.
