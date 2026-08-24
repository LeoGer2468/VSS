/* Assembles public/index.html from the parts in src/.
   Run `node build.js` after editing anything in src/.
   public/engine.js is NOT inlined — index.html loads it with a relative
   <script src="engine.js">, so the same file the server require()s is the
   file the browser runs, and the page still works opened straight off disk. */
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const out = [
  R('s1.html'),   // <head> + the whole design system
  R('s0.html'),   // landing page
  R('s2.html'),   // sign in / create account + onboarding
  R('s3.html'),   // app shell + survivor
  R('s4.html'),   // caseworker + demo + bottom nav + safety mask
  '<script src="engine.js"></script>\n',
  R('s5.js'),     // state + API client
  R('s6.js'),     // rendering
  R('s7.js'),     // auth, onboarding, questionnaire, actions
  R('s8.js')      // safety mask, demo runner, boot
].join('\n');

fs.writeFileSync(path.join(__dirname, 'public/index.html'), out);
console.log('built public/index.html  (' + Math.round(out.length/1024) + ' KB)');
