/**
 * Skularistool — verdeckte Meister-Wuerfel.
 *
 * Alle Wuerfe hier sind "verdeckt": sie werden nur dem Spielleiter angesagt und
 * ins Protokoll geschrieben. Am Tisch spielt sich das ohnehin auf dem Rechner
 * des Spielleiters ab, die Spieler hoeren also nichts davon.
 */
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { getMeister, speichere } from './state.js';
import { protokolliere } from '../core/meister-abenteuer.js';

function mittel3(w) { const s = [...w].sort((a, b) => a - b); return s[1]; }

function merke(text) {
  const a = getMeister();
  if (a) { protokolliere(a, text); speichere(); }
}

/**
 * Verdeckte Probe fuer eine Figur (Gruppenrecherche, Gruppenprobe).
 * @param {object} o
 * @param {string} o.wer       Name der Figur
 * @param {string} o.was       Was geprueft wird (Fertigkeit/Attribut)
 * @param {number} o.probenwert
 * @param {number} [o.schwierigkeit]  feste Schwierigkeit (dann Erfolg/Misserfolg)
 * @param {number} [o.anzahl]   1 (Konflikt) oder 3 (entspannt, mittlerer zaehlt); Standard 3
 */
export function verdeckteProbe(o) {
  const anzahl = o.anzahl === 1 ? 1 : 3;
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * 20));
  const wert = anzahl === 3 ? mittel3(wuerfe) : wuerfe[0];
  const ew = wert + (o.probenwert || 0);
  sounds.playWuerfel();
  const wtext = anzahl === 3 ? `drei W20 ${wuerfe.join(', ')}, der mittlere zaehlt ${wert}` : `ein W20 ${wert}`;
  let erfolg = '';
  let gelungen = null;
  if (typeof o.schwierigkeit === 'number') {
    gelungen = ew >= o.schwierigkeit;
    erfolg = ` Gegen Schwierigkeit ${o.schwierigkeit}: ${gelungen ? 'gelungen' : 'misslungen'}.`;
  }
  const ansage = `Verdeckt. Probenergebnis ${ew}.${erfolg} ${o.wer}, ${o.was}, Probenwert ${o.probenwert}, ${wtext}.`;
  merke(`Verdeckte Probe, ${o.wer}, ${o.was}: ${wtext}, Probenwert ${o.probenwert}, Ergebnis ${ew}.${erfolg}`);
  // stumm: der Aufrufer sagt selbst an (z. B. auf dem Spielbrett mit Kartennamen zuerst).
  if (!o.stumm) sprache.sage(ansage);
  return { ew, wuerfe, gelungen, ansage };
}

/** Freier verdeckter Wurf (Anzahl, Seiten, Modifikator). stumm: Aufrufer sagt selbst an. */
export function verdeckterWurf(anzahl, seiten, mod = 0, was = 'Meister-Wurf', stumm = false) {
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) + (mod || 0);
  sounds.playWuerfel();
  const bez = `${anzahl} W ${seiten}${mod ? (mod > 0 ? ` plus ${mod}` : ` minus ${-mod}`) : ''}`;
  const ansage = `Verdeckt. ${was}, ${bez}, Ergebnis ${wuerfe.join(', ')}${mod ? `, Summe ${summe}` : ''}.`;
  merke(`Verdeckter Wurf, ${bez}: ${wuerfe.join(', ')}${mod ? `, Summe ${summe}` : ''}.`);
  if (!stumm) sprache.sage(ansage);
  return { summe, wuerfe, ansage };
}
