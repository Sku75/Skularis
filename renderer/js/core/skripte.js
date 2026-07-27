/**
 * Skularis — die Skripte der Vorteile auswerten.
 *
 * In der Regeldatenbank trägt jeder Vorteil ein kleines Python-Skript, das
 * Sephrasto beim Neuberechnen ausführt. Skularis führt kein Python aus, sondern
 * erkennt die Aufrufe und rechnet sie selbst nach. Das deckt alle Formen ab,
 * die in der Ilaris-Datenbank vorkommen:
 *
 *   modifyWS(1)                     abgeleiteten Wert verändern
 *   modifyMR(int(getMU()/2+0.5))    dito, mit Rechnung aus einem Attribut
 *   modifyAsPBasis(30)              Energie-Grundwert
 *   modifyAsPMod(getCH() + 4)       Energie-Aufschlag
 *   for t in ['A','B']: addTalent(t + ' (Tiergeist)', 0, 'Gaben des Blutgeists')
 *                                   schenkt Talente zum angegebenen Preis
 *
 * Noch nicht ausgewertet werden modifyKampfstil und addWaffeneigenschaft; die
 * gehören zu den Kampfwerten, die Skularis bisher gar nicht führt.
 *
 * Die Rechnung in den Klammern wird nicht als Programm ausgeführt: erst werden
 * die getXX() durch Zahlen ersetzt, dann bleibt nur noch Arithmetik übrig, und
 * alles andere wird verworfen.
 */

/** Abgeleitete Werte und Energien, die ein Skript verändern kann. */
export const MOD_ZIELE = [
  'WS', 'MR', 'GS', 'SB', 'INI', 'DH', 'RS', 'BE', 'SchiP',
  'AsPBasis', 'KaPBasis', 'GuPBasis', 'AsPMod', 'KaPMod', 'GuPMod',
];

const AUSDRUCK_ERLAUBT = /^[-+*/().\s\dMathflor]*$/;

/** Einen Zahlenausdruck aus einem Skript ausrechnen. */
export function werteAusdruck(ausdruck, attribute = {}) {
  let s = String(ausdruck || '').trim();
  if (!s) return 0;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);

  s = s.replace(/get([A-ZÄÖÜ]{2})\(\)/g, (_, abk) => String(attribute[abk] || 0));
  s = s.replace(/\bint\s*\(/g, 'Math.floor(');
  if (!AUSDRUCK_ERLAUBT.test(s)) return 0;
  try {
    const wert = new Function(`"use strict"; return (${s});`)();
    return Number.isFinite(wert) ? wert : 0;
  } catch {
    return 0;
  }
}

const RE_FOR_TALENT = /for\s+(\w+)\s+in\s*\[([^\]]*)\]\s*:\s*addTalent\(\s*\1\s*\+\s*(['"])(.*?)\3\s*,\s*(-?\d+)\s*,\s*(['"])(.*?)\6\s*\)/g;
const RE_TALENT = /addTalent\(\s*(['"])(.*?)\1\s*,\s*(-?\d+)\s*,\s*(['"])(.*?)\4\s*\)/g;
/**
 * Aufrufe der Form name(argument) finden. Klammern werden mitgezählt, damit
 * auch verschachtelte Ausdrücke wie modifyMR(int(getMU()/2+0.5)) ankommen.
 */
function findeAufrufe(text, praefix) {
  const treffer = [];
  const re = new RegExp(praefix + '([A-Za-z]+)\\(', 'g');
  let m;
  while ((m = re.exec(text))) {
    let tiefe = 1;
    let i = re.lastIndex;
    while (i < text.length && tiefe > 0) {
      if (text[i] === '(') tiefe++;
      else if (text[i] === ')') tiefe--;
      i++;
    }
    if (tiefe !== 0) break; // unvollständige Klammer: Rest verwerfen
    treffer.push({ name: m[1], argument: text.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return treffer;
}

/** Argumente eines Aufrufs trennen, ohne Kommas in Klammern oder Text zu zerreißen. */
function zerlegeArgumente(text) {
  const teile = [];
  let tiefe = 0;
  let inText = null;
  let aktuell = '';
  for (const z of String(text || '')) {
    if (inText) {
      aktuell += z;
      if (z === inText) inText = null;
      continue;
    }
    if (z === '"' || z === "'") { inText = z; aktuell += z; continue; }
    if (z === '(' || z === '[') tiefe++;
    if (z === ')' || z === ']') tiefe--;
    if (z === ',' && tiefe === 0) { teile.push(aktuell.trim()); aktuell = ''; continue; }
    aktuell += z;
  }
  if (aktuell.trim()) teile.push(aktuell.trim());
  return teile;
}

/**
 * Ein Vorteilsskript auswerten.
 * @param {string} script
 * @param {object} attribute  Attributwerte des Charakters für getXX()
 * @returns {{ mods, talente, kampfstile }}
 *   kampfstile: Name des Stils -> { at, vt, tp, rw, be }
 */
export function werteSkript(script, attribute = {}) {
  const mods = {};
  const talente = [];
  const kampfstile = {};
  let text = String(script || '');
  if (!text) return { mods, talente, kampfstile };

  // Erst die Schleifenform, deren Treffer danach entfernt werden, damit die
  // einfache Form sie nicht ein zweites Mal einsammelt.
  text = text.replace(RE_FOR_TALENT, (...m) => {
    const [, , liste, , suffix, kosten, , fertigkeit] = m;
    for (const roh of liste.split(',')) {
      const name = roh.trim().replace(/^['"]|['"]$/g, '');
      if (!name) continue;
      talente.push({ name: name + suffix, kosten: parseInt(kosten, 10) || 0, fertigkeit });
    }
    return '';
  });

  for (const m of text.matchAll(RE_TALENT)) {
    talente.push({ name: m[2], kosten: parseInt(m[3], 10) || 0, fertigkeit: m[5] });
  }

  for (const aufruf of findeAufrufe(text, 'modify')) {
    // modifyKampfstil(Name, AT, VT, Bonusschaden, RW, BE) wirkt nur für Waffen,
    // die genau diesen Kampfstil eingestellt haben.
    if (aufruf.name === 'Kampfstil') {
      const teile = zerlegeArgumente(aufruf.argument);
      const stil = String(teile[0] || '').trim().replace(/^['"]|['"]$/g, '');
      if (!stil) continue;
      const [at, vt, tp, rw, be] = teile.slice(1).map(x => werteAusdruck(x, attribute));
      const z = kampfstile[stil] || (kampfstile[stil] = { at: 0, vt: 0, tp: 0, rw: 0, be: 0 });
      z.at += at || 0; z.vt += vt || 0; z.tp += tp || 0; z.rw += rw || 0; z.be += be || 0;
      continue;
    }
    if (!MOD_ZIELE.includes(aufruf.name)) continue; // addWaffeneigenschaft: später
    mods[aufruf.name] = (mods[aufruf.name] || 0) + werteAusdruck(aufruf.argument, attribute);
  }

  return { mods, talente, kampfstile };
}

/**
 * Alle Skripte der gewählten Vorteile zusammenrechnen.
 * @returns {{ mods: Object<string, number>, talente: Array }}
 */
export function werteVorteilSkripte(char, db) {
  const mods = {};
  const talente = [];
  const kampfstile = {};
  for (const eintrag of char.vorteile || []) {
    const name = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const v = db.vorteilByName[name];
    if (!v || !v.script) continue;
    const erg = werteSkript(v.script, char.attribute || {});
    for (const [ziel, wert] of Object.entries(erg.mods)) mods[ziel] = (mods[ziel] || 0) + wert;
    for (const t of erg.talente) talente.push({ ...t, vonVorteil: name });
    for (const [stil, z] of Object.entries(erg.kampfstile)) {
      const s = kampfstile[stil] || (kampfstile[stil] = { at: 0, vt: 0, tp: 0, rw: 0, be: 0 });
      s.at += z.at; s.vt += z.vt; s.tp += z.tp; s.rw += z.rw; s.be += z.be;
    }
  }
  return { mods, talente, kampfstile };
}
