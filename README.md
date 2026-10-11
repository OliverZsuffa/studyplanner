# Studyplanner

An interactive planner that helps students turn a study programme into a personal plan. The first prototype is client-only and starts with illustrative sample data.

## Try it online

Once the GitHub Pages workflow has completed successfully, the app should be available at:

https://oliverzsuffa.github.io/studyplanner/

The first deployment may need GitHub Pages to be enabled for the repository. See docs/DEPLOYMENT.md.

## Features in the prototype

- Moveable module dependency graph with zoom, pan, and fit-to-view
- Mark modules as planned, in progress, or completed
- See which modules are available next based on their dependencies
- Search and filter modules
- Inspect and edit module details
- Add modules and dependency relationships
- Local browser persistence
- JSON import and export

The included sample curriculum is illustrative, not an official or verified TUM curriculum.

## Run locally

Requires Node.js 20 or newer.

    npm install
    npm run dev

For a production build:

    npm run build
    npm run preview

## Project workflow

Read knowledge/README.md before planning work. Every implementation request gets a Markdown plan under requests/. If clarification is needed, put concise questions in requests/questions/. After implementation, record outcomes and update the knowledge base.

## Planned direction

1. Improve the planner experience with real, user-approved curriculum data.
2. Import curricula from URLs, PDFs, and structured files, with a review step.
3. Add AI-assisted learning-dependency suggestions with source and confidence.
4. Preserve a strict distinction between official requirements and recommended preparation.
