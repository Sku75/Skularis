/**
 * Skularis — Einstellungen (Renderer-seitig)
 * Wrapper um IPC-Aufrufe zum Main-Prozess.
 * Portierung von daten/einstellungen.py
 */

let _cache = null;

const DEFAULTS = {
  schrift_offset: 0,
  sound_an: true,
  sprache_an: true,
  lautstaerke: 80,
  letzte_dateien: [],
};

export async function laden() {
  if (_cache) return _cache;
  try {
    const result = await window.skularis.ipc.configLesen();
    _cache = result?.config ?? { ...DEFAULTS };
  } catch {
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

export async function get(key) {
  const cfg = await laden();
  return cfg[key] ?? DEFAULTS[key];
}

export async function setWert(key, value) {
  const cfg = await laden();
  cfg[key] = value;
  _cache = cfg;
  try {
    await window.skularis.ipc.configSchreiben(key, value);
  } catch (e) {
    console.error('Config-Schreiben fehlgeschlagen:', e);
  }
}

export async function letzteDateiMerken(pfad) {
  const cfg = await laden();
  let dateien = cfg.letzte_dateien || [];
  dateien = dateien.filter(p => p !== pfad);
  dateien.unshift(pfad);
  if (dateien.length > 5) dateien.length = 5;
  cfg.letzte_dateien = dateien;
  _cache = cfg;
  try {
    await window.skularis.ipc.letzteDateiMerken(pfad);
  } catch (e) {
    console.error('Letzte-Datei-Merken fehlgeschlagen:', e);
  }
}

export async function letzteDateien() {
  try {
    return await window.skularis.ipc.letzteDateien();
  } catch (e) {
    console.error('Letzte Dateien laden fehlgeschlagen:', e);
    return [];
  }
}

export function invalidateCache() {
  _cache = null;
}
