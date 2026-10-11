# Request 006: Make elective selection explicit and count ECTS correctly

## Problem

Elective requirement groups currently do not provide a clear, reliable workflow for choosing the modules the student actually intends to take. Alternative modules can appear as ordinary modules in the graph/Kanban even before the student has chosen them, and the ECTS shown per semester does not consistently reflect the choice group and its target. The existing `selectedModuleIds` field is a useful starting point, but the interaction and validation rules need to be made explicit.

## Goal

Treat each elective/requirement group as a choice the student manages in one place. Unchosen alternatives stay inside the relevant group's menu, not in the dependency map or semester Kanban. Once chosen, a module becomes part of the personal plan and appears in the usual views. Semester workload, progress, and grade calculations must count chosen modules only, and the UI must prevent or clearly block choices that exceed a group's selection rule.

## Product rules

1. **The requirement group is the choice interface.** Show every requirement group in a dedicated, easy-to-find Electives/Requirements area or panel, with its title, rule/target, selected ECTS/count, and all candidate modules.
2. **Alternatives are hidden from normal planning views until chosen.** A module that belongs to a group and has not been selected in that group must not appear as a normal module in the dependency graph or semester Kanban. Show it inside the corresponding group's option list instead. Selected modules appear in the normal views and can be assigned to a planned semester.
3. **Selecting is explicit and reversible.** Each option has an obvious choose/remove control. Choosing an option adds it to the plan; removing it returns it to the group's option list. Preserve module progress/grades if an option is deselected and later reselected; do not silently delete its data.
4. **Enforce each group's rule.** Respect the existing supported rules: `exact-ects`, `min-ects`, `max-ects`, `module-count`, and `one-from-each`. Do not allow a selection that makes a hard maximum or exact target impossible/invalid. Explain why an option is unavailable rather than silently ignoring the click.
5. **Exact-target example.** For a group requiring exactly 6 ECTS, selecting a 6-ECTS option must prevent selecting an additional option in that same group. If the current selection leaves no legal room for an option, disable it with a short explanation. Do not block choices in unrelated groups.
6. **Validate totals in ECTS, not just option count.** For `exact-ects`, selected total must not exceed the target and the UI should communicate whether the target is reached or how much remains. For `min-ects`, selections must meet or exceed the minimum; avoid arbitrary restrictions that would prevent a valid way to reach the minimum. For `max-ects`, do not allow totals above the maximum. For `module-count`, use the target as the permitted/required number of modules according to the existing schema semantics and document the chosen interpretation. For `one-from-each`, inspect the current data model and source notes before implementing; if the current schema cannot represent the subgroups needed to enforce this rule reliably, surface it as unsupported/needs-review instead of guessing.
7. **ECTS accounting must be consistent.** Per-semester ECTS, total planned ECTS, progress ECTS, and grade weighting include only modules selected from elective groups. A selected elective counts in its assigned planned semester. Unselected alternatives contribute zero to planned totals and are absent from the map/Kanban.
8. **Overlapping group membership must be handled safely.** Inspect whether a module can belong to multiple requirement groups. Do not treat it as selected merely because it is selected in one unrelated group, and do not double-count the same module's ECTS if it satisfies multiple groups. If overlap is not a supported data shape, validate and warn about it.
9. **Keep the graph's purpose.** The dependency graph visualizes the selected study plan, not the full catalogue of every possible elective. Dependencies pointing to an unselected alternative must not cause a missing-node crash or misleading edge; keep them available in data and render them when their endpoints are visible.
10. **Persistence and compatibility.** Save choices through the existing localStorage plan and preserve JSON import/export compatibility. Existing plans with no `selectedModuleIds` must be migrated or interpreted predictably; never silently make every alternative compulsory. Show a review state when an imported group has ambiguous or invalid selection data.
11. **Accessible and clear.** Choosing/removing an option must work by keyboard and without drag-and-drop. Communicate group target, selected total, and validation messages in plain language. Keep dark mode consistent.
12. **No curriculum invention.** Do not fabricate missing alternatives or official requirement semantics. Use the rule and target already stored in the group, and flag ambiguous data.
13. **Keep recommendation separate from progress.** The current `ModuleStatus` (`not-started`, `in-progress`, `completed`) describes progress and must not be overloaded to mean whether a module is recommended. Add a separate recommendation field with backward-compatible defaults, for example `not-reviewed`, `recommended`, and `strongly-recommended`. The final labels and field name should match existing conventions after inspection. Recommendation must not affect ECTS, progress, grades, or whether a module is selected for an elective group.
14. **Make status visible consistently.** Use a consistent colour and a readable text label/icon in Kanban cards, graph nodes, and list rows. Distinguish progress (not started, in progress, completed) from recommendation (not reviewed, recommended, strongly recommended) without requiring colour vision. Respect dark mode and accessible contrast. A module can be recommended but not planned, or planned but not recommended.
15. **Plan membership remains separate from completion.** Planned semester assignment is not itself proof that a module is in progress or completed. Preserve current status when moving modules between semesters or selecting/deselecting elective alternatives.
16. **Show requirement-group progress.** Each group should explain its current selection state in human terms, such as selected/required ECTS or selected/required module count, and show whether the target is met, incomplete, exceeded, or needs review. Do not imply a rule is satisfied when its semantics or options are ambiguous.
17. **Surface prerequisite planning warnings.** Where dependency data supports it, identify planned modules whose required predecessor is not completed or whose planned semester is not earlier than the dependent module's planned semester. Treat missing/uncertain relationships carefully; distinguish official/formal prerequisites from recommendations and never present recommendations as formal blockers.

## Scope

### Include

- Inspect `RequirementGroup`, `selectedModuleIds`, localStorage migration, JSON import/export, graph node/edge generation, Kanban rendering, semester ECTS totals, progress, grade average, and all related tests.
- Add a dedicated requirement/elective selector showing options nested under their group.
- Add a separate recommendation field/state, keeping it independent of the existing module progress status and planned semester.
- Add consistent, accessible status and recommendation colour coding/labels across Kanban, graph, and list views.
- Add live requirement-group progress summaries and visible, source-aware prerequisite planning warnings.
- Filter unselected elective alternatives out of the graph and Kanban; selected options join the normal planning views.
- Add choose/remove controls and enforce supported rule constraints with clear disabled states and explanatory feedback.
- Correct shared model helpers so elective membership, selected-state, ECTS totals, progress, and grade weighting use one consistent definition.
- Handle hidden endpoints in the dependency graph safely.
- Preserve existing module metadata when changing a selection.
- Add unit tests for rule boundaries, exact-ECTS target behaviour, semester totals, progress/grade calculations, hidden options, graph edges with hidden endpoints, persistence/migration, and overlapping groups where applicable.
- Update `knowledge/README.md` and this request with implementation and verification results.
- Keep broad filtering controls and undo/history out of this implementation unless inspection shows they are essential to the above workflows; record them as follow-up candidates instead.

### Exclude

- A new backend, account system, or AI provider.
- Automatically selecting options based on the AI import or recommended semester.
- Inventing official TUM rules or missing elective options.
- Replacing the dependency graph or Kanban.
- Destructive deletion of deselected module records or their grades/progress.
- A broad data-schema migration unless inspection proves it necessary; if needed, document and test it explicitly.

## Implementation plan

1. Inspect the current model and all consumers of requirement groups, especially how the import wizard creates groups and how selections are persisted.
2. Define and test pure model helpers for: group selection state, whether a module belongs to an elective group, whether it is visible in the selected plan, validation of a proposed selection, and selected ECTS/counts. Explicitly define behaviour for missing selection arrays and overlapping group membership.
3. Implement rule-aware selection constraints. Exact-ECTS and max-ECTS must never permit a selection above the target; module-count must enforce its defined target; min-ECTS must permit legal combinations that reach the minimum. Handle one-from-each only if the data model expresses the necessary subgroups; otherwise show a clear review warning.
4. Add an Electives/Requirements panel. Each group displays its rule/target and live selection status; options show title, code, ECTS, and choose/remove control. Explain why an option cannot currently be selected.
5. Filter normal plan views to selected modules plus modules outside any elective group. Keep the full catalogue in plan data and the dedicated option menu. Ensure graph dependencies are only drawn when both endpoints are visible.
6. Recalculate per-semester totals and all aggregate calculations from the same selected-plan definition. Ensure a selected elective is counted in its planned semester, and an unselected alternative is never counted.
7. Verify persistence, import/export, and legacy plans. Deselecting must not erase module metadata. Add regression tests before updating documentation.
8. Add recommendation state without conflating it with `ModuleStatus`; migrate legacy plans with a safe neutral default and ensure import/export round-trips the field.
9. Apply a shared status/recommendation visual language across Kanban, graph and list, including text/icon labels and dark-mode/accessibility checks.
10. Add group progress summaries and source-aware prerequisite planning warnings using existing relationship kinds and provenance; do not create new formal prerequisite claims.
11. Run the full test suite and production build, review the diff, update the knowledge base and this request, then check GitHub Actions and the deployed Pages URL before claiming completion.

## Acceptance criteria

- The user can find every requirement group in a dedicated area and see its target/rule, selected options, and ECTS/count status.
- Unselected alternatives appear only inside their corresponding group's option menu, not in the Kanban or dependency graph.
- Selecting an eligible alternative adds it to the normal views; deselecting returns it to the option menu without losing its metadata.
- An exact-6-ECTS group cannot have two selected 6-ECTS options; once 6 ECTS is selected, other options in that group are disabled with a clear explanation.
- Exact/max targets cannot be exceeded; minimum targets can be satisfied by valid combinations; unsupported or ambiguous rules are flagged instead of guessed.
- Semester ECTS totals count the chosen option in its planned semester and never count unselected alternatives.
- Progress totals, completed ECTS, and grade averages follow the same selected-module semantics.
- Hidden elective alternatives do not produce broken graph edges or crashes.
- Existing saved plans and JSON files remain usable; missing selection data does not accidentally select every alternative.
- A module's progress status, recommendation state, and planned semester are independent; moving/selecting a module does not overwrite its progress or recommendation.
- Legacy plans without recommendation data receive a neutral default and import/export preserves the new field.
- Recommendation/progress colours and labels are consistent across Kanban, graph and list, readable in dark mode, and not colour-only.
- Requirement groups show accurate live selected ECTS/count and a clear met/incomplete/invalid/needs-review state.
- Prerequisite warnings distinguish formal required relationships from recommended ones and flag semester-order conflicts only where the data supports that conclusion.
- Tests and production build pass; documentation records actual verification and deployment state.

## Additional manual test scenarios

- A legacy module with no recommendation field is shown as neutral/not reviewed after migration.
- Changing recommendation never changes progress status, grade, result, planned semester, ECTS totals, or elective selection.
- Changing progress status never changes recommendation.
- A recommended module can remain unplanned; a planned module can remain not reviewed.
- Kanban, graph, and list show consistent labels/colours for each state in light and dark themes.
- Status remains understandable without colour (labels/icons and accessible contrast).
- A requirement group updates selected ECTS/count immediately when an option is chosen or removed, including exact-target, min-target, max-target, module-count and needs-review cases.
- A required predecessor scheduled in the same or a later semester is flagged as a planning conflict when both semesters are known; an unknown semester is not guessed.
- Recommended relationships are displayed as recommendations, not hard prerequisite failures.
- Import/export and localStorage round-trip the added recommendation field and preserve old files.

## Deferred follow-ups

- Advanced filters for recommendation/progress/semester.
- Undo/history for accidental edits.
These should be considered after the core data model and selection workflows are stable.

## Status

- Planning only. No application implementation changes are included in this request yet.
- Scope expanded to include independent recommendation state, consistent accessible status colour coding, group progress summaries, and source-aware prerequisite planning warnings.
- Waiting for explicit user approval before implementation, following the repository workflow.
