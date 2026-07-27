/**
 * Prüft statisch, ob jeder Import im Renderer auf eine existierende Datei mit
 * einem passenden benannten Export zeigt. Fängt Tippfehler in Import-Namen ab,
 * die sonst erst zur Laufzeit im Browser auffallen.
 */
import fs from 'node:fs';
import path from 'node:path';

const wurzel = path.join(process.argv[2], 'renderer', 'js');

function alle(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) alle(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/** Alle benannten Exporte einer Datei einsammeln (reicht für dieses Projekt). */
function exporte(quelle) {
  const namen = new Set();
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(quelle))) namen.add(m[1]);
  const reListe = /export\s*\{([^}]*)\}/g;
  while ((m = reListe.exec(quelle))) {
    for (const teil of m[1].split(',')) {
      const t = teil.trim();
      if (!t) continue;
      namen.add((t.split(/\s+as\s+/).pop() || t).trim());
    }
  }
  return namen;
}

const dateien = alle(wurzel);
const cache = new Map();
const holExporte = (p) => {
  if (!cache.has(p)) cache.set(p, exporte(fs.readFileSync(p, 'utf-8')));
  return cache.get(p);
};

let fehler = 0;
for (const datei of dateien) {
  const quelle = fs.readFileSync(datei, 'utf-8');
  const rel = path.relative(wurzel, datei);

  // statische Importe: import ... from '...'
  const re = /import\s+([^;]*?)\s+from\s+['"](\.[^'"]+)['"]/g;
  // dynamische Importe: import('...')
  const reDyn = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;

  const pruefeZiel = (spez) => {
    const ziel = path.resolve(path.dirname(datei), spez);
    if (!fs.existsSync(ziel)) { console.log(`FEHLT  ${rel} -> ${spez}`); fehler++; return null; }
    return ziel;
  };

  while ((m = re.exec(quelle))) {
    const ziel = pruefeZiel(m[2]);
    if (!ziel) continue;
    const klausel = m[1].trim();
    if (klausel.startsWith('*')) continue;          // Namespace-Import
    const geschweift = klausel.match(/\{([^}]*)\}/);
    if (!geschweift) continue;                       // Default-Import
    const vorhanden = holExporte(ziel);
    for (const teil of geschweift[1].split(',')) {
      const name = teil.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!vorhanden.has(name)) {
        console.log(`EXPORT FEHLT  ${rel}: "${name}" nicht in ${path.relative(wurzel, ziel)}`);
        fehler++;
      }
    }
  }
  while ((m = reDyn.exec(quelle))) pruefeZiel(m[1]);
}

console.log(fehler ? `\n${fehler} Probleme.` : `\n${dateien.length} Dateien, alle Importe und benannten Exporte stimmen.`);
process.exit(fehler ? 1 : 0);
