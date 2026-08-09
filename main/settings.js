/**
 * Skularis — Settings Management (skularis_config.json)
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  schrift_offset: 0,
  sound_an: true,
  sprache_an: true,
  letzte_dateien: [],
  lautstaerke: 80,
};

let _cache = null;

function configPfad() {
  const { getBasisPfad } = require('./main');
  return path.join(getBasisPfad(), 'skularistool_config.json');
}

function laden() {
  if (_cache) return _cache;
  const pfad = configPfad();
  _cache = { ...DEFAULTS };
  try {
    if (fs.existsSync(pfad)) {
      const geladen = JSON.parse(fs.readFileSync(pfad, 'utf-8'));
      if (geladen && typeof geladen === 'object') {
        Object.assign(_cache, geladen);
      }
    }
  } catch (_e) { /* ignore */ }
  return _cache;
}

function speichern() {
  try {
    fs.writeFileSync(configPfad(), JSON.stringify(laden(), null, 2), 'utf-8');
  } catch (_e) { /* ignore */ }
}

function get(key) {
  const cfg = laden();
  return key in cfg ? cfg[key] : DEFAULTS[key];
}

function setWert(key, value) {
  laden()[key] = value;
  speichern();
}

function letzteDateiMerken(pfad) {
  const cfg = laden();
  let liste = Array.isArray(cfg.letzte_dateien) ? [...cfg.letzte_dateien] : [];
  const norm = path.normalize(pfad);
  liste = liste.filter(p => p !== norm);
  liste.unshift(norm);
  cfg.letzte_dateien = liste.slice(0, 3);
  speichern();
}

module.exports = { laden, get, setWert, letzteDateiMerken, speichern, DEFAULTS };
