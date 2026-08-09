/**
 * Skularis — Zentraler State (Event-Emitter)
 * Haelt den aktuellen Charakter, Datenbank-Cache und App-Zustand.
 */

const _listeners = {};

export const state = {
  charakter: null,
  datenbank: null,
  config: {},
  dirty: false,
  aktuellerReiter: 0,
};

export function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
}

export function off(event, fn) {
  const arr = _listeners[event];
  if (!arr) return;
  const idx = arr.indexOf(fn);
  if (idx >= 0) arr.splice(idx, 1);
}

export function emit(event, data) {
  const arr = _listeners[event];
  if (!arr) return;
  for (const fn of arr) {
    try { fn(data); } catch (e) { console.error(`Event "${event}":`, e); }
  }
}

export function setCharakter(c) {
  state.charakter = c;
  state.dirty = false;
  emit('charakter-geladen', c);
}

export function markDirty() {
  if (!state.dirty) {
    state.dirty = true;
    emit('dirty-changed', true);
  }
}

export function markClean() {
  state.dirty = false;
  emit('dirty-changed', false);
}

export function setDatenbank(db) {
  state.datenbank = db;
  emit('datenbank-geladen', db);
}

export function setConfig(cfg) {
  state.config = cfg;
  emit('config-geladen', cfg);
}
