const fs = require('fs');
const js = fs.readFileSync(process.env.TMPDIR + '/current.js', 'utf8');

console.log('=== Analisi chiamata createClient minificata ===');

const waRegex = /wa\s*\(/g;
const ccRegex = /createClient\s*\(/g;

let m;
while ((m = waRegex.exec(js)) !== null) {
  const pos = m.index;
  const ctx = js.substring(pos, pos+200);
  console.log('wa( at pos', pos, ':');
  console.log(ctx);
  console.log('');
}

while ((m = ccRegex.exec(js)) !== null) {
  const pos = m.index;
  const ctx = js.substring(pos, pos+200);
  console.log('createClient( at pos', pos, ':');
  console.log(ctx);
  console.log('');
}

console.log('=== Contesto creazione client con URL reale ===');
const urlIdx = js.indexOf('pimwkmwrduqkaydyvxqz');
if (urlIdx >= 0) {
  const start = Math.max(0, urlIdx - 200);
  const end = Math.min(js.length, urlIdx + 500);
  console.log(js.substring(start, end));
}

console.log('');
console.log('=== Cerca y=wa( o y=wa(ka,Sa ===');
const wyIdx = js.indexOf('y=wa(');
if (wyIdx >= 0) {
  console.log('y=wa( alla posizione', wyIdx);
  console.log(js.substring(Math.max(0,wyIdx-50), wyIdx+200));
} else {
  console.log('y=wa( non trovata');
}
