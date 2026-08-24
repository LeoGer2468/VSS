/* =====================================================================
   PRAHARI — local server.
   Serves public/ and hands /api/* to the same handler Vercel uses.

     node server.js                      -> data/db.json, zero setup
     DATABASE_URL=postgres://… node server.js  -> Postgres

   Open http://localhost:3000
   ===================================================================== */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { handle, fail } = require('./lib/api.js');
const { getStore } = require('./lib/store.js');

const PORT   = process.env.PORT || 3000;
const HOST   = process.env.HOST || '0.0.0.0';   // reachable from phones on the same wifi
const PUBLIC = path.join(__dirname, 'public');

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
                '.css':'text/css; charset=utf-8', '.json':'application/json',
                '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
                '.webmanifest':'application/manifest+json', '.jpg':'image/jpeg',
                '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };

function serveStatic(res, pathname){
  const rel  = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'Nope.');
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, 'Not found.');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api')){
    handle(req, res, url.pathname).catch(e => {
      console.error('[prahari] ' + (e && e.stack || e));
      if (!res.headersSent) fail(res, 500, 'Something went wrong on the server.');
    });
    return;
  }
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed.');
  serveStatic(res, url.pathname);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE'){
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Start PRAHARI on another port:\n`);
    console.error(`      set PORT=3001 && node server.js      (Windows)`);
    console.error(`      PORT=3001 node server.js             (Mac / Linux)\n`);
    process.exit(1);
  }
  throw e;
});

function lanAddress(){
  for (const list of Object.values(os.networkInterfaces()))
    for (const n of list || [])
      if (n.family === 'IPv4' && !n.internal) return n.address;
  return null;
}

server.listen(PORT, HOST, () => {
  const lan = lanAddress();
  console.log('');
  console.log('  PRAHARI is running.');
  console.log('  ---------------------------------------------');
  console.log('  On this computer   http://localhost:' + PORT);
  if (lan) console.log('  On the same wifi   http://' + lan + ':' + PORT + '   (open this on a phone)');
  console.log('  Storage            ' + (process.env.DATABASE_URL ? 'PostgreSQL' : 'data/db.json'));
  console.log('');
  console.log('  Demo accounts      meera / sahara123     (survivor)');
  console.log('                     anjali / sahara123    (caseworker)');
  console.log('');
  console.log('  Fictional data only. Ctrl+C to stop.');
  console.log('');
  getStore();
});
