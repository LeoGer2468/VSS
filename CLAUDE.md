# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sahara — a victim & witness well-being early-warning system (SIH hackathon prototype). It detects
potential distress from a survivor's check-ins, explains the signal in plain language, routes it to
a human caseworker, and tracks whether follow-up actually happened. It is explicitly **not** an AI
therapist and **not** an automated decision-maker — see the "Boundaries" section of README.md before
changing any wording around scoring, alerts, or risk.

## Commands

```
node server.js              # run locally — no npm install needed, uses data/db.json
npm start                   # same thing
npm test                    # node test/run.js — full end-to-end browser test (see Testing below)
```

No build step, no bundler, no linter configured. `npm install` is only needed to run against
Postgres locally (`pg`, `@neondatabase/serverless`) or to run the test suite (`playwright`, not in
package.json — must be available in the environment already).

Windows: double-click `START-WINDOWS.bat`, or `set PORT=3001 && node server.js` if 3000 is taken.

### Testing

`test/run.js` is a single scripted end-to-end run, not a unit test framework: it wipes `data/db.json`
(or drops Postgres tables if `DATABASE_URL` is set), spawns `server.js` on port 3111, then drives it
with both raw `fetch` calls (auth, access control, password-storage checks) and a real Playwright
Chromium session (registration flow, the check-in questionnaire, the caseworker view, the demo
runner). It has no test cases/assertions in the usual sense — it prints results and `!!`-prefixed
lines for anything it flags as wrong; check the console output. It expects a Chromium binary at
`/opt/pw-browsers/chromium`, so it's built for a specific sandboxed CI environment and will not run
as-is elsewhere without adjusting that `executablePath`.

There is no other automated test coverage — treat manual verification in the browser (`node
server.js`, http://localhost:3000) as required for any change to `public/index.html` or the check-in
flow.

## Architecture

The whole point of this codebase's layout is **there is exactly one implementation of everything**,
shared between local dev and the Vercel deployment, so deploying can't change behavior:

```
public/index.html   the entire frontend — markup, styles, and app logic in one file
public/engine.js     the analysis/scoring engine — UMD module, runs unmodified in
                      the browser (via <script>) AND required by the backend (via require())
api/index.js         Vercel serverless entry point — every /api/* request lands here
lib/api.js           the route handler — the ONLY implementation of the API, used by
                      both api/index.js (Vercel) and server.js (local)
lib/store.js         storage abstraction: Postgres when DATABASE_URL is set,
                      data/db.json otherwise — nothing above this file knows which is active
server.js            local static file server + dev entry point; not used by Vercel
data/db.json         auto-created/seeded on first local run; delete to reset to seed data
```

Because `public/engine.js` is loaded by both the browser and the server, the score a survivor's
check-in produces client-side (for instant UI feedback) is guaranteed identical to what the server
persists — there is no second implementation to drift out of sync. When changing scoring logic,
edit only `engine.js`.

Similarly, `lib/api.js` is the single source of truth for routes — never add API logic to
`server.js` or `api/index.js` directly; they're thin adapters (`server.js` also serves static files
from `public/`, and translates raw Node http; `api/index.js` just forwards to `handle()`).

### Storage swap

`lib/store.js` exposes one interface (`getStore()` → `init/getUserByName/getCase/putCase/...`) with
two backends chosen at boot by whether `DATABASE_URL` is set: `pgStore()` (Postgres/Neon — schema
created automatically on first run) or `fileStore()` (atomic-write JSON file, zero setup). A `case`
is stored as a single `jsonb`/JSON blob (not normalized columns) because its event log is
append-only and heterogeneous in shape — see DEPLOY.md's "Schema" section for the SQL layout and
rationale. Passwords: PBKDF2-SHA512, 120,000 rounds, per-user salt, constant-time comparison
(`hashPw`/`checkPw` in `lib/store.js`) — never touch this to store or log a plaintext password.

### Request flow

`lib/api.js`'s `handle(req, res, pathname)` is a single large route dispatcher (not a router
library) matching on `pathname` segments and `req.method`. Sessions are opaque random tokens in an
HttpOnly `sahara_session` cookie, looked up via the store (`sessionUser()`), expiring after 8 hours
(`SESSION_MS`). Every route past login/register/health/security requires a session. Access control
is enforced per-route by comparing `me.role`/`me.caseId`/`me.id` against the case being touched —
there is no separate authz middleware, so when adding a route, follow the existing pattern of
checking `me.role` and case ownership explicitly at the top of the handler.

Full route table and security posture (what's real vs. not-yet-implemented) are documented in
README.md — read that before changing auth, cookies, or access-control checks, and update it if
behavior changes.

### Frontend

`public/index.html` is a single-file SPA (no framework, no build step) covering: onboarding
(8-question registration for survivors, short form for workers), login, the survivor check-in flow,
the caseworker dashboard, a safety mask (Esc → calculator), and a scripted demo mode. The check-in
questionnaire enforces one answer mode per question (voice-only / text-only / one-tap scale) at the
DOM level — see README.md's "The check-in" section for which subjects use which mode and why; this
constraint is intentional and tested in `test/run.js` (`!! text question offers a mic` etc.), so
don't loosen it without updating both the UI and that check.

## Deployment

Deployed on Vercel + Neon Postgres; `vercel.json` rewrites `/api/*` to `api/index.js`. Full
walkthrough, including the schema and what changes (nothing, by design) between local and deployed
behavior, is in DEPLOY.md. `GET /api/health` reports which storage backend (`file`/`postgres`) is
live.
