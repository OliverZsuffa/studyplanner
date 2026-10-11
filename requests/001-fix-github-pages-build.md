# Request 001: Fix the failing GitHub Pages build

## Status
Plan drafted. Awaiting approval before implementation.

## Observed failure
The GitHub Actions build reports two TypeScript errors:

1. `src/App.tsx(176,9)`: `updateSelected` is declared but never used. The app enables `noUnusedLocals`, so this stops the build.
2. `vite.config.ts(5,13)`: Vite plugin types are incompatible because the config resolves Vite types from the top-level `vite` package and from `vitest/node_modules/vite`. The current config imports `defineConfig` from `vitest/config` while the React plugin comes from `@vitejs/plugin-react`.

## Implementation plan
1. Remove the unused `updateSelected` helper from `src/App.tsx), unless inspection shows it should be wired to an existing UI action instead.
2. Resolve the Vite/Vitest type mismatch using a minimal, version-compatible configuration. Check the current package versions and TypeScript expectations first; avoid suppressing the error with broad casts or disabling type checks.
3. Run the available production build and unit tests if the environment permits. If local execution is unavailable, rely on the next GitHub Actions run and report that limitation honestly.
4. Review the changed files and ensure the GitHub Pages workflow still builds, tests, and deploys.
5. Update the knowledge base with the outcome, including the actual verification status.

## Acceptance criteria
- The unused-variable TypeScript error is gone.
- The Vite config type error is gone without weakening strict TypeScript checks.
- `npm run build` and `npm test` pass, verified locally or by a successful GitHub Actions run.
- The GitHub Pages deployment is confirmed before claiming the site is live.

## Scope
Only fix the build and deployment blocker. Do not change product behaviour or UI in this request.
