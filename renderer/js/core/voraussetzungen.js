/**
 * Skularis — Voraussetzungen prüfen, wie Sephrasto es tut.
 *
 * Nachbau von Sephrasto/VoraussetzungenListe.py (Zerlegen) und
 * Hilfsmethoden.voraussetzungenPrüfen (Auswerten).
 *
 * Grammatik:
 *   Komma trennt Bedingungen, die ALLE erfüllt sein müssen (UND).
 *   " ODER " trennt Alternativen innerhalb einer Bedingung (ODER).
 *
 * Bausteine, jeweils mit dem Kürzel, das Sephrasto intern verwendet:
 *   V  Vorteil <Name>                       der Vorteil ist vorhanden
 *   V  Kein Vorteil <Name>                  der Vorteil ist nicht vorhanden
 *   A  Attribut <ABK> <Zahl>                Attribut mindestens so hoch
 *   M  MeisterAttribut <ABK> <Zahl>         Attribut mindestens so hoch UND die
 *                                           zwei höchsten anderen Attribute
 *                                           zusammen mindestens Zahl mal 1,6
 *   T  Talent <Name> <Zahl>                 Talent vorhanden (Zahl optional)
 *   F  Fertigkeit <Name> <Zahl>             Probenwert mindestens so hoch
 *   U  Übernatürliche-Fertigkeit <Name> <Zahl>   dito, übernatürlich
 *   W  Waffeneigenschaft <Name>             eine Waffe hat diese Eigenschaft
 *   S  Spezies <Name>                       Spezies stimmt überein
 *
 * Im Vorteilsnamen sind Platzhalter erlaubt: * für beliebig viele Zeichen,
 * ? für genau eines. Die Ilaris-Datenbank nutzt das für Regeln wie
 * "Kein Vorteil Tiergeist (*)", also "kein anderer Tiergeist".
 *
 * Unbekannte Bausteine gelten als erfüllt und werden nicht angezeigt — so
 * blockiert eine Hausregel-Datenbank mit eigenen Bausteinen niemanden.
 */

import { fertigkeitBasiswert } from './regeln.js';

// --- Zerlegen -------------------------------------------------------------

const PRAEFIXE = [
  ['Kein Vorteil ', 'V', 0],
  ['Vorteil ', 'V', 1],
  ['MeisterAttribut ', 'M', null],
  ['Attribut ', 'A', null],
  ['Kein Talent ', 'T', 0],
  ['Talent ', 'T', 1],
  ['Übernatürliche-Fertigkeit ', 'U', null],
  ['Fertigkeit ', 'F', null],
  ['Waffeneigenschaft ', 'W', 1],
  ['Spezies ', 'S', 1],
];

/** Einen einzelnen Baustein zerlegen. */
function baustein(roh) {
  const text = String(roh || '').trim();
  if (!text) return null;
  for (const [praefix, typ, soll] of PRAEFIXE) {
    if (!text.startsWith(praefix)) continue;
    let rest = text.slice(praefix.length).trim().replace(/^'|'$/g, '');
    let wert = soll;
    if (typ === 'A' || typ === 'M') {
      const m = rest.match(/^([A-ZÄÖÜ]{2})\s+(-?\d+)$/);
      if (!m) return { typ: '?', text };
      return { typ, name: m[1], wert: parseInt(m[2], 10), text };
    }
    if (typ === 'T' || typ === 'F' || typ === 'U') {
      const m = rest.match(/^(.*?)\s+(-?\d+)$/);
      if (m) { rest = m[1].trim().replace(/^'|'$/g, ''); wert = parseInt(m[2], 10); }
      else if (wert === null) wert = 1;
      return { typ, name: rest, wert, negiert: soll === 0, text };
    }
    return { typ, name: rest, wert, text };
  }
  return { typ: '?', text };
}

/**
 * Voraussetzungstext in Klauseln zerlegen.
 * @returns {Array<{ text: string, alternativen: Array }>}  UND-Liste von ODER-Gruppen
 */
export function zerlege(text) {
  return String(text || '').split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(klausel => ({
      text: klausel,
      alternativen: klausel.split(/\s+ODER\s+/).map(baustein).filter(Boolean),
    }));
}

// --- Platzhalter ----------------------------------------------------------

function platzhalterRegex(muster) {
  const escaped = String(muster).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

function hatVorteil(char, muster, ausser) {
  let namen = (char.vorteile || []).map(v => (typeof v === 'string' ? v : v.name));
  // Bei "Kein Vorteil <Muster>" darf der Vorteil, dessen Voraussetzungen wir
  // gerade pruefen, sich nicht selbst treffen. Beispiel: die Phex-Tradition hat
  // "Kein Vorteil Tradition der *geweihten I" — das meint KEINE ANDERE geweihte
  // Tradition, nicht die eigene. (So macht es auch Sephrasto.)
  if (ausser) namen = namen.filter(n => n !== ausser);
  if (!/[*?]/.test(muster)) return namen.includes(muster);
  const re = platzhalterRegex(muster);
  return namen.some(n => re.test(n));
}

function hatTalent(char, name) {
  const inMap = m => Object.values(m || {}).some(e => (e.talente || []).includes(name));
  return inMap(char.fertigkeiten) || inMap(char.uebernatuerlich);
}

function probenwert(char, db, name, uebernatuerlich) {
  const def = uebernatuerlich ? db.uebernatByName[name] : db.fertigkeitByName[name];
  const eintrag = uebernatuerlich ? char.uebernatuerlich?.[name] : char.fertigkeiten?.[name];
  if (!def || !eintrag) return 0;
  return fertigkeitBasiswert(char, def) + (eintrag.wert || 0);
}

// --- Auswerten ------------------------------------------------------------

function pruefeBaustein(char, db, b, selbst) {
  switch (b.typ) {
    case 'V': {
      // "Kein Vorteil" (b.wert 0) schliesst den eigenen Vorteil aus, "Vorteil"
      // (b.wert 1) nicht — dort ist Selbst-Ausschluss unnoetig.
      const vorhanden = b.wert === 0 ? hatVorteil(char, b.name, selbst) : hatVorteil(char, b.name);
      return vorhanden === (b.wert === 1);
    }
    case 'A': return (char.attribute?.[b.name] || 0) >= b.wert;
    case 'M': {
      // Sephrasto, Hilfsmethoden: das Attribut selbst muss den Wert erreichen
      // und die zwei höchsten übrigen Attribute zusammen das 1,6-fache.
      const alle = char.attribute || {};
      if ((alle[b.name] || 0) < b.wert) return false;
      const uebrige = Object.entries(alle).filter(([k]) => k !== b.name).map(([, v]) => v || 0);
      if (uebrige.length < 2) return false;
      uebrige.sort((x, y) => y - x);
      return uebrige[0] + uebrige[1] >= b.wert * 1.6;
    }
    case 'T': return hatTalent(char, b.name) === !b.negiert;
    case 'F': return probenwert(char, db, b.name, false) >= b.wert;
    case 'U': return probenwert(char, db, b.name, true) >= b.wert;
    case 'W': return (char.waffen || []).some(w => String(w.eigenschaften || '')
      .split(',').map(s => s.trim()).includes(b.name));
    case 'S': return (char.spezies || '') === b.name;
    default: return true; // unbekannter Baustein blockiert nicht
  }
}

/**
 * Sind alle Voraussetzungen erfüllt?
 * @param {string} [selbst] Name des geprüften Vorteils; wird bei "Kein Vorteil"
 *   ausgeschlossen (die eigene Tradition zählt nicht gegen "keine andere").
 */
export function pruefe(char, db, text, selbst) {
  if (!text) return true;
  return zerlege(text).every(k => k.alternativen.some(b => pruefeBaustein(char, db, b, selbst)));
}

/**
 * Wie pruefe(), aber mit Aufschlüsselung für Anzeige und Ansage.
 * @returns {{ erfuellt: boolean, offen: string[], erledigt: string[] }}
 *   offen und erledigt enthalten lesbar aufbereitete Klauseltexte.
 */
export function pruefeDetail(char, db, text, selbst) {
  const offen = [];
  const erledigt = [];
  for (const k of zerlege(text)) {
    const ok = k.alternativen.some(b => pruefeBaustein(char, db, b, selbst));
    (ok ? erledigt : offen).push(lesbar(db, k.text));
  }
  return { erfuellt: offen.length === 0, offen, erledigt };
}

// --- Lesbare Anzeige ------------------------------------------------------

/**
 * Voraussetzungstext für Menschen aufbereiten. Die Ersetzungen stammen aus der
 * Regeldatenbank (Einstellung "Voraussetzungen: Anzeigetext ersetzen") und
 * machen aus "Kein Vorteil Tiergeist (*)" ein "kein anderer Tiergeist".
 * Die Reihenfolge ist wichtig und wird eingehalten.
 */
export function lesbar(db, text) {
  let s = String(text || '');
  if (!s) return s;
  for (const [suche, ersatz] of ersetzungen(db)) {
    if (suche) s = s.split(suche).join(ersatz);
  }
  return s.trim();
}

let _ersetzungenCache = null;
let _ersetzungenQuelle = null;

function ersetzungen(db) {
  const roh = (db && db.einstellungen && db.einstellungen['Voraussetzungen: Anzeigetext ersetzen']) || '';
  if (_ersetzungenQuelle === roh && _ersetzungenCache) return _ersetzungenCache;
  const liste = [];
  for (const zeile of String(roh).split('\n')) {
    const i = zeile.indexOf('=');
    if (i < 0) continue;
    liste.push([zeile.slice(0, i), zeile.slice(i + 1)]);
  }
  _ersetzungenQuelle = roh;
  _ersetzungenCache = liste;
  return liste;
}

/** Kurze Ansage für einen gesperrten Eintrag. */
export function fehltText(db, detail) {
  if (detail.erfuellt) return '';
  return 'Nicht verfügbar. Es fehlt: ' + detail.offen.join(', ') + '.';
}
