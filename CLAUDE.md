# Same Pill, New Look

Static PWA (no build step) that warns patients and caregivers when a refill comes from a different
generic manufacturer and will look different. English and Spanish. Live:
https://perezamadorluisenrique-gif.github.io/same-pill-new-look/
Part of Hidden Problems Lab; project policy lives in `/mnt/project-files/autopilot/charter.md`.

## Commands
| Job | Command |
|---|---|
| Unit tests | `npm test` (node:test against recorded fixtures in `test/fixtures/`) |
| Single test file | `node --test test/core.test.js` |
| Browser e2e (10 journeys + axe) | `npm ci && npm run e2e` (Playwright 1.56; preinstalled Chromium at /opt/pw-browsers) |
| Live check against real site and APIs | `npm run smoke` (CI only: the sandbox can't reach NLM or github.io) |
| Re-record API fixtures | push to the `fixtures` branch (`record-fixtures.yml` commits them back), then pull |
| Example data | `npm run build:example` |
| Serve | `npm start` (:8080) |

## Architecture
- `core.js` comparison logic (RxNorm clinical drug match, look diff), `app.js` UI, `i18n.js` EN/ES strings, `sw.js` offline shell.
- Data: NLM RxNav `ndcproperties` (SHAPE/COLOR arrive as FDA SPL codes like C48348) and openFDA drug recalls (counted only when the recall text names the exact NDC).
- Deploy: `pages.yml` tests and e2e on PRs and main; main force-pushes the site to `gh-pages` (the one allowed force-push). `smoke.yml` "Live check" runs daily and after each deploy.

## Rules
- **Never identify a pill or give dosing advice.** Results say "new maker, confirm with your pharmacist". Any change to result wording gets a separate review.
- Every user-facing string exists in English and Spanish.
- Data stays on the device; no tracking.
- Work on a branch and open a PR; gates must be green before merge. Never skip a test.

## Traps
- Don't switch to `actions/deploy-pages`: the github-pages environment rejected deploys from main; keep the gh-pages push.
- The sandbox can't reach NLM, openFDA or github.io; use Actions runs as the probe, WebFetch for the live page (strips scripts, may be cached).
- GraphQL is blocked: use `gh api repos/...`. Git branch deletes through the proxy fail (`fixtures` branch stays).
- GitHub disables cron after 60 days with no commits; the daily Live check depends on it.
