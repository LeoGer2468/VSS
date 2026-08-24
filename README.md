# Sahara

AI-powered victim & witness well-being early-warning system — SIH prototype.

**Detect → Explain → Connect → Intervene → Follow up.**

Not an AI therapist and not an automated decision-maker. It notices when a victim or
witness may need help, explains why in plain language, hands the case to an authorised
human, and verifies that the follow-up actually happened.

---

## Live

Deployed on Vercel with a Neon Postgres database. See **DEPLOY.md** for the full
walkthrough — Neon project, GitHub push, Vercel import, one environment variable.

`GET /api/health` reports which storage backend is live.

## Running it locally

You need Node.js. Nothing else — no `npm install`, no build step, no database to set up.

```
node server.js
```

Then open <http://localhost:3000>.

On Windows you can just double-click **START-WINDOWS.bat**.

If port 3000 is taken:

```
set PORT=3001 && node server.js      (Windows)
PORT=3001 node server.js             (Mac / Linux)
```

### Demo accounts

| Role | Username | Password |
|---|---|---|
| Survivor | `meera` | `sahara123` |
| Caseworker | `anjali` | `sahara123` |

New survivors register themselves through the 8-question onboarding.
New caseworkers get a short form.

### If the server will not start

`public/index.html` also runs on its own — double-click it. It drops into **local demo
mode**, holds everything in memory, and says so in the header. Every feature works; nothing
is saved. Useful as a fallback on demo day.

---

## What is where

```
public/index.html   the entire frontend, one file
public/engine.js    the analysis engine. Runs in BOTH the browser and the backend
api/index.js        Vercel entry point — every /api/* request lands here
lib/api.js          the routes. The only implementation, local and deployed
lib/store.js        Postgres when DATABASE_URL is set, data/db.json when it is not
server.js           the local server. Vercel does not use it
vercel.json         rewrites /api/* to the function
data/db.json        created on first local run. Delete it to start clean
```

`public/engine.js` being one file used by both sides is the point: the score a survivor's
answer produces on the server is the same score the dashboard explains. There is no second
opinion and no drift.

---

## The API

Everything is under `/api`. Sessions are an HttpOnly, SameSite=Strict cookie.

| Method | Route | Who | What |
|---|---|---|---|
| POST | `/api/register` | anyone | create a survivor or caseworker account |
| POST | `/api/login` | anyone | sign in |
| POST | `/api/logout` | anyone | sign out |
| GET | `/api/security` | anyone | how data is held — the page reads this live |
| GET | `/api/me` | signed in | your case, or your caseload |
| PATCH | `/api/profile` | survivor | consents, safe word, hide code |
| POST | `/api/checkin` | survivor | a whole check-in sitting |
| POST | `/api/event` | survivor | incident report or emergency alert |
| GET | `/api/caseload` | worker | cases assigned to you |
| GET | `/api/case/:id` | owner or worker | one case — writes the access log |
| POST | `/api/case/:id/action` | worker | review, intervention, follow-up |
| POST | `/api/case/:id/simulate` | worker | closed-loop follow-up simulation |

---

## Security, and what it is honestly worth

Real:

- **Passwords are never stored.** Salted and stretched with PBKDF2-SHA512 over 120,000
  rounds; only the digest is written. Comparison is constant-time.
- **Login replies do not leak whether an account exists** — same message, same work either way.
- **Access control is enforced server-side.** A survivor account gets 403 on anyone else's
  case. A worker sees only cases assigned to them. Try it: sign in as `meera` and request
  `/api/case/SH-2104`.
- **Sessions are HttpOnly cookies**, so page scripts cannot read the token, and expire after 8 hours.
- **Every read of a case is written to that case's access log** — and the survivor can read
  the same log the worker can.
- **Atomic writes**: the database is written to a temp file and renamed, so a crash mid-write
  cannot corrupt it.
- **Voice never leaves the device.** Transcription happens in the browser; only text is sent.

Not yet, and worth saying out loud if asked:

- No rate limiting on login, so nothing stops a brute-force attempt.
- No CSRF token beyond `SameSite=Strict`.
- Case data is not encrypted at rest beyond what the host provides.
- Locally it is plain HTTP; the deployed version is HTTPS because Vercel terminates TLS.

---

## The check-in

The core of it. A sitting asks the three core questions plus a rotating handful, so it
never becomes the same form twice and never asks about the same part of life twice in one
sitting. Subjects covered: mood, sleep, safety, connection, home, routine and work, money,
health, eating and self-care, the case itself, people who depend on them, outlook, and
whether they feel supported.

**Every question is fixed to one answer mode, and the interface enforces it.**

- **Spoken only** where how it is said carries more than what is said — sleep, who they
  have spoken to, whether home feels calm, what they are looking forward to. There is no
  keyboard on those screens.
- **Written only** where speaking aloud would be unsafe or awkward — anything about safety
  or contact from the other person, money, health, the case. There is no microphone on
  those screens.
- **One tap** for mood.

Each screen says why it is spoken or written. That reason is the feature.

### Scoring

One severe answer must not be averaged away by six mild ones, so a sitting scores as
`0.4 × mean + 0.6 × worst + 3 × (number of distinct indicator types)`. A worry appearing
across many subjects counts for more than the same worry said once. Per-subject scores
roll up into the "where life is hardest right now" breakdown on the dashboard.

---

## Safety features

- **Safe word.** Written into any answer, it raises a silent duress flag. The survivor's
  screen and the confirmation message are byte-for-byte identical to a normal check-in, and
  the event never appears in her own timeline. The worker gets a different alert from the
  panic button: *do not call, the survivor may not be alone.*
- **Safety mask.** `Esc` or the Hide button replaces Sahara with a working calculator —
  it really calculates, so it survives someone picking up the phone. Type the code and press
  `=` to return. Optional auto-hide after two minutes idle.
- **Emergency button.** Two-second hold, with a cancel path that still notifies the worker,
  because a cancelled alert is never silently dropped.
- **Safe contact window.** Chosen at sign-up; the worker is shown it on every screen.

---

## Boundaries

- No diagnosis of PTSD, depression or suicidality from a message or a recording.
- The AI never decides relocation, police involvement or legal outcomes.
- The wording is always *potential distress indicators*, *well-being trend*,
  *human review recommended*.
- Every case, name and quotation in this prototype is fictional.

---

## Demo

The **Demo** tab runs the scripted 11-step walkthrough. It switches to a local sandbox so
one person can play both roles — the live app keeps its real access control, and a survivor
account genuinely cannot open anyone else's case.

Delete `data/db.json` to reset everything to the seeded fictional cases.
