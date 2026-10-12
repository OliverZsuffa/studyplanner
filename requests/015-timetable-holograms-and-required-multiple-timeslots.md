# Request 015: Timetable hologram interaction and multiple required timeslots

## Status

Implementation in progress on `fix/mobile-timetable-move`. Verification is pending the GitHub Actions build and unit-test workflow. A live browser interaction test has not yet been performed.

## User requirements

1. Pick up a teaching session directly from its current timetable position.
2. Show each saved alternative as a hologram at its actual weekday and time, rather than as alternative buttons inside the session card.
3. Allow dropping a session onto a valid hologram. Mark valid targets green and invalid targets red, and reject invalid selections.
4. Support touch devices with a tap-to-pick-up and tap-a-target fallback.
5. Let a teaching component require two or more weekly timeslots. The student must select the required number of distinct alternatives.
6. Preserve existing study plans and the previous one-alternative behavior by default.

## Implementation

- Added `requiredTimeslotCount` and `selectedAlternativeIds` to the teaching component model. Existing `selectedAlternativeId` data is migrated into the new array and kept mirrored for compatibility.
- Updated timetable conflict checks to compare a candidate with selected timeslots from other components and, for multi-slot components, with the component's other selected sessions.
- Updated calendar generation to create teaching events for every selected alternative.
- Added a required-timeslot count control to the teaching component editor and selected-count feedback to timetable cards.
- Replaced in-card alternative chips with drop targets positioned at the actual alternative times and weekdays. Added tap-to-pick-up behavior for touch devices.
- Added regression tests for legacy migration, same-component overlap detection, and calendar events for multiple selected alternatives.

## Verification checklist

- [ ] TypeScript check and production build pass.
- [ ] Unit tests pass.
- [ ] GitHub Pages workflow succeeds.
- [ ] Browser smoke test confirms desktop drag and drop, touch tap-to-pick, multi-slot selection, and invalid target rejection.
