// Syntax-Check aller Skularis-Quelldateien mit der Node-Laufzeit von Electron.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = process.argv[2];
const exe = process.argv[3];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skucheck-'));

function alleDateien(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      alleDateien(p, acc);
    } else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

let fehler = 0;
let geprueft = 0;
for (const datei of alleDateien(root)) {
  const rel = path.relative(root, datei);
  const istModul = rel.startsWith('renderer' + path.sep + 'js');
  const ziel = path.join(tmp, istModul ? 'p.mjs' : 'p.cjs');
  fs.writeFileSync(ziel, fs.readFileSync(datei));
  try {
    execFileSync(exe, ['--check', ziel], {
      stdio: 'pipe',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    geprueft++;
  } catch (e) {
    fehler++;
    console.log('FEHLER ' + rel);
    console.log(String(e.stderr || e.message).split('\n').slice(0, 8).join('\n'));
  }
}
console.log(`\n${geprueft} Dateien ohne Syntaxfehler, ${fehler} mit Fehler.`);
process.exit(fehler ? 1 : 0);
