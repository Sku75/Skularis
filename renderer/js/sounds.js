/**
 * Skularis Alpha 0.02.03 — Sound-System (HTML5 Audio + AudioContext Fallback)
 * Komplettes Audio-Redesign mit benutzerdefinierten WAV-Dateien
 */

import * as einstellungen from './daten/einstellungen.js';

const SOUND_MAP = {
  start:          'Skularis Logo.wav',
  click:          'sound3.wav',
  bing:           'Sound1.wav',
  error:          'sound 15.wav',
  // Bildschirmwechsel: zwei Töne aufwärts beim Vorgehen, dieselben zwei Töne
  // abwärts beim Zurückgehen. Gleiche Klangfarbe, gespiegelte Richtung, damit
  // ohne Hinsehen klar ist, in welche Richtung es ging. Beide klingen lange aus.
  tab:            'ebene-vor.wav',
  schliessen:     'ebene-zurueck.wav',
  wuerfel:        'wuerfel.wav',
  // Info-Fenster (Tooltip und Strg und I): Papier blättert auf, Buch schlägt zu.
  buch_auf:       'buch-auf.wav',
  buch_zu:        'buch-zu.wav',
  // Anschlag am Listenrand: derselbe Klang wie 'error', nur leiser. Danach wird
  // die aktuelle Zeile erneut vorgelesen, damit der Ton die Ansage nicht verdeckt.
  grenze:         'sound 15.wav',
  oeffnen:        'sound10.wav',
  speichern:      'sound20.wav',
  loeschen:       'sound 8.wav',
  sonderinhalt:   'sound2.wav',
  navigation:     'sound3.wav',
  eingabe_start:  'sound 7.wav',
  eingabe_ende:   'sound 8.wav',
  wert_hoch:      'sound 13.wav',
  wert_runter:    'sound 14.wav',
  ap_bezahlen:    'sound 16.wav',
  ap_zurueck:     'sound 17.wav',
};

const FALLBACK_BEEPS = {
  start:         { freq: 523, ms: 200 },
  click:         { freq: 660, ms: 60 },
  bing:          { freq: 880, ms: 120 },
  error:         { freq: 220, ms: 400 },
  tab:           { freq: 740, ms: 220 },
  wuerfel:       { freq: 900, ms: 120 },
  buch_auf:      { freq: 660, ms: 160 },
  buch_zu:       { freq: 300, ms: 160 },
  grenze:        { freq: 220, ms: 400 },
  oeffnen:       { freq: 523, ms: 100 },
  schliessen:    { freq: 494, ms: 220 },
  speichern:     { freq: 660, ms: 100 },
  loeschen:      { freq: 330, ms: 200 },
  sonderinhalt:  { freq: 880, ms: 150 },
  navigation:    { freq: 550, ms: 40 },
  eingabe_start: { freq: 600, ms: 60 },
  eingabe_ende:  { freq: 500, ms: 80 },
  wert_hoch:     { freq: 700, ms: 80 },
  wert_runter:   { freq: 400, ms: 80 },
  ap_bezahlen:   { freq: 750, ms: 150 },
  ap_zurueck:    { freq: 450, ms: 150 },
};

// Pro-Sound Lautstaerke-Faktor (Multiplikator auf _globalVolume)
// Bedien-Toene (Menue-Navigation) sind bewusst leise, damit sie die
// Sprachausgabe nicht ueberdecken — je um die Haelfte reduziert.
const VOLUME_MAP = {
  navigation: 0.075,  // Pfeil-Navigation zwischen Zeilen
  tab:        0.30,   // Bildschirmwechsel vor
  schliessen: 0.30,   // Bildschirmwechsel zurueck, gleich laut wie vor
  click:      0.35,   // Menuepunkt auswaehlen
  grenze:     0.45,   // Anschlag am Listenrand, etwas leiser als error, danach folgt die Ansage
  buch_auf:   0.30,   // Info-Fenster oeffnet
  buch_zu:    0.30,   // Info-Fenster schliesst
};
const DEFAULT_VOLUME_FACTOR = 0.7;  // Alle anderen 30% leiser

let _soundAn = true;
let _globalVolume = 0.5;
const _audioCache = {};
let _audioCtx = null;

export async function init() {
  _soundAn = await einstellungen.get('sound_an') !== false;
  const vol = await einstellungen.get('lautstaerke');
  if (vol != null) _globalVolume = Math.max(0, Math.min(1, vol / 100));
  _preload();
}

export function setSoundAn(an) {
  _soundAn = an;
  einstellungen.setWert('sound_an', an);
}

export function istSoundAn() {
  return _soundAn;
}

export function setVolume(prozent) {
  _globalVolume = Math.max(0, Math.min(1, prozent / 100));
  einstellungen.setWert('lautstaerke', Math.round(prozent));
}

export function getVolume() {
  return Math.round(_globalVolume * 100);
}

export function play(name) {
  if (!_soundAn) return;
  const file = SOUND_MAP[name];
  if (!file) {
    _playFallbackBeep(name);
    return;
  }
  const audio = _getOrCreate(file);
  if (!audio) {
    _playFallbackBeep(name);
    return;
  }
  audio.volume = _globalVolume * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR);
  audio.currentTime = 0;
  audio.play().catch(() => _playFallbackBeep(name));
}

function _preload() {
  for (const [, file] of Object.entries(SOUND_MAP)) {
    if (file) _getOrCreate(file);
  }
}

function _getOrCreate(file) {
  if (_audioCache[file]) return _audioCache[file];
  try {
    const audio = new Audio(`assets/sounds/${file}`);
    audio.preload = 'auto';
    _audioCache[file] = audio;
    return audio;
  } catch {
    return null;
  }
}

function _playFallbackBeep(name) {
  const b = FALLBACK_BEEPS[name];
  if (!b) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.frequency.value = b.freq;
    gain.gain.value = _globalVolume * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR) * 0.3;
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + b.ms / 1000);
  } catch { /* Fallback fehlgeschlagen — still ignorieren */ }
}

// Kurzfunktionen
export function playStart()        { play('start'); }
export function playClick()        { play('click'); }
export function playBing()         { play('bing'); }
export function playError()        { play('error'); }
export function playTab()          { play('tab'); }
export function playOeffnen()      { play('oeffnen'); }
export function playSchliessen()   { play('schliessen'); }
export function playWuerfel()      { play('wuerfel'); }
export function playSpeichern()    { play('speichern'); }
export function playLoeschen()     { play('loeschen'); }
export function playSonderinhalt() { play('sonderinhalt'); }
export function playNavigation()   { play('navigation'); }
export function playEingabeStart() { play('eingabe_start'); }
export function playEingabeEnde()  { play('eingabe_ende'); }
export function playWertHoch()     { play('wert_hoch'); }
export function playWertRunter()   { play('wert_runter'); }
export function playApBezahlen()   { play('ap_bezahlen'); }
export function playApZurueck()    { play('ap_zurueck'); }

// Rueckwaertskompatibilitaet
export function playBestaetigen()  { play('bing'); }
export function playEingabe()      { play('eingabe_ende'); }
