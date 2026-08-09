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
  // Info-Fenster (Tooltip mit Shift und Pfeil-runter, Strg und I): neue Tooltip-Toene.
  buch_auf:       'tooltip-auf.ogg',
  buch_zu:        'tooltip-zu.ogg',
  // ESC-/Verlassen-Menue an beiden Tischen (Abenteuer schliessen).
  esc_verlassen:  'esc-verlassen.mp3',
  // Anschlag am Listenrand: derselbe Klang wie 'error', nur leiser. Danach wird
  // die aktuelle Zeile erneut vorgelesen, damit der Ton die Ansage nicht verdeckt.
  grenze:         'sound 15.wav',
  oeffnen:        'oeffnen-neu.wav',
  speichern:      'close-save.wav',
  loeschen:       'sound 8.wav',
  sonderinhalt:   'sound2.wav',
  navigation:     'nav.wav',
  eingabe_start:  'eingabe-auf.wav',
  eingabe_ende:   'info-zu.wav',
  wert_hoch:      'wert-hoch.wav',
  wert_runter:    'wert-runter.wav',
  ap_bezahlen:    'ep-minus.wav',
  ap_zurueck:     'ep-plus.wav',
  ep_hinzu:       'success2.mp3', // Erfolg: Gesamt-EP hinzugefuegt
  // Nachrichteneingang (Meisterpost): auffaelliger Ton, wenn Post eingeht -
  // beim Spieler von Meister/Mitspielern, beim Meister von einem Spieler.
  post:           'nachricht-eingang.mp3',
  // Pop-up (Meisterpost): eigener Ton, wenn ein Pop-up ausgeloest wird.
  popup:          'popup.mp3',
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
  esc_verlassen: { freq: 400, ms: 220 },
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
  ep_hinzu:      { freq: 880, ms: 180 },
  post:          { freq: 990, ms: 220 },
  popup:         { freq: 1175, ms: 260 },
};

// Pro-Sound Lautstaerke-Faktor (Multiplikator auf _globalVolume).
// Alle Toene sollen sich aehnlich laut anfuehlen ("gleiche Lautstaerke,
// gleiches Steuerungsgefuehl") und dabei unter der Sprachausgabe bleiben. Wir
// halten deshalb ein enges Band (etwa 0,18 bis 0,55): Bedien-/Navigationstoene
// dezent, Ereignistoene (Wuerfeln, Speichern, Fehler) einen Hauch praesenter.
// Die neuen, aufeinander abgestimmten Bedientoene sind schon perzeptiv gleich
// laut normalisiert (loudnorm). Sie bekommen deshalb EINEN einheitlichen Faktor,
// damit sich alles gleich laut anfuehlt und zusammenpasst. tab/schliessen/click
// stammen noch aus dem alten Satz und behalten ihre eigenen Werte.
const BEDIEN_PEGEL = 0.45;
// Bewusst leiser (etwa 45 Prozent) als die uebrigen Bedientoene: das staendige
// Pfeil-hoch-runter und die Textfeld-Toene sollen dezent im Hintergrund bleiben.
const BEDIEN_LEISE = 0.24;
const VOLUME_MAP = {
  navigation: BEDIEN_LEISE,   // Pfeil-Navigation zwischen Zeilen (leiser)
  buch_auf:   BEDIEN_PEGEL,   // Info-Fenster oeffnet (Tooltip)
  buch_zu:    BEDIEN_PEGEL,   // Info-Fenster schliesst (Tooltip)
  esc_verlassen: BEDIEN_PEGEL, // ESC-/Verlassen-Menue an beiden Tischen
  eingabe_start: BEDIEN_LEISE, // Textfeld betreten (leiser)
  eingabe_ende:  BEDIEN_LEISE, // Textfeld verlassen (leiser)
  wert_hoch:  BEDIEN_PEGEL,   // Werteaenderung
  wert_runter:BEDIEN_PEGEL,
  oeffnen:    BEDIEN_PEGEL,   // Datei/Menue/Frage oeffnet
  speichern:  BEDIEN_PEGEL,   // Speichern/Fenster schliesst
  ap_bezahlen: BEDIEN_PEGEL,  // EP ausgeben
  ap_zurueck:  BEDIEN_PEGEL,  // EP erstatten
  ep_hinzu:    BEDIEN_PEGEL,  // Gesamt-EP hinzugefuegt (Erfolg)
  tab:        0.30,   // Bildschirmwechsel vor (Alt-Satz)
  schliessen: 0.30,   // Bildschirmwechsel zurueck (Alt-Satz)
  click:      0.30,   // Menuepunkt auswaehlen (Alt-Satz)
  grenze:     0.30,   // Anschlag am Listenrand
  post:       0.65,   // Nachrichteneingang: bewusst auffaellig
  popup:      0.7,    // Pop-up: noch etwas praesenter
};
const DEFAULT_VOLUME_FACTOR = 0.55;  // Ereignistoene (Wuerfeln, Speichern, Fehler, ...)

// Ebenen-Toene (synthetisch): einheitlicher Grundpegel, an die Gesamtlautstaerke
// gekoppelt. Bewusst im selben Band wie die uebrigen Bedientoene.
const EBENE_VOLUME = 0.16;

let _soundAn = true;
let _globalVolume = 0.25; // Standard beim ersten Start (danach gilt der gespeicherte Wert)
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

/**
 * Einen Klang abspielen. faktor skaliert diesen EINEN Aufruf zusaetzlich
 * (1 = normal, 0.7 = 30 Prozent leiser), ohne die Grundlautstaerke zu aendern.
 */
export function play(name, faktor = 1) {
  if (!_soundAn) return;
  const file = SOUND_MAP[name];
  if (!file) {
    _playFallbackBeep(name, faktor);
    return;
  }
  const audio = _getOrCreate(file);
  if (!audio) {
    _playFallbackBeep(name, faktor);
    return;
  }
  audio.volume = Math.max(0, Math.min(1, _globalVolume * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR) * faktor));
  audio.currentTime = 0;
  audio.play().catch(() => _playFallbackBeep(name, faktor));
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

function _playFallbackBeep(name, faktor = 1) {
  const b = FALLBACK_BEEPS[name];
  if (!b) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.frequency.value = b.freq;
    gain.gain.value = _globalVolume * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR) * 0.3 * faktor;
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + b.ms / 1000);
  } catch { /* Fallback fehlgeschlagen — still ignorieren */ }
}

// --- Ebenen-Toene (audio-taktile Fuehrung) --------------------------------
// Bei jedem Ebenenwechsel sagt ein Ton, wie tief man im Menue steht: je tiefer
// im Stapel, desto hoeher der Ton. Die Hauptebene hat einen eigenen, warmen
// Heimkehr-Klang (zwei absteigende Toene), damit man sie ohne Hinsehen erkennt.
// Zusaetzlich verraet ein kurzes Gleiten die Richtung: vor = aufwaerts,
// zurueck = abwaerts. Alles synthetisch, damit Tonhoehe und Tiefe zusammenpassen.

/** Grundton einer Ebene: tiefe 2 startet warm, jede Ebene tiefer klingt hoeher. */
function _ebeneFreq(tiefe) {
  return Math.min(1245, 392 + Math.max(0, tiefe - 2) * 72);
}

/** Einen sauberen kurzen Ton mit weicher Huellkurve spielen (kein Knacken). */
function _ton(ctx, freq, start, dauer, vol, freqEnde) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnde && freqEnde !== freq) osc.frequency.linearRampToValueAtTime(freqEnde, start + dauer);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(start); osc.stop(start + dauer + 0.03);
}

/**
 * Ebenen-Ton spielen.
 * @param {number} tiefe     Stapel-Tiefe der ERREICHTEN Ebene (1 = Hauptebene)
 * @param {'vor'|'zurueck'} [richtung]
 */
export function playEbene(tiefe, richtung) {
  if (!_soundAn) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const vol = _globalVolume * EBENE_VOLUME;
    if (tiefe <= 1) {
      // Hauptebene: warme, absteigende Heimkehr (zwei Toene).
      _ton(ctx, 523, t0, 0.12, vol);
      _ton(ctx, 349, t0 + 0.10, 0.20, vol);
      return;
    }
    const f = _ebeneFreq(tiefe);
    const glide = richtung === 'vor' ? f * 1.06 : (richtung === 'zurueck' ? f * 0.94 : f);
    _ton(ctx, f, t0, 0.14, vol, glide);
  } catch { /* Audio nicht verfuegbar — still ignorieren */ }
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
export function playPost()         { play('post'); }
export function playPopup()        { play('popup'); }
export function playEingabeStart() { play('eingabe_start'); }
export function playEingabeEnde()  { play('eingabe_ende'); }
export function playWertHoch()     { play('wert_hoch'); }
export function playWertRunter()   { play('wert_runter'); }
export function playApBezahlen()   { play('ap_bezahlen'); }
export function playApZurueck()    { play('ap_zurueck'); }
export function playGrenze()       { play('grenze'); } // Anschlag am Rand (0/100, Listenrand)

// Rueckwaertskompatibilitaet
export function playBestaetigen()  { play('bing'); }
export function playEingabe()      { play('eingabe_ende'); }
