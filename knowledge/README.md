# Knowledge base

Read this file and the relevant linked notes before creating a new implementation plan.

## Product
Studyplanner turns a study programme into a personal, interactive module plan. The graph is the primary overview, but the product must also be usable as a list.

## Non-negotiable domain rule
Never conflate formal examination prerequisites with recommended prior knowledge. Every relationship must have a type and a source. AI-generated relationships are suggestions until a human confirms them.

## First release
Client-only React + TypeScript app, hosted on GitHub Pages. No account or backend is needed for the first useful version. Store personal progress locally and provide JSON export/import.

## Initial example
Use a clearly labelled illustrative curriculum for the first experience. Do not present inferred module details as official or verified TUM facts. Replace the example with a verified dataset when the user supplies or approves one.

## Architecture decisions
- Vite, React, TypeScript.
- React Flow for the graph.
- Plain localStorage for local persistence in the prototype.
- JSON file import/export for portability.
- GitHub Actions builds and deploys the Vite output to GitHub Pages.
- Keep data types and availability logic separate from UI components as the app grows.

## Working process
1. Read this knowledge base and relevant existing request documents.
2. Write a Markdown implementation plan in requests/.
3. If clarification is required, create a separate compact Markdown document in requests/questions/.
4. Wait for explicit approval before implementing ordinary requests.
5. On approval, implement, run available tests/build checks, review the diff, and update the knowledge base.
6. Record outcomes and remaining work in the request document.
7. This initial product discovery request is the one-time exception: the user explicitly authorised documenting and implementing the first complete-feeling prototype without waiting for a separate approval.

## Testing and honesty
Report only tests actually run. A configured GitHub Actions workflow is not proof that it has passed. Verify the deployed Pages URL and workflow status before claiming the live site works.
