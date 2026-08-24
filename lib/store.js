/* =====================================================================
   Storage.
   One interface, two backends, chosen at boot:

     DATABASE_URL set   ->  PostgreSQL   (Neon in production)
     DATABASE_URL unset ->  data/db.json (local, zero setup, no npm install)

   Nothing above this file knows which one is in use.
   ===================================================================== */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const Engine = require('../public/engine.js');

const log = m => console.log('[prahari] ' + m);

/* ---------- passwords ---------------------------------------------
   Never stored. Salted and stretched with PBKDF2-SHA512 over 120,000
   rounds; only the digest is written. Comparison is constant-time.
   ------------------------------------------------------------------ */
const hashPw = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');

function mkUser(username, password, role, extra){
  const salt = crypto.randomBytes(16).toString('hex');
  return Object.assign({
    id: 'u_' + crypto.randomBytes(8).toString('hex'),
    username: String(username).toLowerCase().trim(),
    salt, pwHash: hashPw(password, salt),
    role, createdAt: Date.now()
  }, extra || {});
}
function checkPw(user, password){
  const a = Buffer.from(hashPw(password, user.salt), 'hex');
  const b = Buffer.from(user.pwHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------
   POSTGRES
   users and sessions are ordinary relational rows. A case is stored as
   jsonb because its event log is append-only and every event has a
   different shape — the alternative is a dozen sparse columns that no
   query would ever use.
   ------------------------------------------------------------------ */
function pgStore(url){
  let pool;
  /* Neon over its own HTTP driver when deployed, plain node-postgres
     anywhere else. Both expose the same .query(text, params). */
  if (/neon\.tech/.test(url)){
    const { Pool } = require('@neondatabase/serverless');
    pool = new Pool({ connectionString: url });
  } else {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, max: 3 });
  }
  const q = (text, params) => pool.query(text, params);

  return {
    kind: 'postgres',

    async init(){
      await q(`create table if not exists users (
        id text primary key,
        username text unique not null,
        salt text not null,
        pw_hash text not null,
        role text not null,
        name text,
        case_id text,
        created_at bigint not null)`);
      await q(`create table if not exists cases (
        id text primary key,
        worker_id text,
        data jsonb not null,
        updated_at bigint not null)`);
      await q(`create table if not exists sessions (
        token text primary key,
        user_id text not null,
        exp bigint not null)`);
      await q(`create index if not exists cases_worker on cases (worker_id)`);
      await q(`create index if not exists sessions_exp on sessions (exp)`);

      const { rows } = await q('select count(*)::int as n from users');
      if (rows[0].n === 0) await seed(this);
      const c = await q('select count(*)::int as n from cases');
      log(`postgres ready — ${rows[0].n || 2} users, ${c.rows[0].n} cases`);
    },

    async getUserByName(username){
      const { rows } = await q('select * from users where username = $1', [String(username).toLowerCase().trim()]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },
    async getUserById(id){
      const { rows } = await q('select * from users where id = $1', [id]);
      return rows[0] ? rowToUser(rows[0]) : null;
    },
    async anyWorker(){
      const { rows } = await q(`select * from users where role = 'worker' order by created_at limit 1`);
      return rows[0] ? rowToUser(rows[0]) : null;
    },
    async createUser(u){
      await q(`insert into users (id, username, salt, pw_hash, role, name, case_id, created_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [u.id, u.username, u.salt, u.pwHash, u.role, u.name || null, u.caseId || null, u.createdAt]);
      return u;
    },

    async getCase(id){
      const { rows } = await q('select data from cases where id = $1', [id]);
      return rows[0] ? rows[0].data : null;
    },
    async putCase(c){
      await q(`insert into cases (id, worker_id, data, updated_at) values ($1,$2,$3,$4)
               on conflict (id) do update set worker_id = $2, data = $3, updated_at = $4`,
        [c.id, c.workerId || null, JSON.stringify(c), Date.now()]);
      return c;
    },
    async casesByWorker(workerId){
      const { rows } = await q('select data from cases where worker_id = $1 order by id', [workerId]);
      return rows.map(r => r.data);
    },

    async createSession(token, userId, exp){
      await q('insert into sessions (token, user_id, exp) values ($1,$2,$3)', [token, userId, exp]);
    },
    async getSession(token){
      const { rows } = await q('select * from sessions where token = $1', [token]);
      if (!rows[0]) return null;
      if (Number(rows[0].exp) < Date.now()){ await this.deleteSession(token); return null; }
      return { userId: rows[0].user_id, exp: Number(rows[0].exp) };
    },
    async deleteSession(token){ await q('delete from sessions where token = $1', [token]); },
    async pruneSessions(){ await q('delete from sessions where exp < $1', [Date.now()]); },
    async close(){ try { await pool.end(); } catch(e){} }
  };
}

const rowToUser = r => ({
  id:r.id, username:r.username, salt:r.salt, pwHash:r.pw_hash,
  role:r.role, name:r.name, caseId:r.case_id, createdAt:Number(r.created_at)
});

/* ------------------------------------------------------------------
   JSON FILE
   For local development. Every write is atomic — write a temp file then
   rename over the real one — so a crash mid-write cannot leave half a
   database behind.
   ------------------------------------------------------------------ */
function fileStore(dir){
  const FILE = path.join(dir, 'db.json');
  let db = { users:[], cases:[], sessions:{} };

  const save = () => {
    fs.mkdirSync(dir, { recursive:true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
  };

  return {
    kind: 'file',
    async init(){
      try {
        db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (!db.users || !db.cases) throw new Error('shape');
        db.sessions = db.sessions || {};
        log(`file store ready — ${db.users.length} users, ${db.cases.length} cases`);
      } catch (e) {
        log('no database found — seeding a fresh one');
        db = { users:[], cases:[], sessions:{} };
        await seed(this);
        save();
      }
    },
    async getUserByName(u){ return db.users.find(x => x.username === String(u).toLowerCase().trim()) || null; },
    async getUserById(id){ return db.users.find(x => x.id === id) || null; },
    async anyWorker(){ return db.users.find(x => x.role === 'worker') || null; },
    async createUser(u){ db.users.push(u); save(); return u; },
    async getCase(id){ return db.cases.find(c => c.id === id) || null; },
    async putCase(c){
      const i = db.cases.findIndex(x => x.id === c.id);
      if (i >= 0) db.cases[i] = c; else db.cases.push(c);
      save(); return c;
    },
    async casesByWorker(workerId){ return db.cases.filter(c => c.workerId === workerId); },
    async createSession(token, userId, exp){ db.sessions[token] = { userId, exp }; save(); },
    async getSession(token){
      const s = db.sessions[token];
      if (!s) return null;
      if (s.exp < Date.now()){ delete db.sessions[token]; save(); return null; }
      return s;
    },
    async deleteSession(token){ delete db.sessions[token]; save(); },
    async pruneSessions(){
      let n = 0;
      for (const t in db.sessions) if (db.sessions[t].exp < Date.now()){ delete db.sessions[t]; n++; }
      if (n) save();
    },
    async close(){}
  };
}

/* ------------------------------------------------------------------
   SEED — the fictional demo cases and the two demo accounts
   ------------------------------------------------------------------ */
async function seed(s){
  const worker = mkUser('anjali', 'sahara123', 'worker', { name:'Anjali Kaur' });
  await s.createUser(worker);
  const cases = Engine.seedCases();
  for (const c of cases){
    c.workerId = worker.id;
    c.worker = 'Anjali Kaur';
    await s.putCase(c);
  }
  await s.createUser(mkUser('meera', 'sahara123', 'survivor', { caseId:'SH-2291', name:'Meera' }));
  log('seeded 2 demo accounts and ' + cases.length + ' fictional cases');
}

/* ------------------------------------------------------------------ */
let current = null;
function getStore(){
  if (current) return current;
  const url = process.env.DATABASE_URL;
  current = url ? pgStore(url) : fileStore(path.join(__dirname, '..', 'data'));
  return current;
}

module.exports = { getStore, mkUser, checkPw, hashPw };
