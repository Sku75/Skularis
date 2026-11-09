/**
 * Skularis — Prüfskript für die Geldbörse. Läuft mit:
 *   node _test/pruefung-boerse.mjs
 *
 * core/boerse.js hat keine Abhängigkeiten zum Browser, lässt sich also direkt
 * laden und mit echten Zahlen prüfen. Geprüft wird genau das, was am Spielabend
 * falsch wäre, ohne aufzufallen: wird nur gewechselt, wenn es nötig ist, bleibt
 * der Bogen König, und wandert der Stand in die Schattenkopie?
 *
 * Vor jedem Release laufen lassen.
 */
import {
  inKreuzer, ausKreuzer, standText, leseBoerse, aendereBoerse,
  setzeMuenze, raeumeAuf, protokoll, protokollZeilen,
} from '../renderer/js/core/boerse.js';

let fehler = 0;
function pruefe(was, ist, soll) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) { fehler++; console.log('FEHLER  ' + was + ': ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll)); }
  else console.log('ok      ' + was);
}

const neuerChar = (g) => ({ name: 'Testheld', geldboerse: { dukaten: 0, silber: 0, heller: 0, kupfer: 0, ...(g || {}) } });
const neuesAbenteuer = () => ({ inventar: { geldboerse: {}, rucksack: [], guertel: [] } });

// --- 1. Umrechnen --------------------------------------------------------
console.log('--- Umrechnen ---');
pruefe('3 Dukaten 4 Silber 5 Heller 6 Kreuzer sind 3456 Kreuzer',
  inKreuzer({ dukaten: 3, silber: 4, heller: 5, kupfer: 6 }), 3456);
pruefe('3456 Kreuzer zurueck', ausKreuzer(3456, {}), { dukaten: 3, silber: 4, heller: 5, kupfer: 6 });
pruefe('Standtext', standText({ dukaten: 1, silber: 2, heller: 3, kupfer: 4 }),
  '1 Dukaten, 2 Silber, 3 Heller, 4 Kreuzer');

// --- 2. Erhalten wechselt nur, wenn noetig -------------------------------
console.log('--- Erhalten ---');
{
  const c = neuerChar({ dukaten: 2, silber: 7, heller: 0, kupfer: 0 });
  const a = neuesAbenteuer();
  const r = aendereBoerse(a, c, { heller: 5 }, 'ein');
  pruefe('5 Heller erhalten gelingt', r.ok, true);
  pruefe('5 Heller erhalten wechselt NICHT', r.gewechselt, false);
  pruefe('die uebrige Boerse bleibt unberuehrt', c.geldboerse, { dukaten: 2, silber: 7, heller: 5, kupfer: 0 });
  pruefe('Schattenkopie mitgeschrieben', a.inventar.geldboerse, { dukaten: 2, silber: 7, heller: 5, kupfer: 0 });
  pruefe('eine Protokollzeile', protokoll(c).length, 1);
}

// --- 3. Ausgeben: erst direkt, dann ueber die Summe ----------------------
console.log('--- Ausgeben ---');
{
  const c = neuerChar({ dukaten: 2, silber: 7, heller: 0, kupfer: 0 });
  const r = aendereBoerse(neuesAbenteuer(), c, { silber: 3 }, 'aus');
  pruefe('3 Silber von 7 gehen direkt', r.gewechselt, false);
  pruefe('Stand danach', c.geldboerse, { dukaten: 2, silber: 4, heller: 0, kupfer: 0 });
}
{
  // 2 Dukaten, sonst nichts. 1 Kreuzer ausgeben MUSS wechseln.
  const c = neuerChar({ dukaten: 2 });
  const r = aendereBoerse(neuesAbenteuer(), c, { kupfer: 1 }, 'aus');
  pruefe('1 Kreuzer von 2 Dukaten wechselt', r.gewechselt, true);
  pruefe('Stand danach', c.geldboerse, { dukaten: 1, silber: 9, heller: 9, kupfer: 9 });
}
{
  const c = neuerChar({ silber: 1 });
  const r = aendereBoerse(neuesAbenteuer(), c, { dukaten: 1 }, 'aus');
  pruefe('zu wenig Geld wird abgelehnt', r.ok, false);
  pruefe('und die Boerse bleibt unberuehrt', c.geldboerse, { dukaten: 0, silber: 1, heller: 0, kupfer: 0 });
  pruefe('ohne Protokollzeile', protokoll(c).length, 0);
}

// --- 4. Der Gesamtwert bleibt erhalten -----------------------------------
console.log('--- Gesamtwert ---');
{
  const c = neuerChar({ dukaten: 5, silber: 5, heller: 5, kupfer: 5 });
  const vorher = inKreuzer(c.geldboerse);
  aendereBoerse(neuesAbenteuer(), c, { heller: 7 }, 'ein');
  pruefe('erhalten erhoeht genau um den Betrag', inKreuzer(c.geldboerse), vorher + 70);
  aendereBoerse(neuesAbenteuer(), c, { heller: 7 }, 'aus');
  pruefe('ausgeben senkt genau um den Betrag', inKreuzer(c.geldboerse), vorher);
  const w = raeumeAuf(neuesAbenteuer(), c);
  pruefe('aufraeumen aendert den Wert nicht', inKreuzer(c.geldboerse), vorher);
  pruefe('eine schon aufgeraeumte Boerse meldet nichts zu tun', w.geaendert, false);
}
{
  // 15 Silber sind 1 Dukat und 5 Silber — hier ist wirklich was zu wechseln.
  const c = neuerChar({ silber: 15 });
  const vorher = inKreuzer(c.geldboerse);
  const w = raeumeAuf(neuesAbenteuer(), c);
  pruefe('aufraeumen hat etwas getan', w.geaendert, true);
  pruefe('15 Silber werden 1 Dukat und 5 Silber', c.geldboerse, { dukaten: 1, silber: 5, heller: 0, kupfer: 0 });
  pruefe('und der Wert bleibt gleich', inKreuzer(c.geldboerse), vorher);
}

// --- 5. Von Hand verstellen ---------------------------------------------
console.log('--- Von Hand ---');
{
  const c = neuerChar();
  const a = neuesAbenteuer();
  setzeMuenze(a, c, 'dukaten', 12);
  pruefe('Dukaten gesetzt', c.geldboerse.dukaten, 12);
  pruefe('kein Umwechseln dabei', c.geldboerse, { dukaten: 12, silber: 0, heller: 0, kupfer: 0 });
  setzeMuenze(a, c, 'silber', -5);
  pruefe('negative Eingabe wird 0', c.geldboerse.silber, 0);
}

// --- 6. Boerse anlegen und Protokollzeilen ------------------------------
console.log('--- Anlegen und Protokoll ---');
{
  const c = { name: 'Ohne Boerse' };
  pruefe('Boerse wird angelegt', leseBoerse(c), { dukaten: 0, silber: 0, heller: 0, kupfer: 0 });
}
{
  const c = neuerChar({ dukaten: 1 });
  pruefe('leeres Protokoll sagt es', protokollZeilen(c).length, 1);
  aendereBoerse(neuesAbenteuer(), c, { heller: 1 }, 'ein');
  const z = protokollZeilen(c);
  pruefe('je Aenderung drei Zeilen', z.length, 3);
  pruefe('erste Zeile ist eine Ueberschrift', z[0].ueberschrift, true);
  pruefe('zweite Zeile ist der Stand', z[1].text.startsWith('Stand: '), true);
  pruefe('dritte Zeile ist leer', z[2].text, '');
  pruefe('Datum und Zeit in der Ueberschrift', /^\d\d\.\d\d\.\d{4}, \d\d:\d\d — /.test(z[0].text), true);
}

console.log('');
console.log(fehler === 0 ? 'ALLES OK' : fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
