# Better Solitaire development

Use Node 22 (`.node-version`) and install dependencies with `npm ci`.

## Before opening a pull request

```sh
npm run check
npm run test:layout
npm run sync
```

`npm run check` runs ESLint, the formatting check, and the fast logic/configuration tests. `npm run test:layout` runs behavior and rendered-geometry tests in Chromium and WebKit across both card styles, iPhone and iPad viewports, and portrait and landscape. WebKit is included because it is the browser engine inside the iOS app.

The pre-commit hook formats and lints staged files, then runs the fast test suite. CI repeats those checks from a clean install, verifies production dependencies, runs the browser matrix, confirms the generated Capacitor project is current, and builds the iOS app with the submission SDK.

## Safe refactors

- Edit source files under `www/`; never edit `ios/App/App/public/` directly.
- Run `npm run sync` after web changes. The generated public copy is ignored; CI regenerates it before building.
- Keep editable product language in `www/copy.js`.
- Keep pure card placement rules in `www/game-rules.js`.
- Keep storage keys, validation, recovery copies, and schema migration in `www/persistence.js`.
- A rendering change must update `tests/computed-styles.baseline.json` with `npm run snapshot:baseline`. Review that JSON diff as the visual change.
- Do not remove saved-game compatibility or recovery keys without an explicit migration plan.

## Main branch protection

After the new workflows have run once on GitHub, protect `main` with pull requests required, required `Web quality` and `iOS simulator build` checks, conversation resolution, and no force pushes or deletions. Keep administrator bypass available for repository recovery. Because this is currently a one-person project, do not require an approval on the owner's own pull requests; GitHub does not allow self-approval, and outside contributors cannot merge without repository write access. `.github/CODEOWNERS` still routes every outside change to `@ehutt`. If another maintainer gains write access, add one required code-owner approval and dismiss stale approvals.

The workflows use read-only repository permissions, do not receive secrets on fork pull requests, and avoid `pull_request_target`. This lets outside contributors propose changes without giving their code access to trusted credentials.

The repository currently asks for workflow approval only for first-time contributors. For the strictest posture, change **Settings → Actions → General → Fork pull request workflows** to require approval for all outside collaborators. That blocks untrusted fork code from consuming runner time until the owner reviews it, while still allowing useful pull requests to be opened.
