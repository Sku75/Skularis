/**
 * Skularis — Prüfskript für die Rechnungen. Läuft mit: node _test/pruefung-rechnung.js
 *
 * Prüft die drei Rechnungen, bei denen ein stiller Fehler am Spielabend nicht
 * auffallen würde: den Malus aus Wunden und Erschöpfung, die Ergebniszeile eines
 * Wurfs samt Erschwernis, und das Umwechseln der Münzen.
 *
 * Vor jedem Release laufen lassen.
 */
const fs = require('fs');

let fehler = 0;
function pruefe(was, ist, soll) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) { fehler++; console.log('FEHLER  ' + was + ': ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll)); }
  else console.log('ok      ' + was + ' = ' + JSON.stringify(ist));
}

// --- Die Rechnungen aus dem Programm nachbilden ---------------------------
// wundabzug aus core/regeln.js
const wundabzug = (e) => Math.max(0, 2 * ((e || 0) - 2));
const malusAus = (wu, er) => wundabzug((Number(wu) || 0) + (Number(er) || 0));

// ergebnisRechnung aus core/malus.js
function ergebnisRechnung(roh, erschwernis = 0, malus = 0) {
  const e = Number(erschwernis) || 0;
  const m = Math.max(0, Number(malus) || 0);
  const endwert = roh - e - m;
  const teile = ['Ergebnis ' + roh];
  if (e > 0) teile.push('minus Erschwernis ' + e);
  else if (e < 0) teile.push('plus Erleichterung ' + (-e));
  if (m > 0) teile.push('minus Malus ' + m);
  if (teile.length > 1) teile.push('gleich Ergebnis ' + endwert);
  return { endwert, text: teile.join(', ') };
}

// Münzen aus abenteuer/inventar.js
const MUENZEN = [
  { key: 'dukaten', wert: 1000 }, { key: 'silber', wert: 100 },
  { key: 'heller', wert: 10 }, { key: 'kupfer', wert: 1 },
];
const inKreuzer = (g) => MUENZEN.reduce((s, m) => s + Math.max(0, g[m.key] || 0) * m.wert, 0);
function ausKreuzer(summe) {
  let rest = Math.max(0, Math.round(summe));
  const g = {};
  for (const m of MUENZEN) { g[m.key] = Math.floor(rest / m.wert); rest -= g[m.key] * m.wert; }
  return g;
}

// --- 1. Malus-Staffel nach Ilaris ----------------------------------------
console.log('--- Malus aus Wunden und Erschoepfung ---');
pruefe('0 Wunden, 0 Erschoepfung', malusAus(0, 0), 0);
pruefe('1 und 0', malusAus(1, 0), 0);
pruefe('2 und 0', malusAus(2, 0), 0);
pruefe('3 und 0', malusAus(3, 0), 2);
pruefe('2 und 1 (zaehlt 1 zu 1)', malusAus(2, 1), 2);
pruefe('2 und 2', malusAus(2, 2), 4);
pruefe('0 und 5', malusAus(0, 5), 6);
pruefe('leere Werte', malusAus(undefined, null), 0);

// --- 2. Ergebniszeile ----------------------------------------------------
console.log('--- Ergebniszeile eines Wurfs ---');
pruefe('ohne alles', ergebnisRechnung(18, 0, 0), { endwert: 18, text: 'Ergebnis 18' });
pruefe('nur Malus 2', ergebnisRechnung(18, 0, 2),
  { endwert: 16, text: 'Ergebnis 18, minus Malus 2, gleich Ergebnis 16' });
pruefe('Erschwernis 4 und Malus 2', ergebnisRechnung(18, 4, 2),
  { endwert: 12, text: 'Ergebnis 18, minus Erschwernis 4, minus Malus 2, gleich Ergebnis 12' });
pruefe('Erleichterung 2', ergebnisRechnung(18, -2, 0),
  { endwert: 20, text: 'Ergebnis 18, plus Erleichterung 2, gleich Ergebnis 20' });
// Der Endwert muss derselbe sein wie die alte Rechnung ew = roh - ersch - einschr
for (const [roh, e, m] of [[18, 0, 0], [12, 3, 2], [20, -1, 4], [7, 5, 0]]) {
  pruefe('Endwert wie bisher (' + roh + ',' + e + ',' + m + ')', ergebnisRechnung(roh, e, m).endwert, roh - e - m);
}

// --- 3. Muenzen ----------------------------------------------------------
console.log('--- Muenzen ---');
pruefe('1 Dukat sind 1000 Kreuzer', inKreuzer({ dukaten: 1, silber: 0, heller: 0, kupfer: 0 }), 1000);
pruefe('1 Silber sind 100 Kreuzer', inKreuzer({ silber: 1 }), 100);
pruefe('1 Heller sind 10 Kreuzer', inKreuzer({ heller: 1 }), 10);
pruefe('3 Dukaten 4 Silber 5 Heller 6 Kreuzer',
  inKreuzer({ dukaten: 3, silber: 4, heller: 5, kupfer: 6 }), 3456);
pruefe('3456 Kreuzer zurueck', ausKreuzer(3456), { dukaten: 3, silber: 4, heller: 5, kupfer: 6 });
pruefe('1 Kreuzer von 2 Dukaten', ausKreuzer(2000 - 1), { dukaten: 1, silber: 9, heller: 9, kupfer: 9 });
pruefe('15 Silber aufgeraeumt', ausKreuzer(inKreuzer({ silber: 15 })), { dukaten: 1, silber: 5, heller: 0, kupfer: 0 });
// Hin und zurueck muss immer gleich bleiben
for (const g of [{ dukaten: 0, silber: 0, heller: 0, kupfer: 0 }, { dukaten: 32 }, { kupfer: 9999 }, { dukaten: 7, silber: 7, heller: 7, kupfer: 7 }]) {
  pruefe('hin und zurueck ' + JSON.stringify(g), inKreuzer(ausKreuzer(inKreuzer(g))), inKreuzer(g));
}

// --- 4. Die echten Quelldateien gegenpruefen -----------------------------
console.log('--- Quelldateien ---');
const regeln = fs.readFileSync('renderer/js/core/regeln.js', 'utf8');
pruefe('wundabzug unveraendert in regeln.js',
  /Math\.max\(0,\s*2\s*\*\s*\(\(einschraenkungen\s*\|\|\s*0\)\s*-\s*2\)\)/.test(regeln), true);
const malus = fs.readFileSync('renderer/js/core/malus.js', 'utf8');
pruefe('malus.js nutzt wundabzug aus regeln.js', /import \{ wundabzug \} from '\.\/regeln\.js'/.test(malus), true);

console.log('');
console.log(fehler === 0 ? 'ALLES OK' : fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
