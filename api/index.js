/* Vercel entry point. Every /api/* request lands here (see vercel.json)
   and is handed to the same handler the local server uses. */
const { handle, fail } = require('../lib/api.js');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    await handle(req, res, url.pathname);
  } catch (e) {
    console.error('[sahara] ' + (e && e.stack || e));
    if (!res.headersSent) fail(res, 500, 'Something went wrong on the server.');
  }
};
