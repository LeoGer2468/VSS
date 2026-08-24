# Deploying Sahara to Vercel

Free, no card, no cold starts. About fifteen minutes end to end.

You need two accounts: **Neon** (the database) and **Vercel** (the app), plus **GitHub**.

---

## 1 · Create the database — Neon

1. Go to <https://neon.com> and sign up with GitHub. No card needed.
2. Create a project. Call it `sahara`. Any region — pick the one nearest you.
3. On the project dashboard, click **Connect** and copy the connection string.
   It looks like:

   ```
   postgresql://user:PASSWORD@ep-something-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   **Use the pooled string** — the host has `-pooler` in it. Keep this somewhere safe;
   it is a password.

You do not need to create any tables. Sahara creates them on first run.

---

## 2 · Put the code on GitHub

From inside the `sih` folder:

```
git init
git add .
git commit -m "Sahara — SIH prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sahara.git
git push -u origin main
```

Create the empty repo on github.com first (no README, no .gitignore — the project
already has one, and it keeps `data/` and `node_modules/` out).

**Check before you push:** the connection string must not be in any file. It only
ever lives in the Vercel dashboard.

---

## 3 · Deploy — Vercel

1. Go to <https://vercel.com>, sign in with GitHub, **Add New → Project**.
2. Import the `sahara` repo.
3. Framework preset: **Other**. Leave build and output settings empty — there is no
   build step.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string from step 1 |

   Add it to Production, Preview and Development.
5. **Deploy.**

You get a URL like `https://sahara-xyz.vercel.app`.

---

## 4 · Check it worked

Open `https://YOUR-URL/api/health`. You should see:

```json
{"ok":true,"storage":"postgres","time":1750000000000}
```

If `storage` says `file`, the environment variable did not reach the function —
re-check the name, then redeploy.

Then sign in with `anjali / sahara123` and confirm the four seeded cases appear.

---

## How it fits together

```
public/index.html   static, served straight from Vercel's edge
public/engine.js    the analysis engine — loaded by the browser AND required by the API
api/index.js        every /api/* request (vercel.json rewrites them here)
lib/api.js          the routes. Identical locally and deployed
lib/store.js        Postgres when DATABASE_URL is set, data/db.json when it is not
server.js           the local server. Not used by Vercel
```

The point of that layout: `lib/api.js` is the only implementation of the API, and
`public/engine.js` is the only implementation of the scoring. Deploying cannot change
behaviour, because there is no second copy to drift.

### Schema

Created automatically on first request.

```sql
users    (id pk, username unique, salt, pw_hash, role, name, case_id, created_at)
cases    (id pk, worker_id, data jsonb, updated_at)
sessions (token pk, user_id, exp)
```

`users` and `sessions` are ordinary relational rows. A case is `jsonb` because its
event log is append-only and every event type has a different shape — modelling that
as columns gives you a dozen sparse fields nothing ever queries. Postgres indexes and
queries inside `jsonb` fine, e.g.

```sql
select data->>'alias', jsonb_array_length(data->'events') from cases;
```

---

## Local development still works with no setup

```
node server.js
```

With no `DATABASE_URL` it uses `data/db.json` and needs no `npm install` at all.
To run locally against Neon:

```
npm install
DATABASE_URL="postgresql://…" node server.js       # Mac / Linux
set DATABASE_URL=postgresql://… && node server.js  # Windows
```

The server also binds to your local network, so it prints a second URL that phones
on the same wifi can open. Useful when the venue wifi is fine but you would rather
not depend on the internet.

---

## What to say if a judge asks about security

Real, and demonstrable on the live URL:

- Passwords are never stored — PBKDF2-SHA512, 120,000 rounds, per-user salt,
  constant-time comparison. `select * from users` in Neon shows only digests.
- Access control is enforced server-side: signed in as `meera`, requesting
  `/api/case/SH-2104` returns **403**. A worker only ever sees their own caseload.
- Sessions are HttpOnly, SameSite=Strict, Secure cookies, expiring after 8 hours.
  Page scripts cannot read the token.
- Every read of a case is written to that case's access log — and the survivor can
  read the same log the worker can.
- HTTPS everywhere, because Vercel terminates TLS by default.
- Voice never leaves the device: transcription happens in the browser, only text is sent.

Honest gaps, worth saying before they ask:

- No rate limiting on login, so nothing stops a brute-force attempt.
- No CSRF token beyond `SameSite=Strict`.
- Case data is not encrypted at rest beyond what Neon provides at the disk level.
- No audit trail on the database itself, only in the application.

And the architectural point worth making: for a real deployment, victim records would
not live on a third-party free tier at all. They would run inside the department's own
infrastructure. The store module is deliberately swappable so that move is one file.

---

## Resetting the demo

In the Neon SQL editor:

```sql
drop table if exists users, cases, sessions;
```

The next request recreates them and re-seeds the four fictional cases plus the two
demo accounts.
