/**
 * Skularis — Regelnachschlagewerk.
 *
 * Alle 123 Regeln der Datenbank, alphabetisch, mit Filter obenauf. Der
 * Regeltext steht in der Vollinfo, also bei Shift und Pfeil-runter, und die
 * Eingabetaste öffnet ihn als navigierbares Feld, Satz für Satz.
 *
 * Derselbe Bildschirm bedient drei Stellen, die sich nur in der Markierung
 * unterscheiden:
 *   Meister-Tisch    hinter dem Regelnamen steht, welche der geladenen Helden
 *                    die Regel haben
 *   Abenteuer-Tisch  vor dem Regelnamen steht "Verfügbar", wenn der Charakter
 *                    des Abenteuers sie hat
 *   ohne Bezug       nur die Regeln, ohne Markierung
 */
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { oeffneInfo } from '../ui/infofenster.js';
import { alleRegeln, regelDetail, istVerfuegbar, regelKategorie } from '../core/regelwerk.js';

/**
 * @param {object} o
 * @param {object} o.db
 * @param {string} [o.titel]
 * @param {object} [o.charakter]  markiert verfügbare Regeln vorn mit "Verfügbar"
 * @param {Array<{name: string, charakter: object}>} [o.helden]
 *        markiert hinter dem Regelnamen, welche Helden die Regel haben
 */
export function regelnScreen(o) {
  const db = o.db;
  const regeln = alleRegeln(db);

  const items = regeln.map((r) => {
    let label = r.name;

    // Spieltisch: die Markierung steht vorn, damit sie zuerst gelesen wird.
    if (o.charakter) {
      label = istVerfuegbar(o.charakter, db, r) ? `Verfügbar, ${r.name}` : r.name;
    }

    // Meister-Tisch: hinter dem Regelnamen die Helden, die sie haben.
    let hinweis = regelKategorie(db, r);
    if (o.helden && o.helden.length) {
      const haben = o.helden.filter(h => istVerfuegbar(h.charakter, db, r)).map(h => h.name);
      label = haben.length ? `${r.name}, bei ${haben.join(', ')}` : `${r.name}, bei niemandem`;
      hinweis = `${regelKategorie(db, r)}${r.probe ? `, Probe ${r.probe}` : ''}`;
    } else if (r.probe) {
      hinweis = `${regelKategorie(db, r)}, Probe ${r.probe}`;
    }

    return {
      label,
      hint: hinweis,
      detail: regelDetail(db, r, o.charakter),
      onSelect: () => oeffneInfo(r.name, regelDetail(db, r, o.charakter)),
    };
  });

  return menuScreen({
    title: o.titel || 'Regelnachschlagewerk',
    subtitle: `${regeln.length} Regeln, alphabetisch. Oben filtern, Eingabetaste öffnet die Regel `
      + 'zum Durchlesen, Shift und Pfeil-runter liest sie am Stück. Escape zurück.',
    items,
    filter: true,
    leer: 'Keine Regeln in der Datenbank.',
  });
}

/** Bequemer Einstieg: Bildschirm öffnen. */
export function oeffneRegeln(o) {
  screen.push(regelnScreen(o));
}
