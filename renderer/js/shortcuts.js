/**
 * Skularis — zentrale Kuerzel-Registry (seit 1.20 modulgebunden).
 *
 * EINE Quelle der Wahrheit fuer Tastenkuerzel: jeder Eintrag hat eine Id, ein
 * Modul (global, charakter, abenteuer, meister), eine Beschreibung, die
 * Standard- und die aktuelle Kombination. Aus derselben Registry speisen sich
 * die Ausloesung (Dispatcher), die Menue-Anzeige und die Ansage (comboText) —
 * nach einer Umbelegung stimmen alle drei sofort ueberein.
 *
 * Dispatcher-Reihenfolge: erst die Waechter (offener Dialog oder Fokus in einem
 * Textfeld: KEIN Skularis-Kuerzel feuert, das Feld behaelt Strg A, Strg Z und
 * Co.), dann das aktive Modul (core/modul.js), dann Global. Modul schlaegt
 * Global — dieselbe Taste darf je Modul etwas anderes tun (z. B. Strg R).
 * Kuerzel eines Tisch-Moduls sind ausserhalb des Tisches vollstaendig stumm.
 */

import * as modul from './core/modul.js';

// Je Modul eine eigene Combo-Map: modul -> Map(comboNorm -> { handler, beschreibung })
const _module = new Map();
let _aktiv = true;

// Umbelegbare Aktionen: id -> { beschreibung, handler, standard, aktuell, modul }.
const _belegbar = new Map();
let _overrides = {};
let _persist = null;

// Kombinationen, die nie vergeben werden duerfen (Navigation und Textbearbeitung).
const GESPERRT = new Set(['escape', 'enter', 'tab', 'backspace',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end',
  'ctrl+c', 'ctrl+v', 'ctrl+x'].map(n => _normalisiere(n)));

export function init() {
  document.addEventListener('keydown', _onKeyDown, true);
}

/** Gespeicherte Ueberschreibungen setzen (VOR den registriere-Aufrufen). */
export function setOverrides(obj, persistFn) {
  _overrides = obj && typeof obj === 'object' ? { ...obj } : {};
  _persist = typeof persistFn === 'function' ? persistFn : null;
}

function mapFuer(m) {
  if (!_module.has(m)) _module.set(m, new Map());
  return _module.get(m);
}

/**
 * Ein Kuerzel registrieren.
 * @param {string} combo         z. B. 'Ctrl+K'
 * @param {Function} handler
 * @param {string} beschreibung  fuer das Tastenbelegungsmenue
 * @param {string} [id]          macht das Kuerzel umbelegbar (Speicher-Schluessel)
 * @param {object} [opts]        { modul: 'global' | 'charakter' | 'abenteuer' | 'meister' }
 */
export function registriere(combo, handler, beschreibung = '', id = null, opts = {}) {
  const m = opts.modul || 'global';
  let effektiv = combo;
  if (id) {
    if (_overrides[id]) effektiv = _overrides[id];
    _belegbar.set(id, { beschreibung, handler, standard: combo, aktuell: effektiv, modul: m });
  }
  mapFuer(m).set(_normalisiere(effektiv), { handler, beschreibung });
}

/** Liste der umbelegbaren Aktionen, optional nach Modul gefiltert. */
export function belegbareListe(modulFilter) {
  return [...(_belegbar)]
    .filter(([, e]) => !modulFilter || e.modul === modulFilter)
    .map(([id, e]) => ({ id, beschreibung: e.beschreibung, combo: e.aktuell, standard: e.standard, modul: e.modul }));
}

/**
 * Konfliktpruefung: liegt die Kombination im selben Modul oder in Global schon
 * auf einer anderen Aktion? Gibt deren Beschreibung zurueck, sonst null.
 */
export function konfliktFuer(id, combo) {
  const eigen = _belegbar.get(id);
  const c = _normalisiere(combo);
  for (const [andereId, e] of _belegbar) {
    if (andereId === id) continue;
    if (eigen && e.modul !== eigen.modul && e.modul !== 'global' && eigen.modul !== 'global') continue;
    if (_normalisiere(e.aktuell) === c) return e.beschreibung;
  }
  return null;
}

/** Ist die Kombination grundsaetzlich vergebbar? */
export function istVergebbar(combo) {
  return !GESPERRT.has(_normalisiere(combo));
}

/** Eine Aktion neu belegen (combo z. B. "Ctrl+Shift+K"). */
export function neuBelegen(id, combo) {
  const e = _belegbar.get(id);
  if (!e || !combo || !istVergebbar(combo)) return false;
  mapFuer(e.modul).delete(_normalisiere(e.aktuell));
  e.aktuell = combo;
  _overrides[id] = combo;
  mapFuer(e.modul).set(_normalisiere(combo), { handler: e.handler, beschreibung: e.beschreibung });
  if (_persist) _persist({ ..._overrides });
  return true;
}

/** Eine Aktion auf die Standardbelegung zuruecksetzen. */
export function zuruecksetzen(id) {
  const e = _belegbar.get(id);
  if (!e) return;
  mapFuer(e.modul).delete(_normalisiere(e.aktuell));
  e.aktuell = e.standard;
  delete _overrides[id];
  mapFuer(e.modul).set(_normalisiere(e.standard), { handler: e.handler, beschreibung: e.beschreibung });
  if (_persist) _persist({ ..._overrides });
}

/** Aktuelle Kombination einer Aktion (fuer Menue-Anzeige und Ansage), oder ''. */
export function comboVon(id) {
  const e = _belegbar.get(id);
  return e ? e.aktuell : '';
}

/**
 * Deutsche Anzeige- und Ansageform einer Kombination: 'Ctrl+K' wird 'Strg K',
 * 'Shift+F2' wird 'Umschalt F2'. EINE Formatierung fuer alle Menues, Ansagen und
 * die Braillezeile — nirgends steht ein fest getippter Tastenname.
 */
export function kuerzelText(combo) {
  return String(combo || '')
    .replace(/ctrl/gi, 'Strg')
    .replace(/shift/gi, 'Umschalt')
    .replace(/alt/gi, 'Alt')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kurzform: aktuelle Taste einer Aktion als deutscher Text ('Strg K'), oder ''. */
export function comboText(id) {
  const c = comboVon(id);
  return c ? kuerzelText(c) : '';
}

/** Aus einem Tastendruck einen combo-String bauen (z. B. "Ctrl+Shift+K"). */
export function comboAusEvent(e) {
  const key = (e.key || '').toLowerCase();
  if (key === 'control' || key === 'alt' || key === 'shift' || key === 'meta') return null;
  const teile = [];
  if (e.ctrlKey) teile.push('Ctrl');
  if (e.altKey) teile.push('Alt');
  if (e.shiftKey) teile.push('Shift');
  let name = e.key;
  if (name === ' ') name = 'Space';
  else if (/^f\d+$/i.test(name)) name = name.toUpperCase();
  else if (name.length === 1) name = name.toUpperCase();
  teile.push(name);
  return teile.join('+');
}

export function setAktiv(b) {
  _aktiv = b;
}

function _normalisiere(combo) {
  return String(combo || '').toLowerCase()
    .replace(/strg/g, 'ctrl')
    .replace(/\s+/g, '')
    .split('+')
    .sort()
    .join('+');
}

/** Echtes Texteingabefeld? Dort gehoeren Strg A, Strg Z und Co. dem Feld. */
function _istTextfeld(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
  }
  return false;
}

function _onKeyDown(e) {
  if (!_aktiv) return;

  // Waechter 1: offener Dialog steuert selbst (auch der Erfassungsdialog
  // "Neue Tastenkombination" faengt seine Tasten selbst).
  if (document.querySelector('dialog[open]')) return;
  // Waechter 2: Fokus in einem Textfeld — KEIN Skularis-Kuerzel feuert.
  if (_istTextfeld(e.target)) return;

  const combo = comboAusEvent(e);
  if (!combo) return;
  const c = _normalisiere(combo);

  // Modul schlaegt Global: erst im aktiven Modul nachschlagen, dann in Global.
  const aktivesModul = modul.aktivesModul();
  let eintrag = null;
  if (aktivesModul !== 'global') {
    const mm = _module.get(aktivesModul);
    if (mm) eintrag = mm.get(c) || null;
  }
  if (!eintrag) {
    const gm = _module.get('global');
    if (gm) eintrag = gm.get(c) || null;
  }
  if (!eintrag) return;

  e.preventDefault();
  e.stopPropagation();
  try {
    eintrag.handler(e);
  } catch (err) {
    console.error(`Shortcut ${combo}:`, err);
  }
}
