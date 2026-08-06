/**
 * Skularis — umbelegbare Reiter-Tasten der Tische.
 *
 * Jeder Tisch (Abenteuer, Meister) hat feste Reiter (Menüpunkte mit F-Taste).
 * Standard: F1 = erster Reiter, F2 = zweiter … und Shift+F<n> = derselbe Reiter,
 * aber FRISCH am ersten Menüpunkt (die gemerkte Stelle wird verworfen).
 *
 * Hier kann der Nutzer die Tasten frei umbelegen — PRO TISCH getrennt, mit den
 * echten Menünamen. Die Belegung wird in den Einstellungen gespeichert.
 *
 * Reiter werden über ihre feste Nummer angesprochen (die F-Standardnummer). Das
 * bleibt stabil, auch wenn die Taste umbelegt wird: die Nummer bestimmt, welcher
 * Reiter gemeint ist, die Kombination bestimmt nur, WELCHE Taste ihn auslöst.
 */

// Feste Reiter je Tisch: Nummer (Standard-F-Taste) und Menüname. Muss zur
// Reihenfolge der Hub-Punkte in den Tisch-Screens passen (Audio liegt fest auf 12).
const TABS = {
  abenteuer: [
    { nr: 1, name: 'Meine Initiative-Phase' },
    { nr: 2, name: 'Charakterstatus' },
    { nr: 3, name: 'Charakterbogen' },
    { nr: 4, name: 'Inventar' },
    { nr: 5, name: 'Notizen und Tagebuch' },
    { nr: 6, name: 'Mitspieler' },
    { nr: 7, name: 'Protokoll' },
    { nr: 8, name: 'Regeln' },
    { nr: 9, name: 'Spielfeld' },
    { nr: 12, name: 'Audio' },
  ],
  meister: [
    { nr: 1, name: 'Gruppenrecherche' },
    { nr: 2, name: 'Gruppenprobe' },
    { nr: 3, name: 'Spieltisch' },
    { nr: 4, name: 'Charakterbögen und Notizen' },
    { nr: 5, name: 'Gegner-Bibliothek' },
    { nr: 6, name: 'Freundliche NPC' },
    { nr: 7, name: 'Meistertexte 1' },
    { nr: 8, name: 'Meistertexte 2' },
    { nr: 9, name: 'Regeln' },
    { nr: 10, name: 'Protokoll' },
    { nr: 11, name: 'Gruppenzusammenstellung' },
    { nr: 12, name: 'Audio' },
  ],
};

export const BEREICHE = ['abenteuer', 'meister'];
export function bereichName(b) { return b === 'meister' ? 'Meistertisch' : 'Abenteuertisch'; }
export function istBereich(b) { return b === 'abenteuer' || b === 'meister'; }

// Overrides: { abenteuer: { '2': { normal:'F10', oben:'Shift+F10' } }, meister: {...} }
let _overrides = {};
let _persist = null;

/** Gespeicherte Belegungen setzen (beim Start, VOR dem Öffnen eines Tisches). */
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

/** Aktuelle Kombination für einen Reiter (frisch = Shift/„oben"-Variante). */
export function comboFuer(bereich, nr, frisch) {
  const o = _overrides[bereich] && _overrides[bereich][nr];
  const key = frisch ? 'oben' : 'normal';
  if (o && o[key]) return o[key];
  return frisch ? `Shift+F${nr}` : `F${nr}`;
}

/** Reverse: welche Reiter-Aktion löst eine gedrückte Kombination aus? */
export function lookup(bereich, combo) {
  const c = norm(combo);
  for (const t of (TABS[bereich] || [])) {
    if (norm(comboFuer(bereich, t.nr, false)) === c) return { nr: t.nr, frisch: false };
    if (norm(comboFuer(bereich, t.nr, true)) === c) return { nr: t.nr, frisch: true };
  }
  return null;
}

/** Liste für das Optionen-Menü (mit Namen und aktuellen Belegungen). */
export function liste(bereich) {
  return (TABS[bereich] || []).map(t => ({
    nr: t.nr,
    name: t.name,
    normal: comboFuer(bereich, t.nr, false),
    oben: comboFuer(bereich, t.nr, true),
    stdNormal: `F${t.nr}`,
    stdOben: `Shift+F${t.nr}`,
  }));
}

/** Eine Belegung ändern. combo z. B. "F10" oder "Shift+F10". */
export function setCombo(bereich, nr, frisch, combo) {
  if (!istBereich(bereich) || !combo) return;
  _overrides[bereich] = _overrides[bereich] || {};
  _overrides[bereich][nr] = _overrides[bereich][nr] || {};
  _overrides[bereich][nr][frisch ? 'oben' : 'normal'] = combo;
  if (_persist) _persist({ ..._overrides });
}

/** Eine Belegung auf Standard zurücksetzen. */
export function reset(bereich, nr, frisch) {
  const o = _overrides[bereich] && _overrides[bereich][nr];
  if (o) {
    delete o[frisch ? 'oben' : 'normal'];
    if (!o.normal && !o.oben) delete _overrides[bereich][nr];
    if (_overrides[bereich] && Object.keys(_overrides[bereich]).length === 0) delete _overrides[bereich];
  }
  if (_persist) _persist({ ..._overrides });
}
