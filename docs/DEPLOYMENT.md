# GitHub Pages deployment

The workflow at .github/workflows/deploy.yml builds the Vite app and publishes dist/ to GitHub Pages whenever code is pushed to main.

## One-time repository setup

1. Open the repository's Settings → Pages.
2. Under Build and deployment, select GitHub Actions as the source.
3. Open Actions and wait for the Deploy to GitHub Pages workflow to finish.
4. Visit https://oliverzsuffa.github.io/studyplanner/.

The Vite base path is configured for the repository name studyplanner. If the repository is renamed, update base in vite.config.ts.

The workflow is configured in the repository. The first live deployment is not considered verified until the workflow succeeds and the published URL loads.
