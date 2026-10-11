# Request 003: Reliable curriculum import with manual review

## Goal

Let a student import a study programme with as little typing as possible, while ensuring that uncertain or ambiguous information is never silently treated as fact. The import must support both ordinary modules and curriculum requirements such as “earn 6 ECTS from this selection of electives”.

## Product principles

1. **Extract first, commit only after review.** Import creates a temporary draft, never edits the active plan immediately.
2. **Preserve the source.** Keep the original text, file name, page/section where available, and the extracted evidence for each proposed fact.
3. **Be conservative.** Unknown values remain unknown. Do not guess semester, ECTS, module codes, or formal prerequisites.
4. **Represent rules, not just courses.** A curriculum may specify a required number of ECTS from a group of options rather than require every option.
5. **Distinguish facts from suggestions.** Imported curriculum facts and inferred relationships have different provenance. An inferred prerequisite must never become an official blocker without explicit confirmation.
6. **Make corrections cheap.** Most review actions should be inline edits, dropdowns, or one-click confirmations; the student should not have to retype a whole module.
7. **Keep the existing plan safe.** Import is additive/replace only after a clear final choice, with duplicate detection and a way to cancel.

## Proposed user flow

### 1. Choose a source

Offer one primary action: **Import study programme**. Initial supported inputs:

- PDF upload, especially PDFs with selectable text.
- Paste text copied from a module handbook, curriculum page, or degree requirements.
- Existing Studyplanner JSON backup, kept as a separate restore path.

A URL can be offered as a convenience only when its content can actually be read. Arbitrary web pages may block browser access (CORS), require login, or render content dynamically. Do not pretend a URL was imported successfully if only the address was read. For the first version, if automatic URL reading fails, offer “Open page and paste the relevant text” as the fallback.

Scanned/image-only PDFs should be detected and explained. OCR can be a later enhancement; the first release should not invent text from unreadable pages.

### 2. Extract a draft

Parse source text locally where practical. Detect candidate:
- modules/courses and their titles;
- module codes, ECTS, semester/term, and descriptions;
- explicit exam prerequisites, but only when the wording clearly states a requirement;
- elective/choice groups and their minimum/maximum ECTS requirements;
- source location (page number or nearby heading/text).

The parser should use conservative patterns and mark each extracted field as **clear**, **needs review**, or **not found**. A plausible-looking value is not enough to call it verified.

For a first client-only release, do not promise general AI-level understanding of arbitrary PDFs. Build a transparent rule-based extraction pipeline first. The data model and review UI should allow a future AI extraction service, but that service would need a deliberate privacy, cost, and backend/API decision rather than exposing a secret API key in the browser.

### 3. Review the extracted results

Use one review screen with a compact summary and expandable rows, not a long multi-page wizard.

Each candidate row shows:
- title and any detected code;
- ECTS and semester, each editable inline;
- what kind of item it is: **required module**, **elective option**, or **ECTS choice group**;
- a confidence/review indicator;
- a short source excerpt and page/section reference;
- actions to confirm, edit, ignore, or mark as duplicate.

Put low-confidence or incomplete items first. Highlight missing ECTS/semester rather than filling in defaults. Allow bulk confirmation of clearly extracted rows, but never auto-confirm ambiguous groups or prerequisite relationships.

### 4. Review requirements and elective groups

An ECTS selection rule is not itself a course. Model it separately from the modules in the catalogue.

Example: “Choose at least 6 ECTS from the following electives: A (5 ECTS), B (4 ECTS), C (3 ECTS).”

Represent this as:
- a group named “Electives”;
- a rule “at least 6 ECTS”;
- candidate options A, B, and C linked to that group;
- a selected/planned state per option, so the planner counts only options the student actually intends to take toward the requirement;
- progress such as “5 of 6 ECTS planned” or “6 of 6 ECTS satisfied”.

Do **not** add all 12 ECTS of possible options to the student's required workload. Show available choice ECTS separately from required/selected ECTS. If the source says “choose 2 modules”, “at least 6 ECTS”, “up to 9 ECTS”, or “choose one from each area”, preserve the exact rule type instead of reducing every rule to a generic ECTS total.

If the wording is unclear (for example, whether options are alternatives or whether a minimum is required), create a flagged group for manual correction rather than guessing. Groups may contain options with different ECTS values; the planner should calculate combinations without assuming a fixed module count.

### 5. Confirm how to apply the import

Before committing, show a short summary:
- new modules to add;
- duplicates that will be skipped or merged;
- elective groups and options;
- missing/uncertain fields;
- relationships, if any, awaiting confirmation.

Then ask whether to **add to current plan** or **replace current plan**. Keep “add” as the safer default. No changes are written to the active plan until this confirmation.

### 6. Validate after import

Run checks and show actionable warnings:
- missing or non-positive ECTS;
- duplicate module codes/titles;
- references to unknown modules in prerequisites;
- impossible/contradictory group rules;
- semester outside the expected range;
- group options incorrectly counted as all required ECTS;
- a dependency cycle or an unconfirmed relationship being used as a blocker.

Warnings should not discard the draft. Let the student return to the review screen and fix them.

## Data model changes

Extend the curriculum model with explicit source metadata and choice requirements. Proposed concepts:

- ImportSource: source name/type and optional original text or URL.
- ExtractedField<T> (or equivalent field metadata): value, review status/confidence, and source excerpt/location.
- RequirementGroup: id, title, rule type (min-ects, max-ects, exact-ects, module-count, or one-from-each), target value where applicable, source/provenance, and linked option module IDs.
- Module participation/selection state: distinguishes a catalogue option from a module the student plans to take.
- Provenance: imported/official text, user-edited, or suggested; retain the source even after edits.

Avoid making every field generic/complex if a simpler typed structure will work. The essential invariant is that source facts, user corrections, and inferred suggestions remain distinguishable.

## Scope for the first implementation

### Include
- Import wizard entry point integrated with the existing Import button.
- PDF text extraction for selectable-text PDFs.
- Paste-text input.
- Existing JSON backup restore remains supported and separate.
- Draft-only parsing and manual review UI.
- Core module fields: title, code, ECTS, semester, description/category when clearly present.
- Choice groups with ECTS thresholds and selectable options.
- Duplicate detection, validation warnings, add/replace confirmation, cancel.
- Unit tests for parsing and choice-group ECTS calculations.
- Test fixtures with realistic ambiguous examples.

### Defer
- OCR for scanned PDFs.
- Reliable scraping of arbitrary URLs and login-protected university portals.
- Automatic AI interpretation of any curriculum format.
- Automatically generated prerequisite graph edges. If suggestions are added later, they must remain suggestions until confirmed.
- Direct connection to TUM systems or student accounts.

## Acceptance criteria

- Cancelling any step leaves the current plan unchanged.
- A PDF with selectable text and pasted curriculum text can produce a reviewable draft.
- Unknown values are blank/flagged, never silently defaulted to a semester or ECTS value.
- Every imported module can be traced back to its source text/page where available.
- A “6 ECTS from these options” rule is represented as one requirement group, not as six ECTS of invented modules and not as all options being compulsory.
- Possible options are excluded from required/planned ECTS totals unless selected by the student; the available choice pool is shown separately.
- Different rule forms (minimum ECTS, exact ECTS, maximum ECTS, module count, one from each category) remain distinguishable.
- Duplicate detection surfaces likely matches for review rather than silently deleting or duplicating modules.
- Imported prerequisite statements are not treated as formal blockers unless their source wording is explicit and the user confirms the interpretation.
- Unit tests cover missing fields, duplicate candidates, alternative modules, ECTS threshold calculations, and cancel/replace/add behaviour.
- Build and tests pass in GitHub Actions before the live version is declared ready.

## Implementation order

1. Define and test the requirement-group model and ECTS accounting rules.
2. Build a pure text-to-draft parser with fixture-based tests.
3. Add PDF text extraction and pasted-text input.
4. Build the review and validation interface.
5. Integrate safe add/replace confirmation and JSON backup restore.
6. Run tests/build, inspect the deployed version, and update the knowledge base.



## Updated direction: user-controlled AI for prerequisite analysis

The first version will not call an AI API from the website and will not ask users to enter API keys. Instead, the site will prepare structured data and let users choose their own AI service.

### Revised workflow

1. **Parse locally:** extract candidate modules, codes, ECTS, semester information, descriptions, and possible requirement groups from selectable-text PDFs or pasted text.
2. **Manually correct the curriculum:** let users add/edit/remove modules and configure compulsory modules, elective options, and choice-group rules. The curriculum must be in a reasonably clean, user-confirmed state before generating the AI prompt.
3. **Generate a copyable prompt:** create a prompt containing the confirmed curriculum data and explicit instructions for prerequisite analysis. Ask the AI to distinguish:
   - formal prerequisites explicitly supported by official source text;
   - recommended prior knowledge inferred from learning outcomes or module descriptions;
   - uncertain suggestions requiring verification.
   The prompt must tell the AI not to invent official requirements, to explain the rationale for each suggested relationship, and to cite source excerpts or URLs when supplied. It should return only a documented JSON structure matching the Studyplanner import schema.
4. **Import AI output as a draft:** users paste the AI response into the site. Parse and validate it, show a preview of new relationships and any errors/unknown module references, then let users approve or reject each relationship before it affects the plan.
5. **Keep source and provenance:** imported official rules, user-confirmed facts, and AI suggestions must remain distinct. AI-inferred prior knowledge must never silently become a formal prerequisite or hard blocker.

### AI analysis scope

The prompt may ask the chosen AI to use the provided module descriptions first and, if browsing is available, consult official module handbooks, examination regulations, and university pages. It must require links or identifiable citations for claims presented as official. If no reliable official evidence is found, the relationship must be labelled as a recommendation or uncertain inference, not an official prerequisite.

The website itself does not verify that citations are real or that the AI's conclusions are correct. The review screen must make that limitation clear and leave the user in control.

### Privacy and portability

- No API key field, API calls, AI provider integration, or backend is required for this workflow.
- The prompt should be provider-neutral and usable with a user's AI service of choice.
- Show the user what curriculum data will be included before copying the prompt.
- Do not automatically send or upload curriculum data to any third party.
- JSON import must validate structure and module IDs, reject malformed responses safely, and never replace the active plan without explicit confirmation.

### Revised implementation order

1. Define the curriculum, choice-group, provenance, and prerequisite-suggestion schemas.
2. Build and test local text extraction and manual curriculum editing.
3. Add copyable, provider-neutral prompt generation from the confirmed curriculum.
4. Add pasted JSON response import, schema validation, and relationship review.
5. Integrate with the existing plan safely and retain the current JSON backup/restore flow.
6. Test representative prompt/response fixtures, malformed AI output, unknown module references, and rejection/cancellation paths.

### Revised acceptance criteria

- The site never requires an AI API key and does not send curriculum data to an AI service itself.
- Users can manually correct the parsed curriculum before a prompt is generated.
- The generated prompt asks for evidence-based, clearly classified relationships and machine-readable JSON.
- AI output is staged as a draft; it cannot alter the active plan without explicit review and confirmation.
- Formal prerequisites and recommended prior knowledge remain different relationship types with separate provenance.
- Malformed JSON, missing fields, invented module IDs, and unsupported official claims are flagged rather than silently accepted.

## Implementation status

Implemented on branch `feature/curriculum-import-ai-prompt` for review:

- Local selectable-text PDF extraction using PDF.js, plain-text parsing, and a manual module editor.
- Choice groups are stored separately from modules, and possible options do not count toward planned ECTS until selected.
- Provider-neutral AI prompt generation and validated JSON response import.
- AI relationship suggestions are unchecked by default and require explicit selection. Formal prerequisites are separate from recommendations and retain AI provenance, rationale, and any supplied evidence/URL.
- Add/replace confirmation and JSON backup restore remain available.
- Unit tests cover parser candidates, prompt requirements, invalid AI output, relationship IDs, and elective ECTS accounting.

Limitations to verify during review: the parser is heuristic and may miss or misread unusual layouts; scanned PDFs/OCR and arbitrary URL scraping are not supported. AI source claims are not independently verified by the app. Build and tests are being verified by GitHub Actions after the changes were merged. A first CI run caught and fixed two TypeScript issues (PDF worker URL typing and an unused helper). Formal AI prerequisite claims without evidence or a source URL are now rejected.
