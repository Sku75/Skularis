/**
 * Skularis — Audio-Schnelltasten des Meistertisches (Strg+1 bis Strg+´).
 *
 * Zwei getrennte Dinge:
 *   1. Die TASTENBELEGUNG (welche physische Taste welchen Platz ausloest) ist
 *      GLOBAL fuers Programm und in den Optionen umbelegbar. Standard sind die
 *      zwoelf Tasten der oberen Zahlenreihe mit Strg: Strg+1 bis Strg+0, Strg+ß,
 *      Strg+´. Gespeichert in den Einstellungen ('kurztasten_belegung').
 *   2. Die BELEGUNG MIT EINER AUDIODATEI (Datei, Modus, Schleife, Lautstaerke)
 *      gehoert zum EINZELNEN Meisterabenteuer (getMeister().kurztasten). Ein neues
 *      Abenteuer startet mit leeren Schnelltasten.
 *
 * Druecke der Meister waehrend des Spiels eine Schnelltaste, wird die zugeordnete
 * Datei sofort im gewaehlten Modus gespielt — ohne ins F12-Menue zu wechseln.
 */
import { comboAusEvent } from '../shortcuts.js';
import { aktiverBereich } from '../ui/reiter-hub.js';
import { getMeister } from './state.js';
import * as player from './audio-player.js';
import * as sprache from '../sprache.js';

// Feste Reihenfolge der zwoelf Plaetze (Nummer 1..12) mit Standard-Kombination
// und Anzeigename. Die Nummer bleibt stabil, auch wenn die Taste umbelegt wird.
const SLOTS = [
  { nr: 1, std: 'Strg+1' }, { nr: 2, std: 'Strg+2' }, { nr: 3, std: 'Strg+3' },
  { nr: 4, std: 'Strg+4' }, { nr: 5, std: 'Strg+5' }, { nr: 6, std: 'Strg+6' },
  { nr: 7, std: 'Strg+7' }, { nr: 8, std: 'Strg+8' }, { nr: 9, std: 'Strg+9' },
  { nr: 10, std: 'Strg+0' }, { nr: 11, std: 'Strg+ß' }, { nr: 12, std: 'Strg+´' },
];

// Physische Tastencodes der oberen Zahlenreihe -> Platz-Nummer. Robust auch fuer
// die ß- und ´-Taste (´ ist auf deutscher Tastatur eine Tot-Taste, deren e.key
// nicht verlaesslich ist) — deshalb erkennen wir die Standardbelegung ueber den
// layout-unabhaengigen e.code.
const CODE_ZU_NR = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6,
  Digit7: 7, Digit8: 8, Digit9: 9, Digit0: 10, Minus: 11, Equal: 12,
};

export const MODI = ['einspielen', 'abspielen', 'hintergrund'];
export function modusName(m) {
  return m === 'abspielen' ? 'Abspielen' : (m === 'hintergrund' ? 'Hintergrund' : 'Einspielen');
}

let _overrides = {};   // { '1': 'Strg+J', ... } nur abweichende Belegungen
let _persist = null;

/** Gespeicherte Tastenbelegungen setzen (beim Start). */
export function setOverrides(obj, persistFn) {
  _overrides = obj && typeof obj === 'object' ? { ...obj } : {};
  _persist = typeof persistFn === 'function' ? persistFn : null;
}

function norm(combo) {
  return String(combo || '').toLowerCase()
    .replace(/strg/g, 'ctrl')
    .replace(/\s+/g, '')
    .split('+').sort().join('+');
}

function stdVon(nr) { const s = SLOTS.find(x => x.nr === nr); return s ? s.std : `Strg+${nr}`; }

/** Aktuelle Kombination eines Platzes (Ueberschreibung oder Standard). */
export function comboFuer(nr) { return _overrides[nr] || stdVon(nr); }

/** Nutzt der Platz noch die Standardbelegung? */
function istStandard(nr) { return !_overrides[nr]; }

/** Liste fuer das Optionen-Menue. */
export function liste() {
  return SLOTS.map(s => ({ nr: s.nr, combo: comboFuer(s.nr), std: s.std }));
}

/** Eine Taste umbelegen. */
export function setCombo(nr, combo) {
  if (!combo) return;
  _overrides[nr] = combo;
  if (_persist) _persist({ ..._overrides });
}

/** Eine Taste auf den Standard zuruecksetzen. */
export function reset(nr) {
  delete _overrides[nr];
  if (_persist) _persist({ ..._overrides });
}

/** Welchen Platz loest ein Tastendruck aus? (Nummer 1..12 oder null) */
function trefferNr(e) {
  // 1) Umbelegte (und passende Standard-) Kombinationen ueber die Taste selbst.
  const combo = comboAusEvent(e);
  if (combo) {
    const c = norm(combo);
    for (const s of SLOTS) if (norm(comboFuer(s.nr)) === c) return s.nr;
  }
  // 2) Standard der Zahlenreihe ueber den physischen Code (deckt ß und ´ sicher ab).
  if (e.ctrlKey && !e.altKey && !e.shiftKey) {
    const nr = CODE_ZU_NR[e.code];
    if (nr && istStandard(nr)) return nr;
  }
  return null;
}

// --- Wiedergabe ----------------------------------------------------------

function slotDaten(index) {
  const a = getMeister();
  if (!a || !Array.isArray(a.kurztasten)) return null;
  return a.kurztasten[index] || null;
}

/** Den Platz index (0..11) im gewaehlten Modus abspielen. */
export async function spiele(index) {
  const d = slotDaten(index);
  if (!d || !d.pfad) return false;
  // Umschalten: laeuft der Klang dieser Taste schon (egal auf welchem Kanal),
  // blendet ein zweiter Druck ihn weich aus und stoppt ihn (Ausblendzeit rund
  // 1,2 Sekunden wie im Player). Kein neues Starten.
  // Bewusst OHNE Sprachausgabe: beim Ausloesen (und Stoppen) einer Schnelltaste
  // wird nicht vorgelesen, was passiert — nur der Klang selbst ist zu hoeren.
  if (player.laeuftKanalFuer(d.pfad)) {
    player.stoppePfad(d.pfad);
    return true;
  }
  const datei = { name: d.name, pfad: d.pfad };
  const pegel = (typeof d.lautstaerke === 'number') ? Math.max(0, Math.min(1, d.lautstaerke / 100)) : null;
  try {
    if (d.modus === 'abspielen') {
      await player.spieleKanal('abspielen', datei, { loop: !!d.loop, pegel: pegel != null ? pegel : 1 });
    } else if (d.modus === 'hintergrund') {
      await player.spieleKanal('hintergrund', datei, { loop: !!d.loop, pegel: pegel != null ? pegel : player.getHintergrundPegel() });
    } else {
      await player.spieleEin(datei, pegel != null ? { pegel } : {});
    }
  } catch (err) {
    console.error('Kurztaste abspielen:', err);
    sprache.sage('Konnte nicht abgespielt werden.'); // nur der Fehlerfall bleibt hoerbar
  }
  return true;
}

// --- Globaler Tastendruck-Handler ---------------------------------------

let _handlerInstalliert = false;

/**
 * Den globalen Handler installieren. Er reagiert NUR, wenn ein Meister-Hub offen
 * ist und ein Meisterabenteuer geladen ist. Damit stoert er an keiner anderen
 * Stelle. Wird in der Erfassungsphase VOR dem Shortcut-Manager registriert,
 * damit eine belegte Schnelltaste (z. B. Strg+0) Vorrang vor einer globalen
 * Standardbelegung hat.
 */
export function initHandler() {
  if (_handlerInstalliert) return;
  _handlerInstalliert = true;
  document.addEventListener('keydown', (e) => {
    if (aktiverBereich() !== 'meister') return;   // nur am Meistertisch
    if (!getMeister()) return;
    if (document.querySelector('dialog[open]')) return; // kein Abfangen bei offenem Dialog
    // In echten Texteingaben (Notizen) nichts abfangen.
    const t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'TEXTAREA'
      || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes((t.type || 'text').toLowerCase())))) return;
    const nr = trefferNr(e);
    if (!nr) return;
    const d = slotDaten(nr - 1);
    if (!d || !d.pfad) return; // freier Platz: Taste NICHT abfangen (andere Kuerzel bleiben nutzbar)
    e.preventDefault();
    e.stopImmediatePropagation();
    spiele(nr - 1);
  }, true);
}
