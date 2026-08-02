/**
 * Skularis Alpha 0.02.03 — Tastenkuerzel-Manager
 * Portierung der 35+ Shortcuts aus hauptfenster.py _registriere_shortcuts()
 */

import { state, emit } from './state.js';
import * as sounds from './sounds.js';
import * as sprache from './sprache.js';

const _shortcuts = new Map();
let _aktiv = true;

// Umbelegbare Aktionen: id -> { beschreibung, handler, standard, aktuell }.
// Damit kann man in den Optionen Tasten frei neu belegen; die Ueberschreibungen
// werden gespeichert und beim Start wieder angewendet.
const _belegbar = new Map();
let _overrides = {};
let _persist = null;

export function init() {
  document.addEventListener('keydown', _onKeyDown, true);
}

/** Gespeicherte Ueberschreibungen setzen (VOR den registriere-Aufrufen). */
export function setOverrides(obj, persistFn) {
  _overrides = obj && typeof obj === 'object' ? { ...obj } : {};
  _persist = typeof persistFn === 'function' ? persistFn : null;
}

/**
 * Ein Kuerzel registrieren. Mit `id` wird es umbelegbar: liegt eine gespeicherte
 * Ueberschreibung vor, gilt diese statt `combo`.
 */
export function registriere(combo, handler, beschreibung = '', id = null) {
  let effektiv = combo;
  if (id) {
    if (_overrides[id]) effektiv = _overrides[id];
    _belegbar.set(id, { beschreibung, handler, standard: combo, aktuell: effektiv });
  }
  _shortcuts.set(_normalisiere(effektiv), { handler, beschreibung });
}

/** Liste der umbelegbaren Aktionen fuer die Optionen. */
export function belegbareListe() {
  return [...(_belegbar)].map(([id, e]) => ({ id, beschreibung: e.beschreibung, combo: e.aktuell, standard: e.standard }));
}

/** Eine Aktion neu belegen (combo z. B. "Ctrl+Shift+K"). */
export function neuBelegen(id, combo) {
  const e = _belegbar.get(id);
  if (!e || !combo) return false;
  _shortcuts.delete(_normalisiere(e.aktuell));
  e.aktuell = combo;
  _overrides[id] = combo;
  _shortcuts.set(_normalisiere(combo), { handler: e.handler, beschreibung: e.beschreibung });
  if (_persist) _persist({ ..._overrides });
  return true;
}

/** Eine Aktion auf die Standardbelegung zuruecksetzen. */
export function zuruecksetzen(id) {
  const e = _belegbar.get(id);
  if (!e) return;
  _shortcuts.delete(_normalisiere(e.aktuell));
  e.aktuell = e.standard;
  delete _overrides[id];
  _shortcuts.set(_normalisiere(e.standard), { handler: e.handler, beschreibung: e.beschreibung });
  if (_persist) _persist({ ..._overrides });
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

export function entferne(combo) {
  _shortcuts.delete(_normalisiere(combo));
}

export function setAktiv(b) {
  _aktiv = b;
}

export function getAlleShortcuts() {
  const result = [];
  for (const [combo, { beschreibung }] of _shortcuts) {
    result.push({ combo, beschreibung });
  }
  return result;
}

function _normalisiere(combo) {
  return combo.toLowerCase()
    .replace(/strg/g, 'ctrl')
    .replace(/\s+/g, '')
    .split('+')
    .sort()
    .join('+');
}

function _eventZuCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  let key = e.key.toLowerCase();
  if (key === 'control' || key === 'alt' || key === 'shift') return null;

  // Funktionstasten
  if (/^f\d+$/.test(key)) {
    parts.push(key);
  } else if (key === ' ') {
    parts.push('space');
  } else if (key === 'escape') {
    parts.push('escape');
  } else if (key === 'enter') {
    parts.push('enter');
  } else if (key === 'tab') {
    parts.push('tab');
  } else if (key === 'delete') {
    parts.push('delete');
  } else if (key === 'backspace') {
    parts.push('backspace');
  } else if (key === 'home') {
    parts.push('home');
  } else if (key === 'end') {
    parts.push('end');
  } else if (key === 'arrowup') {
    parts.push('arrowup');
  } else if (key === 'arrowdown') {
    parts.push('arrowdown');
  } else if (key === 'arrowleft') {
    parts.push('arrowleft');
  } else if (key === 'arrowright') {
    parts.push('arrowright');
  } else {
    parts.push(key);
  }
  return parts.sort().join('+');
}

function _onKeyDown(e) {
  if (!_aktiv) return;

  const combo = _eventZuCombo(e);
  if (!combo) return;

  const eintrag = _shortcuts.get(combo);
  if (!eintrag) return;

  e.preventDefault();
  e.stopPropagation();
  try {
    eintrag.handler(e);
  } catch (err) {
    console.error(`Shortcut ${combo}:`, err);
  }
}

// --- Standard-Shortcuts registrieren ---

export function registriereStandards() {
  // Datei
  registriere('Ctrl+N', () => emit('aktion', { aktion: 'neu' }), 'Neuer Charakter');
  registriere('Ctrl+O', () => emit('aktion', { aktion: 'oeffnen' }), 'Charakter öffnen');
  registriere('Ctrl+S', () => emit('aktion', { aktion: 'speichern' }), 'Speichern');
  registriere('Ctrl+Shift+S', () => emit('aktion', { aktion: 'speichern_als' }), 'Speichern unter');
  registriere('Ctrl+E', () => emit('aktion', { aktion: 'exportieren' }), 'Exportieren');
  registriere('Ctrl+W', () => emit('aktion', { aktion: 'schliessen' }), 'Charakter schliessen');

  // Navigation — Alt-Shortcuts laufen über Electron-Menü-Accelerators (menu.js),
  // weil Electron die Alt-Taste für die Menüleiste abfängt.
  // Hier nur zur Dokumentation in der Shortcut-Liste registriert:
  registriere('Alt+ArrowLeft', () => emit('reiter-voriger'), 'Voriger Reiter');
  registriere('Alt+ArrowRight', () => emit('reiter-naechster'), 'Nächster Reiter');

  // EP
  registriere('Ctrl+P', () => emit('aktion', { aktion: 'ap_hinzufuegen' }), 'EP hinzufügen');

  // Sonstiges
  registriere('Ctrl+I', () => emit('aktion', { aktion: 'info_reiter' }), 'Info-Reiter öffnen');
  registriere('Ctrl+T', () => emit('aktion', { aktion: 'tastenkombinationen' }), 'Tastenkombinationen anzeigen');
  registriere('Ctrl+F', () => emit('aktion', { aktion: 'suchen' }), 'Suchen');
  registriere('F5', () => emit('aktion', { aktion: 'aktualisieren' }), 'Ansicht aktualisieren');

  // Sprachausgabe umschalten (NUR Sprache, NICHT Software-Sounds)
  registriere('Ctrl+M', () => {
    const neuerWert = !sprache.istAn();
    sprache.setAn(neuerWert);
    sounds.playClick(); // Sound bleibt AN — nur Sprache wird umgeschaltet
    // Einmalige Ansage auch beim Deaktivieren (direkt via aria-live)
    if (!neuerWert) {
      const el = document.getElementById('sr-live');
      if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = 'Sprachausgabe deaktiviert'; }); }
    } else {
      sprache.sage('Sprachausgabe aktiviert');
    }
  }, 'Sprachausgabe ein/aus');

  // Schriftgroesse
  registriere('Ctrl++', () => emit('aktion', { aktion: 'schrift_plus' }), 'Schrift vergrößern');
  registriere('Ctrl+-', () => emit('aktion', { aktion: 'schrift_minus' }), 'Schrift verkleinern');
  registriere('Ctrl+0', () => emit('aktion', { aktion: 'schrift_reset' }), 'Schrift zurücksetzen');

  // Regelwerk
  registriere('F1', () => emit('aktion', { aktion: 'regelwerk' }), 'Regelwerk öffnen');

  // Letzte Dateien
  registriere('Ctrl+1', () => emit('aktion', { aktion: 'letzte_1' }), 'Letzte Datei 1');
  registriere('Ctrl+2', () => emit('aktion', { aktion: 'letzte_2' }), 'Letzte Datei 2');
  registriere('Ctrl+3', () => emit('aktion', { aktion: 'letzte_3' }), 'Letzte Datei 3');
}
