# Ourworld web experience and administration

User-facing screens now use the shared mature photography design; `/admin` retains its styles. See `docs/MATURE_VISUAL.md` at the repository root. After a production build, `node apps/web/test/mature-ui.mjs` verifies three phone sizes with isolated API fixtures; `node apps/web/test/mature-live.mjs` checks the deployed Docker app with a local demo account. The latter creates a demo conversation and sends no messages.

Build/typecheck: `npm run build -w @ourworld/web`, `npm run typecheck -w @ourworld/web`.

Development: `npm run dev -w @ourworld/web` serves port 5173. Its `/api` and `/media` proxy defaults to the project Docker gateway at `http://127.0.0.1:8188`. Set `API_PROXY_TARGET=http://127.0.0.1:3000` when using a host API instead. Use explicit IPv4 on this machine. Port 8080 is unrelated to this project.

The root build copies the standalone globe into `public/globe`; its scripts, geographic data, fonts and textures are local. `VITE_API_BASE` defaults to `/api/v1`; `VITE_WS_BASE` optionally specifies a WebSocket origin. `/admin` uses the same verified session and requires the admin role. Both email link formats are supported: `/?verify=...` / `/?reset=...`, and `/verify?token=...` / `/reset?token=...`.

Profile edits are draft-only until publish. Agent proposals use real server jobs; missing model configuration displays an explicit error. No payment UI or simulation is enabled. Public uploaded images may be referenced in profile galleries; chat and verification documents remain private.

Project-local browser smoke tests: `node apps/web/test/ui.mjs`. They use the separate Playwright installation and project Chromium with `--no-proxy-server --disable-gpu`, never a personal browser profile. The local demo password is read from `.env`, not written to test output. Tests create development-only messages and save a profile draft. Screenshots and a JSON report are written under `artifacts/ui-frontend-*`. Set `OURWORLD_WEB_URL` to change the target; default is the live Vite app at `http://127.0.0.1:5173`.

`node apps/web/test/profile-refs.mjs` renders the actual Profile component through Vite SSR and checks explicit references, order, empty-reference fallback and service-city boundaries. `node apps/web/test/nav-layout.mjs` checks actual App markup plus current styles at three phone sizes in an isolated browser, with all network requests blocked. Neither test calls the running backend.
