# Request 000: Product discovery and first usable prototype

## Status
Implemented as the initial product direction. This is the product brief and rationale, not a promise that every future capability already exists.

## User problem
Students receive study regulations, module catalogues, PDFs, and semester recommendations that are hard to turn into a practical personal plan. They need to understand what to take next, what they have already completed, which courses are connected, and where the plan is flexible.

## Product principles
1. Start with a useful plan immediately. Do not require an account or an import before the first useful interaction.
2. Make the graph the centre of the experience, with a readable list and details panel as alternatives.
3. Distinguish official constraints from suggested learning dependencies. A suggested edge must never look like a binding exam prerequisite.
4. Let users correct extracted data and manually add or connect modules.
5. Keep progress local in the browser for the first version. Do not send a student's progress to a server.
6. Provide a clear path from a sample plan to importing a real curriculum.
7. Support keyboard access, responsive layouts, clear status labels, and undoable interactions wherever practical.

## Main user journey
1. Open the app and see a sample study plan without setup.
2. Scan progress, semester grouping, and suggested next courses.
3. Mark courses complete or in progress. The available-next count and graph update immediately.
4. Select a module to see ECTS, semester, status, notes, and incoming/outgoing dependencies.
5. Filter the plan by semester or status, search for a module, and switch between graph and list.
6. Add a module manually or import a file in a future iteration.
7. Export or back up the plan so personal work is not trapped in the browser.

## First prototype scope
- A polished, responsive, client-only application.
- Seeded sample curriculum clearly marked as illustrative.
- Interactive dependency graph with movable nodes, zoom, pan, and fit-to-view.
- Module status editing and dependency-aware available-next logic.
- Search and filters.
- Module detail panel and manual module creation.
- Persistent local browser state with reset to sample.
- JSON export and import for backup and transfer.
- GitHub Pages deployment and a production build check.

## Explicitly out of scope for this first prototype
- Automatic extraction from university URLs or PDFs.
- AI-generated dependency analysis.
- User accounts, synchronisation, and a hosted database.
- Claims that the sample data is an authoritative TUM curriculum.

## Acceptance criteria
- The app can be opened through GitHub Pages after the deployment workflow is enabled.
- Core planning interactions work without a backend.
- Completed modules are excluded from outstanding work and can unlock suggested successors.
- A course with an unmet required dependency is not incorrectly shown as available.
- Official requirements and suggested learning relationships have distinct visual labels.
- The plan survives a page reload and can be exported as JSON.
- The app has a useful empty state and a reset path.
- The README explains local development and GitHub Pages deployment.

## Next requests
- Request 001: validate the product direction and refine the graph/availability semantics with the user.
- Request 002: import and review a real study plan.
- Request 003: add AI-assisted dependency suggestions with provenance and confidence.
