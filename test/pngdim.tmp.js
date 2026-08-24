const fs = require('fs');
const p = process.argv[2];
const buf = fs.readFileSync(p);
console.log(p, 'width', buf.readUInt32BE(16), 'height', buf.readUInt32BE(20));
