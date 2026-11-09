/**
 * Skularis — Würfelmalus und Ergebnisrechnung. EINE Quelle für alle Würfelstellen.
 *
 * Warum eine eigene Stelle: Der Abzug durch Wunden und Erschöpfung wurde bis 1.47
 * nur in kampfProbe gerechnet, und die Ansage setzte ihn still in die Endzahl.
 * Sollte derselbe Abzug an weiteren Stellen gelten (Meisteransicht, Gegner,
 * Zauberspeicher, Gruppenproben), wäre er fünfmal kopiert worden — fünf
 * Gelegenheiten, ihn unterschiedlich falsch zu machen oder doppelt abzuziehen.
 *
 * Deshalb gilt ab 1.48: Jede Würfelstelle holt den Abzug hier und baut die
 * Ergebniszeile hier. Die Rechnung selbst steht nur an dieser einen Stelle.
 *
 * Ilaris: Die Summe aus Wunden und Erschöpfung nennt man Einschränkungen. Die
 * ersten zwei sind frei, jede weitere kostet 2 auf ALLE Proben.
 */
import { wundabzug } from './regeln.js';

/**
 * Malus aus Wunden und Erschöpfung. Beide zählen 1 zu 1 zusammen.
 * @returns {number} Abzug, immer 0 oder größer
 */
export function malusAus(wunden, erschoepfung) {
  return wundabzug((Number(wunden) || 0) + (Number(erschoepfung) || 0));
}

/**
 * Malus aus einem Abenteuer-Ressourcenblock (Spielertisch: grosse Anfangsbuchstaben).
 */
export function malusAusRessourcen(ressourcen) {
  const r = ressourcen || {};
  const wu = r.Wunden ? (r.Wunden.aktuell || 0) : 0;
  const er = r.Erschoepfung ? (r.Erschoepfung.aktuell || 0) : 0;
  return malusAus(wu, er);
}

/**
 * Malus aus einem Vitalitäts-Eintrag des Meisters (dort heissen die Felder KLEIN:
 * wunden und erschoepfung). Genau diese Schreibweise war der Grund, warum die
 * Charakteransicht des Meisters bis 1.47 immer ohne Malus gerechnet hat.
 */
export function malusAusVitalitaet(v) {
  const x = v || {};
  return malusAus(x.wunden, x.erschoepfung);
}

/**
 * Die Ergebniszeile eines Wurfs, EINMAL gebaut, für alle Ausgaben.
 *
 * Reihenfolge wie im Council festgelegt: Rohwert, Erschwernis, Malus, Endwert.
 * Ist weder Erschwernis noch Malus im Spiel, bleibt nur "Ergebnis 18" — dann
 * entsteht keine überflüssige Rechnung.
 *
 * @param {number} roh           Wurf plus Probenwert plus Modifikatoren
 * @param {number} erschwernis   positiv erschwert, negativ erleichtert
 * @param {number} malus         Abzug aus Wunden und Erschöpfung, 0 oder mehr
 * @returns {{endwert:number, text:string, kurz:string}}
 */
export function ergebnisRechnung(roh, erschwernis = 0, malus = 0) {
  const e = Number(erschwernis) || 0;
  const m = Math.max(0, Number(malus) || 0);
  const endwert = roh - e - m;
  const teile = [`Ergebnis ${roh}`];
  if (e > 0) teile.push(`minus Erschwernis ${e}`);
  else if (e < 0) teile.push(`plus Erleichterung ${-e}`);
  if (m > 0) teile.push(`minus Malus ${m}`);
  if (teile.length > 1) teile.push(`gleich Ergebnis ${endwert}`);
  return { endwert, text: teile.join(', '), kurz: teile.length > 1 ? teile.join(', ') : '' };
}

/** Erklärung, woher der Malus kommt — für Tooltip und Protokoll. */
export function malusHerkunft(malus, wunden, erschoepfung) {
  if (!malus) return '';
  const wu = Number(wunden) || 0;
  const er = Number(erschoepfung) || 0;
  return `Malus ${malus} aus ${wu} Wunden und ${er} Erschöpfung, zusammen ${wu + er} Einschränkungen.`;
}
