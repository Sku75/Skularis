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
import { getMeister, speichere } from './state.js';
import * as player from './audio-player.js';
import * as sprache from '../sprache.js';

// Feste Reihenfolge der Plaetze mit Standard-Kombination. Die Nummer bleibt
// stabil, auch wenn die Taste umbelegt wird. Zwei Bloecke der oberen Zahlenreihe
// (Zeichen 1..0, ß, ´): Block 1 mit Strg (Plaetze 1..12), Block 2 mit Strg+Shift
// (Plaetze 13..24).
const ZEICHEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß', '´'];
const SLOTS = [];
for (let i = 0; i < ZEICHEN.length; i++) SLOTS.push({ nr: i + 1, std: `Strg+${ZEICHEN[i]}` });
for (let i = 0; i < ZEICHEN.length; i++) SLOTS.push({ nr: i + 13, std: `Strg+Shift+${ZEICHEN[i]}` });

// Physische Tastencodes der oberen Zahlenreihe -> Position 1..12. Robust auch fuer
// die ß- und ´-Taste (´ ist auf deutscher Tastatur eine Tot-Taste, deren e.key
// nicht verlaesslich ist) — deshalb erkennen wir die Standardbelegung ueber den
// layout-unabhaengigen e.code. Mit Shift verschiebt sich die Position in den
// zweiten Block (Position + 12).
const CODE_ZU_POS = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6,
  Digit7: 7, Digit8: 8, Digit9: 9, Digit0: 10, Minus: 11, Equal: 12,
};

export const MODI = ['einspielen', 'abspielen', 'hintergrund'];
export function modusName(m) {
  return m === 'abspielen' ? 'Abspielen' : (m === 'hintergrund' ? 'Hintergrund' : 'Einspielen');
}

/** Ist ein Platz belegt? Entweder mit einer Audiodatei (pfad) oder einer Playlist. */
export function istBelegt(d) {
  return !!(d && (d.pfad || (d.typ === 'playlist' && (d.playlist || d.name))));
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
  // 2) Standard der Zahlenreihe ueber den physischen Code (deckt ß und ´ sicher
  //    ab). Ohne Shift Block 1 (Position), mit Shift Block 2 (Position + 12).
  if (e.ctrlKey && !e.altKey) {
    const pos = CODE_ZU_POS[e.code];
    if (pos) {
      const nr = e.shiftKey ? pos + 12 : pos;
      if (istStandard(nr)) return nr;
    }
  }
  return null;
}

// --- Wiedergabe ----------------------------------------------------------

function slotDaten(index) {
  const a = getMeister();
  if (!a || !Array.isArray(a.kurztasten)) return null;
  return a.kurztasten[index] || null;
}

// Zeitfenster fuer den schnellen Doppeldruck (Pause dann Stop): 0,7 Sekunden.
const STOPP_FENSTER_MS = 700;
// Je Platz die Uhrzeit des Pause-Drucks (fuer die Doppeldruck-Erkennung).
const _pauseZeit = {};

function pegelVon(d) {
  return (typeof d.lautstaerke === 'number') ? Math.max(0, Math.min(1, d.lautstaerke / 100)) : null;
}

/**
 * Den Platz index im gewaehlten Modus bedienen.
 * Audiodatei (Abspielen/Hintergrund): 1. Druck spielt, 2. Druck pausiert, ein
 * schneller 3. Druck (innerhalb 0,7 s) stoppt und setzt an den Anfang zurueck;
 * ein spaeterer Druck spielt an der pausierten Stelle weiter.
 * Einspielen und Playlist: 1. Druck startet, erneuter Druck stoppt.
 * Bewusst OHNE Sprachausgabe — nur der Klang selbst ist zu hoeren.
 */
export async function spiele(index) {
  const d = slotDaten(index);
  if (!istBelegt(d)) return false;
  const pegel = pegelVon(d);

  // Playlist-Platz: eigene Wiedergabe (Start/Stopp-Umschaltung).
  if (d.typ === 'playlist') {
    try {
      const mod = await import('./audio-bereich.js');
      await mod.spielePlaylistFuerTaste(d.playlist || d.name, { modus: d.modus, loop: !!d.loop, pegel });
    } catch (err) {
      console.error('Kurztaste Playlist:', err);
      sprache.sage('Playlist konnte nicht abgespielt werden.');
    }
    return true;
  }

  if (!d.pfad) return false;
  const datei = { name: d.name, pfad: d.pfad };

  // Einspielen: kurzes Darueberlegen, keine Pause — erneuter Druck stoppt.
  if (d.modus === 'einspielen') {
    if (player.laeuftKanalFuer(d.pfad)) { player.stoppePfad(d.pfad); return true; }
    try { await player.spieleEin(datei, pegel != null ? { pegel } : {}); }
    catch (err) { console.error('Kurztaste einspielen:', err); sprache.sage('Konnte nicht abgespielt werden.'); }
    return true;
  }

  const kanal = d.modus === 'hintergrund' ? 'hintergrund' : 'abspielen';

  // Laeuft gerade (auf IRGENDEINEM Kanal) -> pausieren. Wichtig: den TATSAECHLICH
  // laufenden Kanal pausieren (nicht den aus dem Modus abgeleiteten), sonst greift
  // die Pause nach einem Moduswechsel ins Leere. Stelle merken UND mit dem
  // Abenteuer speichern, damit sie ein Neuoeffnen ueberlebt.
  const laufKanal = player.laeuftKanalFuer(d.pfad);
  if (laufKanal) {
    player.pausiereKanal(laufKanal);
    _pauseZeit[index] = Date.now();
    d.pausePos = player.pausePosFuer(d.pfad) || 0;
    merkePause();
    return true;
  }

  // Pausiert -> schneller zweiter Druck stoppt (auf Anfang), sonst weiter.
  if (player.istPfadPausiert(d.pfad)) {
    const seitPause = Date.now() - (_pauseZeit[index] || 0);
    if (seitPause <= STOPP_FENSTER_MS) { player.pauseVerwerfen(d.pfad); d.pausePos = 0; merkePause(); } // Stop, zurueck auf Anfang
    else player.fortsetzePfad(d.pfad);                                                                  // an der Stelle weiter
    return true;
  }

  // Nichts laeuft -> starten. Eine evtl. laufende Kurztasten-Playlist vorher
  // beenden, damit sie nicht in denselben Kanal hineinredet.
  try {
    const mod = await import('./audio-bereich.js');
    if (mod.stopPlaylistWiedergabe) mod.stopPlaylistWiedergabe();
  } catch { /* egal */ }
  try {
    const zielPegel = pegel != null ? pegel : (kanal === 'hintergrund' ? player.getHintergrundPegel() : 1);
    // Gespeicherte Pause-Stelle aus einer frueheren Sitzung EINMAL fortsetzen,
    // danach gilt wieder "von vorne". So laeuft nach dem Neuoeffnen nicht alles
    // bei 0 los, sondern an der pausierten Stelle weiter.
    const startOffset = (typeof d.pausePos === 'number' && d.pausePos > 0.2) ? d.pausePos : 0;
    if (startOffset) { d.pausePos = 0; merkePause(); }
    await player.spieleKanal(kanal, datei, { loop: !!d.loop, pegel: zielPegel, offset: startOffset });
  } catch (err) {
    console.error('Kurztaste abspielen:', err);
    sprache.sage('Konnte nicht abgespielt werden.'); // nur der Fehlerfall bleibt hoerbar
  }
  return true;
}

// Den aktuellen Stand des Meisterabenteuers speichern (Pausepositionen der
// Schnelltasten). Absichtlich ohne await/Fehleranzeige — es ist ein Nebenspeichern.
function merkePause() { try { speichere(); } catch { /* egal */ } }

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
    if (!istBelegt(d)) return; // freier Platz: Taste NICHT abfangen (andere Kuerzel bleiben nutzbar)
    e.preventDefault();
    e.stopImmediatePropagation();
    spiele(nr - 1);
  }, true);
}
