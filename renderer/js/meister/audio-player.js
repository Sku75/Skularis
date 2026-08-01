/**
 * Skularis — Audio-Player fuer den Meister (Musik, Hintergrundstimmung,
 * Spontansounds), mit sanftem Ein- und Ausblenden und Ueberblenden.
 *
 * Aufbau des Klanggraphen (Web Audio):
 *
 *   je Klang: BufferSource -> KanalGain --\
 *                                          mixBus --> monitorGain --> Lautsprecher
 *                                             \-----> radioDest (Sendestrom fuers Radio)
 *
 * Der mixBus buendelt alles, was der Meister abspielt. Von dort geht es zum einen
 * ueber monitorGain an die eigenen Lautsprecher (dessen Lautstaerke regelt der
 * Meister fuer sich, ohne die Hoerer zu beeinflussen) und zum anderen in voller
 * Staerke an radioDest — das ist der Strom, den das Radio an die Spieler sendet.
 *
 * Musik und Hintergrundstimmung laufen in Schleife; startet man einen neuen Klang
 * im selben Kanal, wird der alte weich aus- und der neue eingeblendet
 * (Ueberblenden). Spontansounds spielen einmal und duerfen sich ueberlagern.
 */

const ipc = window.skularis?.ipc;

const FADE_EIN = 1.4;      // Sekunden: Musik/Stimmung einblenden
const FADE_AUS = 1.2;      // Sekunden: ausblenden beim Stoppen/Wechseln
const FADE_SPONTAN = 0.08; // Sekunden: kurze Einblende gegen Knacken

let _ctx = null;
let _mixBus = null;
let _monitor = null;
let _radioDest = null;
let _monitorVol = 0.25; // Standard beim ersten Start (danach gilt der gespeicherte Wert)

// Laufende Klaenge je Kanal. musik/stimmung: genau einer; spontan: mehrere.
const _laeuft = { musik: null, stimmung: null };
const _spontan = new Set();
const _decodeCache = new Map(); // pfad -> AudioBuffer

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _mixBus = _ctx.createGain();
    _mixBus.gain.value = 1;
    _monitor = _ctx.createGain();
    _monitor.gain.value = _monitorVol;
    _radioDest = _ctx.createMediaStreamDestination();
    _mixBus.connect(_monitor);
    _monitor.connect(_ctx.destination);
    _mixBus.connect(_radioDest);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/** Rohe Bytes einer Datei holen und einmalig dekodieren (danach im Cache). */
async function ladePuffer(pfad) {
  if (_decodeCache.has(pfad)) return _decodeCache.get(pfad);
  const r = await ipc.audioDatei(pfad);
  if (!r || r.fehler || !r.bytes) throw new Error(r && r.fehler ? r.fehler : 'Datei nicht lesbar');
  const puffer = await ctx().decodeAudioData(r.bytes);
  _decodeCache.set(pfad, puffer);
  return puffer;
}

function rampe(gain, ziel, dauer) {
  const t = ctx().currentTime;
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(Math.max(0.0001, gain.value), t);
  if (ziel <= 0) gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  else gain.linearRampToValueAtTime(ziel, t + dauer);
}

/** Einen laufenden Klang weich ausblenden und danach stoppen. */
function blendeAus(eintrag, dauer = FADE_AUS) {
  if (!eintrag) return;
  try {
    rampe(eintrag.gain.gain, 0, dauer);
    eintrag.source.stop(ctx().currentTime + dauer + 0.05);
  } catch { /* schon gestoppt */ }
}

/**
 * Musik oder Hintergrundstimmung abspielen (Schleife, mit Ueberblenden).
 * @param {'musik'|'stimmung'} kanal
 * @param {{pfad:string, name:string}} datei
 */
export async function spieleSchleife(kanal, datei) {
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  const source = c.createBufferSource();
  source.buffer = puffer;
  source.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(_mixBus);
  // Den bisherigen Klang dieses Kanals ausblenden, den neuen einblenden.
  blendeAus(_laeuft[kanal]);
  source.start();
  rampe(gain.gain, 1, FADE_EIN);
  _laeuft[kanal] = { source, gain, name: datei.name, pfad: datei.pfad };
}

/**
 * Einen Klang einmal abspielen (darf sich ueberlagern).
 * @param {{pfad:string, name:string}} datei
 * @param {Function} [onEnde] wird gerufen, wenn der Klang NATUERLICH zu Ende ist
 *   (nicht beim manuellen Stoppen) — fuer automatisches Weiterspielen in Playlists.
 */
export async function spieleEinmal(datei, onEnde) {
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  const source = c.createBufferSource();
  source.buffer = puffer;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(_mixBus);
  const eintrag = { source, gain, name: datei.name, pfad: datei.pfad, gestoppt: false };
  _spontan.add(eintrag);
  source.onended = () => {
    try { gain.disconnect(); } catch { /* egal */ }
    _spontan.delete(eintrag);
    if (!eintrag.gestoppt && typeof onEnde === 'function') { try { onEnde(); } catch { /* egal */ } }
  };
  source.start();
  rampe(gain.gain, 1, FADE_SPONTAN);
}

/**
 * Eine Datei EINSPIELEN (ducking): die laufenden Schleifen werden auf die Haelfte
 * abgesenkt und der eingespielte Klang wird darueber gelegt (gleichzeitig). Ist er
 * durch, blenden die Schleifen wieder auf voll. Alles mit weichen Ueberblenden.
 * Wird ueber den mixBus gespielt, also hoeren es auch die Spieler im Radio.
 */
export async function spieleEin(datei) {
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  const dur = puffer.duration || 0;
  const t0 = c.currentTime;
  const ein = 0.35, aus = 0.5;
  const loops = ['musik', 'stimmung'].map(k => _laeuft[k]).filter(Boolean);

  // Ducking: laufende Schleifen weich auf die Haelfte.
  for (const l of loops) rampe(l.gain.gain, 0.5, ein);

  const source = c.createBufferSource();
  source.buffer = puffer;
  const gain = c.createGain();
  source.connect(gain);
  gain.connect(_mixBus);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(1, t0 + ein); // einblenden
  source.start();

  const zurueck = () => { for (const l of loops) rampe(l.gain.gain, 1, aus); };

  if (dur > ein + aus) {
    // Gegen Ende ausblenden und die Schleifen gleichzeitig wieder hochziehen
    // (echte Ueberblende).
    const tAus = t0 + dur - aus;
    gain.gain.setValueAtTime(1, tAus);
    gain.gain.linearRampToValueAtTime(0.0001, tAus + aus);
    for (const l of loops) { l.gain.gain.setValueAtTime(0.5, tAus); l.gain.gain.linearRampToValueAtTime(1, tAus + aus); }
    source.onended = () => { try { gain.disconnect(); } catch { /* egal */ } };
  } else {
    // Sehr kurzer Klang: erst am Ende die Schleifen wieder hochblenden.
    source.onended = () => { zurueck(); try { gain.disconnect(); } catch { /* egal */ } };
  }
}

/** Einen Schleifen-Kanal stoppen (mit Ausblenden). */
export function stoppeKanal(kanal) {
  if (_laeuft[kanal]) { blendeAus(_laeuft[kanal]); _laeuft[kanal] = null; }
}

/** Alles stoppen: beide Schleifen und alle Spontansounds. */
export function stoppeAlles() {
  stoppeKanal('musik');
  stoppeKanal('stimmung');
  for (const e of _spontan) { e.gestoppt = true; try { e.source.stop(); } catch { /* egal */ } }
  _spontan.clear();
}

/** Was laeuft gerade in einem Schleifen-Kanal? (Name oder null) */
export function laeuftName(kanal) {
  return _laeuft[kanal] ? _laeuft[kanal].name : null;
}

/** Pfad des laufenden Klangs eines Schleifen-Kanals (oder null). */
export function laeuftPfad(kanal) {
  return _laeuft[kanal] ? _laeuft[kanal].pfad : null;
}

/** Spielt gerade ein Spontansound mit diesem Pfad? */
export function spontanAktiv(pfad) {
  for (const e of _spontan) if (e.pfad === pfad) return true;
  return false;
}

/** Alle Spontansounds mit diesem Pfad ausblenden und stoppen. */
export function stoppeSpontan(pfad) {
  for (const e of _spontan) if (e.pfad === pfad) { e.gestoppt = true; blendeAus(e, FADE_SPONTAN + 0.15); }
}

/** Eigene Abhoer-Lautstaerke (0 bis 100) — beeinflusst NICHT die Hoerer. */
export function setMonitorLautstaerke(prozent) {
  _monitorVol = Math.max(0, Math.min(1, prozent / 100));
  // Beim Vorhoeren bleibt der Live-Mix fuer den Meister stumm; die Lautstaerke
  // wirkt dann auf das Vorhoeren. Sonst regelt sie den Live-Mix.
  if (_preview) rampe(_preview.gain.gain, Math.max(0.0001, _monitorVol), 0.15);
  else if (_monitor) rampe(_monitor.gain, Math.max(0.0001, _monitorVol), 0.15);
}

// --- Vorhoeren (Probehoeren, nur fuer den Meister) -----------------------
//
// Der Meister kann eine Datei privat vorhoeren: sein Live-Mix wird ausgeblendet
// und die Datei laeuft nur auf seinen Boxen (nicht ins Radio, radioDest bleibt
// unangetastet). Die Spieler hoeren den Stream unveraendert weiter. Beim Beenden
// blendet der Live-Mix fuer den Meister wieder ein.
let _preview = null;

function stoppeVorschau() {
  if (!_preview) return;
  try { rampe(_preview.gain.gain, 0, 0.2); _preview.source.stop(ctx().currentTime + 0.25); }
  catch { /* schon gestoppt */ }
  _preview = null;
}

/** Eine Datei privat vorhoeren (Live-Mix fuer den Meister aus). */
export async function starteVorhoeren(datei) {
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  stoppeVorschau();
  rampe(_monitor.gain, 0, 0.4); // Meister hoert den Live-Mix nicht mehr
  const source = c.createBufferSource();
  source.buffer = puffer;
  source.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(c.destination); // NUR zu den Boxen, nicht ins Radio
  source.start();
  rampe(gain.gain, Math.max(0.0001, _monitorVol), 0.4);
  _preview = { source, gain, pfad: datei.pfad, name: datei.name };
}

/** Vorhoeren beenden und den Live-Mix fuer den Meister wieder einblenden. */
export function beendeVorhoeren() {
  stoppeVorschau();
  if (_monitor) rampe(_monitor.gain, Math.max(0.0001, _monitorVol), 0.4);
}

export function istVorhoeren() { return Boolean(_preview); }
export function vorhoerenPfad() { return _preview ? _preview.pfad : null; }

export function getMonitorLautstaerke() {
  return Math.round(_monitorVol * 100);
}

/** Der Sendestrom fuers Radio (ein Audio-Track mit dem gesamten Mix). */
export function getSendeStrom() {
  ctx();
  return _radioDest.stream;
}

/** Laeuft gerade irgendetwas? */
export function istAktiv() {
  return Boolean(_laeuft.musik || _laeuft.stimmung || _spontan.size);
}
