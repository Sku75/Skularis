/**
 * Headless-Test: Waffensets vom "Speichern" bis zum Lesen am Spieltisch (F1).
 *
 * Prüft die Kernmechanik, die Editor UND Abenteuertisch (F1) gemeinsam nutzen:
 *   schreibeInventar → char.ausruestung-Zeilen → leseInventar → dieselben Sets,
 *   und ergaenzeSets (Waffenlos vorne, eigene Sets bleiben erhalten).
 * Die XML-Ablage speichert diese Zeilen wortgetreu (in echten Bögen verifiziert),
 * daher deckt dieser Test den ganzen Weg ab.
 *
 * Start:  node _test/waffenset-test.mjs
 */
import { leseInventar, schreibeInventar, ergaenzeSets, SET_WAFFENLOS } from '../renderer/js/core/ausruestung.js';

let fehler = 0;
const ok = (b, txt) => { if (b) { console.log('  ok  ' + txt); } else { console.log('  FEHLER  ' + txt); fehler++; } };

// Stub-Datenbank: nur was ergaenzeSets/istFernkampf braucht.
const db = {
  waffen: [
    { name: 'Hand', 'würfel': '1', 'würfelSeiten': '6', plus: '0', 'härte': '1', fk: '0' },
    { name: 'Dolch', fk: '0' },
    { name: 'Kurzbogen', fk: '1' },
  ],
};

console.log('1) Eigene Sets speichern und wieder lesen');
{
  const char = { waffen: [{ name: 'Dolch', id: 'Dolch' }], ausruestung: [] };
  schreibeInventar(char, {
    gegenstaende: [],
    waffenSets: [
      { name: 'blanke Hand', haupthand: '', nebenhand: '', fernkampf: '' },
      { name: 'Dolch', haupthand: 'Dolch', nebenhand: '', fernkampf: '' },
    ],
    ruestungsSets: [],
  });
  ok(char.ausruestung.some(z => z.startsWith('Waffenset: blanke Hand')), 'Zeile "Waffenset: blanke Hand" wird geschrieben');
  ok(char.ausruestung.some(z => z.startsWith('Waffenset: Dolch; Haupthand: Dolch')), 'Zeile "Waffenset: Dolch; Haupthand: Dolch" wird geschrieben');
  const inv = leseInventar(char);
  const namen = inv.waffenSets.map(s => s.name);
  ok(namen.includes('blanke Hand'), 'Set "blanke Hand" wird wieder gelesen');
  ok(namen.includes('Dolch'), 'Set "Dolch" wird wieder gelesen');
  const dolch = inv.waffenSets.find(s => s.name === 'Dolch');
  ok(dolch && dolch.haupthand === 'Dolch', 'Haupthand des Dolch-Sets ist "Dolch"');
}

console.log('2) ergaenzeSets: Waffenlos vorne, eigene Sets bleiben, Fernkampf einsortiert');
{
  const char = {
    waffen: [{ name: 'Dolch', id: 'Dolch' }, { name: 'Kurzbogen', id: 'Kurzbogen' }],
    ausruestung: ['Waffenset: blanke Hand', 'Waffenset: Dolch; Haupthand: Dolch'],
  };
  ergaenzeSets(char, db);
  const inv = leseInventar(char);
  const namen = inv.waffenSets.map(s => s.name);
  ok(namen[0] === SET_WAFFENLOS, 'Waffenlos steht ganz vorne');
  ok(namen.includes('blanke Hand'), 'eigenes Set "blanke Hand" bleibt erhalten');
  ok(namen.includes('Dolch'), 'eigenes Set "Dolch" bleibt erhalten');
  const hatBogen = inv.waffenSets.some(s => s.fernkampf === 'Kurzbogen' || s.haupthand === 'Kurzbogen');
  ok(hatBogen, 'die neue Fernkampfwaffe (Kurzbogen) landet in einem Set');
  const wl = inv.waffenSets.find(s => s.name === SET_WAFFENLOS);
  ok(wl && wl.haupthand === 'Hand', 'Waffenlos trägt die "Hand"');
}

console.log('3) Roh-Zeilen-Rundlauf (wie XML sie wortgetreu ablegt)');
{
  const zeilen = ['Waffenset: Waffenlos; Haupthand: Hand', 'Waffenset: blanke Hand', 'Waffenset: Dolch; Haupthand: Dolch'];
  const char = { waffen: [], ausruestung: zeilen.slice() };
  const inv = leseInventar(char);
  ok(inv.waffenSets.length === 3, 'alle drei Sets aus den Roh-Zeilen gelesen');
  ok(inv.waffenSets.map(s => s.name).join(',') === 'Waffenlos,blanke Hand,Dolch', 'Reihenfolge und Namen stimmen');
}

console.log('');
console.log(fehler ? `FEHLGESCHLAGEN: ${fehler} Prüfungen fehlerhaft.` : 'ALLE PRÜFUNGEN OK — die Waffenset-Mechanik trägt vom Speichern bis zum Lesen (F1).');
process.exit(fehler ? 1 : 0);
