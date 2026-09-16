/**
 * Skularis — Sound-System (HTML5 Audio + AudioContext Fallback)
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
const BEDIEN_PEGEL = 0.90;
// Bewusst leiser als die uebrigen Bedientoene: das staendige Pfeil-hoch-runter
// und die Textfeld-Toene sollen dezent im Hintergrund bleiben. Seit 1.24 noch
// einmal um die Haelfte reduziert (Nutzerwunsch: die Menue-Klickgeraeusche bei
// Pfeil, Eingabetaste und Escape sind auf Dauer zu praesent).
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
  tab:        0.60,   // Ebenenwechsel vor — NICHT reduziert (zeigt die Ebene an)
  schliessen: 0.60,   // Ebenenwechsel zurueck — NICHT reduziert (zeigt die Ebene an)
  click:      0.30,   // Menuepunkt auswaehlen (Eingabetaste)
  grenze:     0.60,   // Anschlag am Listenrand
  post:       0.85,   // Nachrichteneingang: bewusst auffaellig (30 Prozent lauter als zuvor)
  popup:      0.7,    // Pop-up: noch etwas praesenter
};
const DEFAULT_VOLUME_FACTOR = 0.55;  // Ereignistoene (Wuerfeln, Speichern, Fehler, ...)

// Ebenen-Toene (synthetisch): einheitlicher Grundpegel, an die Gesamtlautstaerke
// gekoppelt. Dieser Ton zeigt ueber seine steigende bzw. fallende Tonhoehe an,
// auf welcher Menueebene man gelandet ist — er traegt also INFORMATION und wird
// deshalb bewusst NICHT mitreduziert (Nutzerwunsch 1.25).
const EBENE_VOLUME = 0.32;

let _soundAn = true;
let _globalVolume = 0.25; // Standard beim ersten Start (danach gilt der gespeicherte Wert)
// Anwendungslautstaerke (Numblock +/-): ein Master ueber ALLES, was der Nutzer
// hoert (Bedien-Toene, Player-Audio, Radio-Empfang). Verschiebt NICHT die Balance
// der Kanaele (Hintergrund/Abhoer) und NICHT die Sende-Lautstaerke an die Spieler.
let _appMaster = 1;          // wirksamer Faktor (nach der Kurve)
let _appMasterProzent = 100; // was der Regler anzeigt

/**
 * Lautstaerkekurve aller Hoer-Regler (seit 1.39): Reglerwert -> Faktor.
 *
 * Das Ohr hoert Lautstaerke nicht linear. Bei einem linearen Regler aendern die
 * ersten Schritte fast alles und die obere Haelfte kaum noch etwas — bei lauten
 * Dateien landete man deshalb im Bereich 1 bis 5. Mit der quadratischen Kurve
 * ist die Haelfte (50) schon auf ein Viertel (25 Prozent) herunter, und der
 * leise Bereich wird entsprechend feiner: Was vorher bei 1 bis 5 lag, liegt
 * jetzt etwa bei 10 bis 22.
 */
export function lautstaerkeKurve(prozent) {
  const x = Math.max(0, Math.min(100, Number(prozent) || 0)) / 100;
  return x * x;
}

/** Umkehrung der Kurve: aus einem frueher LINEAR gespeicherten Wert den
 *  Reglerwert machen, der genauso laut klingt. Nur fuer die einmalige Umstellung. */
export function lautstaerkeAusLinear(prozent) {
  const x = Math.max(0, Math.min(100, Number(prozent) || 0)) / 100;
  return Math.round(Math.sqrt(x) * 100);
}
const _audioCache = {};
let _audioCtx = null;

export async function init() {
  _soundAn = await einstellungen.get('sound_an') !== false;
  const vol = await einstellungen.get('lautstaerke');
  if (vol != null) _globalVolume = Math.max(0, Math.min(1, vol / 100));
  // Einmalige Umstellung auf die Lautstaerkekurve (1.39): Gespeicherte Regler-
  // werte waren linear gemeint. Sie werden so umgerechnet, dass nach dem Update
  // alles genauso laut klingt wie vorher — nur die Zahl am Regler aendert sich.
  if (!(await einstellungen.get('lautstaerke_kurve'))) {
    for (const key of ['app_master_vol', 'radio_hoerer_vol']) {
      const alt = await einstellungen.get(key);
      if (typeof alt === 'number') await einstellungen.setWert(key, lautstaerkeAusLinear(alt));
    }
    await einstellungen.setWert('lautstaerke_kurve', 1);
  }
  const master = await einstellungen.get('app_master_vol');
  if (master != null) {
    _appMasterProzent = Math.max(0, Math.min(100, Math.round(master)));
    _appMaster = lautstaerkeKurve(_appMasterProzent);
  }
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
 * Anwendungslautstaerke (Numblock +/-): ein Master ueber ALLE hoerbaren Klaenge
 * (Bedien-Toene, Player-Audio, Radio-Empfang). Verschiebt NICHT die Balance
 * zwischen den Kanaelen und NICHT die Sende-Lautstaerke an die Spieler. Die
 * eigentliche Persistenz (app_master_vol) uebernimmt der Numblock-Handler.
 */
const _masterHooks = [];
/** Player und Radio melden sich hier an und bekommen jede Master-Aenderung —
 *  app.js muss die Audio-Module dafuer nicht mehr vorab laden (seit 1.20). */
export function onAnwendungsLautstaerke(fn) {
  if (typeof fn === 'function') _masterHooks.push(fn);
}
export function setAnwendungsLautstaerke(prozent) {
  _appMasterProzent = Math.max(0, Math.min(100, Math.round(Number(prozent) || 0)));
  _appMaster = lautstaerkeKurve(_appMasterProzent);
  // Die angemeldeten Module bekommen den REGLERWERT und wenden die Kurve selbst an.
  for (const fn of _masterHooks) { try { fn(_appMasterProzent); } catch { /* egal */ } }
}
export function getAnwendungsLautstaerke() {
  return _appMasterProzent;
}

/**
 * Einen Klang abspielen. faktor skaliert diesen EINEN Aufruf zusaetzlich
 * (1 = normal, 0.7 = 30 Prozent leiser), ohne die Grundlautstaerke zu aendern.
 */
export function play(name, faktor = 1, ohneMaster = false) {
  if (!_soundAn) return;
  const file = SOUND_MAP[name];
  if (!file) {
    _playFallbackBeep(name, faktor, ohneMaster);
    return;
  }
  const audio = _getOrCreate(file);
  if (!audio) {
    _playFallbackBeep(name, faktor, ohneMaster);
    return;
  }
  const master = ohneMaster ? 1 : _appMaster;
  audio.volume = Math.max(0, Math.min(1, _globalVolume * master * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR) * faktor));
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

function _playFallbackBeep(name, faktor = 1, ohneMaster = false) {
  const b = FALLBACK_BEEPS[name];
  if (!b) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.frequency.value = b.freq;
    gain.gain.value = _globalVolume * (ohneMaster ? 1 : _appMaster) * (VOLUME_MAP[name] || DEFAULT_VOLUME_FACTOR) * 0.3 * faktor;
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
// Triumph und Patzer (seit 1.39): zwei klar unterscheidbare Tonfolgen, kurz nach
// dem Wuerfelgeraeusch, damit sie nicht darin untergehen. Triumph steigt hell auf,
// Patzer faellt dunkel ab.
const KENNUNG_VOLUME = 0.45;
const KENNUNG_VERZOEGERUNG = 0.35; // Sekunden nach dem Wuerfeln

function _kennungsCtx() {
  if (!_soundAn) return null;
  if (!_audioCtx) _audioCtx = new AudioContext();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

export function playTriumph() {
  try {
    const ctx = _kennungsCtx(); if (!ctx) return;
    const t0 = ctx.currentTime + KENNUNG_VERZOEGERUNG;
    const vol = _globalVolume * _appMaster * KENNUNG_VOLUME;
    _ton(ctx, 523, t0, 0.14, vol);        // C
    _ton(ctx, 659, t0 + 0.09, 0.14, vol); // E
    _ton(ctx, 784, t0 + 0.18, 0.14, vol); // G
    _ton(ctx, 1047, t0 + 0.27, 0.45, vol); // hohes C, lang ausklingend
  } catch { /* Audio nicht verfuegbar */ }
}

export function playPatzer() {
  try {
    const ctx = _kennungsCtx(); if (!ctx) return;
    const t0 = ctx.currentTime + KENNUNG_VERZOEGERUNG;
    const vol = _globalVolume * _appMaster * KENNUNG_VOLUME;
    _ton(ctx, 392, t0, 0.16, vol);             // G
    _ton(ctx, 311, t0 + 0.13, 0.16, vol);      // Es
    _ton(ctx, 233, t0 + 0.26, 0.55, vol, 165); // B, rutscht nach unten weg
  } catch { /* Audio nicht verfuegbar */ }
}

export function playEbene(tiefe, richtung) {
  if (!_soundAn) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const vol = _globalVolume * _appMaster * EBENE_VOLUME;
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
export function playGrenze()       { play('grenze', 1, true); } // Anschlag am Rand (0/100, Listenrand) — bleibt auch bei kleiner Anwendungslautstaerke hoerbar

// Rueckwaertskompatibilitaet
export function playBestaetigen()  { play('bing'); }
export function playEingabe()      { play('eingabe_ende'); }
