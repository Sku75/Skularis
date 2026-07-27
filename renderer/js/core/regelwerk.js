/**
 * Skularis — Zugriff auf die 123 Regeltexte der Datenbank.
 *
 * Die Regeln sind in Sephrasto für den gedruckten Regelanhang gedacht. In
 * Skularis werden sie an vier Stellen genutzt und kommen alle aus diesem Modul:
 *   Meister-Tisch    Regelnachschlagewerk, alle Regeln alphabetisch
 *   Abenteuer-Tisch  dieselbe Liste, verfügbare Regeln vorn markiert
 *   Vollinfo         am Ende der Info zu Vorteilen und Talenten
 *   HTML-Export      persönlicher Regelanhang (kommt später)
 *
 * Eine Regel hängt auf zwei Wegen an einem Element:
 *   über ihre Voraussetzung — 64 Regeln verlangen "Vorteil X", 12 eine
 *     Waffeneigenschaft, einige ein Talent. Das ist zugleich die Prüfung, ob
 *     eine Regel für einen Charakter überhaupt gilt.
 *   über Querverweise — 165 Verweise der Form "Regel:Name" zeigen von einem
 *     Vorteil auf eine Regel, auch ohne Voraussetzung.
 */

import { pruefe, lesbar } from './voraussetzungen.js';
import { bauInfo } from './infotext.js';

/** Alle Regeln, alphabetisch. */
export function alleRegeln(db) {
  return (db.regeln || []).slice();
}

/** Gilt diese Regel für den Charakter? Ohne Voraussetzung gilt sie immer. */
export function istVerfuegbar(char, db, regel) {
  if (!regel.voraussetzungen) return true;
  if (!char) return false;
  return pruefe(char, db, regel.voraussetzungen);
}

/** Kategorie einer Regel als Text. */
export function regelKategorie(db, regel) {
  return (db.regelTypen && db.regelTypen[regel.typ]) || 'Regel';
}

/**
 * Vollinfo einer Regel: Kategorie, Probe, Voraussetzung, Text.
 * @param {object} [char] wenn gegeben, wird die Verfügbarkeit mitgesagt
 */
export function regelDetail(db, regel, char) {
  const abschnitte = [[regel.name, `${regelKategorie(db, regel)}.`]];
  if (regel.probe) abschnitte.push(['Probe', `${regel.probe}.`]);
  if (regel.voraussetzungen) {
    const v = lesbar(db, regel.voraussetzungen);
    abschnitte.push(['Voraussetzungen', char && istVerfuegbar(char, db, regel)
      ? `Erfüllt: ${v}.` : `Setzt voraus: ${v}.`]);
  }
  if (regel.text) abschnitte.push(['Regeltext', regel.text]);
  return bauInfo(abschnitte);
}

/** Namen aus einem Querverweis-Feld ziehen, nur die vom gewünschten Typ. */
function querverweisZiele(feld, typ) {
  return String(feld || '').split('|')
    .map(s => s.trim())
    .filter(s => s.startsWith(typ + ':'))
    .map(s => s.slice(typ.length + 1).trim())
    .filter(Boolean);
}

/**
 * Regeln, die zu einem Element gehören: die es voraussetzen, und die es
 * ausdrücklich als Querverweis nennt.
 *
 * @param {object} db
 * @param {string} art   'Vorteil', 'Talent', 'Waffeneigenschaft', 'Übernatürliche-Fertigkeit'
 * @param {string} name
 * @param {string} [querverweise] Querverweis-Feld des Elements
 */
export function regelnFuer(db, art, name, querverweise) {
  const treffer = [];
  const gesehen = new Set();

  const nimm = (regel) => {
    if (!regel || gesehen.has(regel.name)) return;
    gesehen.add(regel.name);
    treffer.push(regel);
  };

  // Regeln, die dieses Element voraussetzen. Der Name kann in Anführungszeichen
  // stehen, deshalb beide Schreibweisen prüfen.
  const muster = [`${art} ${name}`, `${art} '${name}'`];
  for (const r of db.regeln || []) {
    if (!r.voraussetzungen) continue;
    if (muster.some(m => r.voraussetzungen.includes(m))) nimm(r);
  }

  // Ausdrückliche Querverweise auf Regeln.
  for (const zielName of querverweisZiele(querverweise, 'Regel')) {
    nimm(db.regelByName[zielName]);
  }

  return treffer;
}

/**
 * Die Regeln zu einem Element als Anhang für die Vollinfo. Steht bewusst ganz
 * am Ende, damit die eigentliche Beschreibung zuerst kommt.
 */
export function regelAnhangText(db, art, name, querverweise) {
  const regeln = regelnFuer(db, art, name, querverweise);
  if (!regeln.length) return '';
  const teile = [regeln.length === 1 ? 'Regel dazu.' : `${regeln.length} Regeln dazu.`];
  for (const r of regeln) {
    teile.push(`${r.name}.${r.probe ? ` Probe: ${r.probe}.` : ''} ${r.text}`);
  }
  return teile.join(' ');
}
