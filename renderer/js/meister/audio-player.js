/**
 * Skularis — Audio-Player fuer den Meister (Musik/Hintergrund/Einspielen),
 * mit sanftem Ein- und Ausblenden und Ueberblenden.
 *
 * Aufbau des Klanggraphen (Web Audio):
 *
 *   je Klang: BufferSource -> KanalGain --\
 *                                          mixBus --> monitorGain --> Lautsprecher
 *                                             \-----> sendeGain --> sendeLimit --> radioDest
 *
 * Der mixBus buendelt alles, was der Meister abspielt. Von dort geht es zum einen
 * ueber monitorGain an die eigenen Lautsprecher (dessen Lautstaerke regelt der
 * Meister fuer sich, ohne die Hoerer zu beeinflussen) und zum anderen ueber den
 * Sendeweg an radioDest — das ist der Strom, den das Radio an die Spieler sendet.
 *
 * Der Sendeweg hat seit 1.29 eine eigene Verstaerkung (sendeGain, Standard
 * DREIFACH). Die Spieler berichteten, dass der Mix selbst bei voll aufgedrehtem
 * Empfangsregler zu leise ankam: der Sendestrom lief vorher unverstaerkt (Faktor
 * 1) und liess sich beim Hoerer nicht ueber 100 Prozent heben. Dahinter haengt
 * sendeLimit, ein Begrenzer (DynamicsCompressor als Limiter), damit laute Stellen
 * durch die Verstaerkung nicht uebersteuern und knacken.
 *
 * DREI monophone Kanaele, die der Meister starten kann:
 *   - 'abspielen'    normale Lautstaerke
 *   - 'hintergrund'  leiser (Standard 30 Prozent), fuer Stimmung unter dem Spiel
 *   - 'einspielen'   kurzes Darueberlegen; senkt die anderen beiden solange (Ducking)
 * Jeder Kanal steht fuer sich: startet man auf einem Kanal etwas Neues, wird der
 * bisherige Klang DIESES Kanals weich ausgeblendet und der neue eingeblendet
 * (Ueberblenden). Nichts stapelt sich mehr uebereinander.
 */

const ipc = window.skularis?.ipc;

const FADE_EIN = 4.8;      // Sekunden: Schleife/Klang einblenden (weich) — gleich lang wie
                           // das Ausblenden, damit ein Wechsel ein echtes Überblenden wird
const FADE_EIN_KURZ = 0.8; // Sekunden: einmalige Klaenge sanft einblenden (kurz, kein Verzug)
const FADE_AUS = 4.8;      // Sekunden: ausblenden beim Stoppen/Wechseln (verdoppelt, sehr weich)

let _ctx = null;
let _mixBus = null;
let _monitor = null;
let _radioDest = null;
let _sendeGain = null;
let _sendeLimit = null;
// Verstaerkung des Sendestroms zu den Spielern. Seit 1.29 dreifach (vorher 1).
// Der Begrenzer dahinter faengt ab, was dadurch ueber die Vollaussteuerung
// hinauslaufen wuerde — leise Sachen (Hintergrund) werden also wirklich dreimal
// so laut, bereits volle Klaenge bleiben sauber.
let _sendeVerstaerkung = 3;
let _sendeMono = false; // Sendestrom einkanalig (spart Daten); Standard Stereo
let _monitorVol = 0.25; // Standard beim ersten Start (danach gilt der gespeicherte Wert)
// Wie laut der Hintergrund-Kanal AUF DER LEITUNG ankommt, also nach der
// Sendeverstaerkung. Seit 1.30 zaehlt der Wert genau so, wie ihn der Meister
// meint: 50 heisst 50 Prozent im Sendestrom. Vorher war es der Wert VOR der
// Verstaerkung — mit der Dreifach-Verstaerkung aus 1.29 wanderten eingestellte
// 30 Prozent auf 90 hoch, und die Staffelung gegen den Abspielen-Kanal
// (100 Prozent) war dahin. Der Kanalpegel wird jetzt zurueckgerechnet, siehe
// getHintergrundPegel(). Im Audio-Bereich unter Lautstaerken frei einstellbar.
let _hintergrundVol = 0.35;
let _appMaster = 1; // Anwendungslautstaerke (Numblock +/-): skaliert nur den EIGENEN Abhoer-Bus mit, nie den Sendestrom (radioDest haengt VOR dem Monitor)

/** Ziel-Gain des Abhoer-Busses: Abhoer-Lautstaerke × Anwendungslautstaerke.
 *  Der Sendestrom an die Spieler (radioDest) bleibt davon unberuehrt. */
function monitorZiel() {
  return Math.max(0.0001, _monitorVol * _appMaster);
}

// Die Kanaele. Je Kanal genau EIN laufender Klang (oder null).
// Seit 1.31 gibt es ZWEI Hintergrund-Reihen, damit sich Stimmungen schichten
// lassen (etwa Regen und Tavernenlaerm gleichzeitig). Welche Reihe eine
// Schnelltaste bedient, ergibt sich aus ihrer Platznummer: Plaetze 1 bis 12
// (Strg) sind Reihe 1, Plaetze 13 bis 24 (Strg+Shift) sind Reihe 2. Innerhalb
// einer Reihe loest ein neuer Klang den alten ab, ueber die Reihen hinweg
// laufen beide. Der Name 'hintergrund' bleibt Reihe 1, damit alle bisherigen
// Aufrufer unveraendert weiterlaufen.
const _kanaele = { abspielen: null, hintergrund: null, hintergrund2: null, einspielen: null };
const KANAELE = ['abspielen', 'hintergrund', 'hintergrund2', 'einspielen'];
/** Die beiden Hintergrund-Reihen (Reihe 1, Reihe 2). */
export const HINTERGRUND_KANAELE = ['hintergrund', 'hintergrund2'];
// Pausierte Klaenge je Kanal (fuer Pause/Weiter der Schnelltasten). Merkt sich die
// Stelle im Track, damit ein zweiter Tastendruck an genau dieser Stelle weiterspielt.
const _pausiert = { abspielen: null, hintergrund: null, hintergrund2: null, einspielen: null };
const _decodeCache = new Map(); // pfad -> AudioBuffer

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _mixBus = _ctx.createGain();
    _mixBus.gain.value = 1;
    _monitor = _ctx.createGain();
    _monitor.gain.value = monitorZiel();
    _radioDest = _ctx.createMediaStreamDestination();
    // Sendeweg: erst verstaerken, dann begrenzen, dann in den Stream.
    _sendeGain = _ctx.createGain();
    _sendeGain.gain.value = _sendeVerstaerkung;
    _sendeLimit = _ctx.createDynamicsCompressor();
    // Als Limiter eingestellt: greift erst kurz unter Vollaussteuerung, dann aber
    // hart, mit schnellem Ansprechen und weichem Loslassen (kein Pumpen).
    try {
      _sendeLimit.threshold.value = -2;
      _sendeLimit.knee.value = 0;
      _sendeLimit.ratio.value = 20;
      _sendeLimit.attack.value = 0.003;
      _sendeLimit.release.value = 0.25;
    } catch { /* aeltere Umgebungen: Standardwerte tun es auch */ }
    anwendeMono(); // Mono/Stereo fuer den Sendestrom nach Einstellung
    // Seit 1.31 haengt der eigene Abhoerweg HINTER Verstaerkung und Begrenzer.
    // Damit hoert der Meister genau die Mischung, die auch gesendet wird — nur
    // mit eigenem Lautstaerkeregler. Vorher zweigte er vor der Verstaerkung ab
    // und log deshalb ueber das Verhaeltnis der Kanaele.
    _monitor.connect(_ctx.destination);
    _mixBus.connect(_sendeGain);
    _sendeGain.connect(_sendeLimit);
    _sendeLimit.connect(_radioDest);
    _sendeLimit.connect(_monitor);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/** Rohe Bytes einer Datei holen und einmalig dekodieren (danach im Cache).
 *  Der Cache haelt dekodiertes PCM (der groesste Speicherfresser der Anwendung)
 *  und ist deshalb seit 1.20 gedeckelt: aelteste Eintraege fliegen zuerst. */
const DECODE_CACHE_MAX = 10;
async function ladePuffer(pfad) {
  if (_decodeCache.has(pfad)) {
    const p = _decodeCache.get(pfad);
    _decodeCache.delete(pfad); _decodeCache.set(pfad, p); // als juengsten markieren
    return p;
  }
  const r = await ipc.audioDatei(pfad);
  if (!r || r.fehler || !r.bytes) throw new Error(r && r.fehler ? r.fehler : 'Datei nicht lesbar');
  const puffer = await ctx().decodeAudioData(r.bytes);
  _decodeCache.set(pfad, puffer);
  while (_decodeCache.size > DECODE_CACHE_MAX) {
    const aeltester = _decodeCache.keys().next().value;
    _decodeCache.delete(aeltester);
  }
  return puffer;
}

/**
 * Beim Verlassen des Meistertisches (Modul-Dienst): alles stoppen, den
 * Dekodier-Speicher leeren und den AudioContext schliessen. Der naechste
 * Tischbesuch baut sich frisch auf (ctx() erzeugt bei Bedarf neu).
 */
export function entlade() {
  try { stoppeAlles(); } catch { /* egal */ }
  try { beendeVorhoeren(); } catch { /* egal */ }
  _decodeCache.clear();
  for (const k of KANAELE) _pausiert[k] = null;
  if (_ctx) {
    try { _ctx.close(); } catch { /* egal */ }
    _ctx = null; _mixBus = null; _monitor = null; _radioDest = null;
    _sendeGain = null; _sendeLimit = null;
  }
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

/** Den Kanal-Slot nur freigeben, wenn noch DERSELBE Eintrag drinsteht (Race-Schutz). */
function gibFrei(kanal, eintrag) {
  if (_kanaele[kanal] === eintrag) _kanaele[kanal] = null;
}

/**
 * Einen Klang auf einem Kanal starten. Blendet den bisherigen Klang DIESES
 * Kanals weich aus (Ueberblenden) und den neuen ein.
 * @param {'abspielen'|'hintergrund'|'einspielen'} kanal
 * @param {{pfad:string, name:string}} datei
 * @param {object} [opts]
 * @param {boolean} [opts.loop=false]  in Schleife
 * @param {number}  [opts.pegel=1]     Ziel-Lautstaerke 0..1 (Hintergrund: getHintergrundPegel())
 * @param {Function}[opts.onEnde]      Aufruf bei NATUERLICHEM Ende (Playlist-Weiter)
 */
export async function spieleKanal(kanal, datei, opts = {}) {
  const { loop = false, pegel = 1, onEnde, offset = 0 } = opts;
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  _pausiert[kanal] = null; // ein Neustart verwirft eine evtl. gemerkte Pause dieses Kanals
  const source = c.createBufferSource();
  source.buffer = puffer;
  source.loop = loop;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  source.connect(gain);
  gain.connect(_mixBus);
  // Bisherigen Klang dieses Kanals ausblenden.
  const alt = _kanaele[kanal];
  if (alt) { alt.gestoppt = true; if (alt.zurueck) { try { alt.zurueck(); } catch { /* egal */ } } blendeAus(alt); }
  const startAt = c.currentTime;
  const startOffset = (puffer.duration && offset > 0) ? Math.min(offset, Math.max(0, puffer.duration - 0.05)) : 0;
  const eintrag = { source, gain, name: datei.name, pfad: datei.pfad, pegel, loop, gestoppt: false, startTime: startAt, offset: startOffset };
  _kanaele[kanal] = eintrag;
  source.onended = () => {
    try { gain.disconnect(); } catch { /* egal */ }
    gibFrei(kanal, eintrag);
    if (!eintrag.gestoppt && typeof onEnde === 'function') { try { onEnde(); } catch { /* egal */ } }
  };
  source.start(startAt, startOffset);
  rampe(gain.gain, pegel, loop ? FADE_EIN : FADE_EIN_KURZ);
}

/**
 * Einen Kanal PAUSIEREN: die aktuelle Stelle im Track merken und den Klang schnell
 * ausblenden. Mit fortsetzePfad() spielt er an genau dieser Stelle weiter. Fuer die
 * Schnelltasten (Play, Pause, Weiter, Stop).
 */
export function pausiereKanal(kanal) {
  const e = _kanaele[kanal];
  if (!e) return false;
  const c = ctx();
  const dur = (e.source && e.source.buffer) ? e.source.buffer.duration : 0;
  let pos = (e.offset || 0) + (c.currentTime - e.startTime);
  if (dur > 0) { pos = e.loop ? (pos % dur) : Math.min(pos, dur); }
  if (!isFinite(pos) || pos < 0) pos = 0;
  e.gestoppt = true;
  _kanaele[kanal] = null;
  try { rampe(e.gain.gain, 0, 0.12); e.source.stop(c.currentTime + 0.16); } catch { /* schon gestoppt */ }
  _pausiert[kanal] = { pfad: e.pfad, name: e.name, pegel: e.pegel, loop: e.loop, pos: pos };
  return true;
}

/** Auf welchem Kanal ist dieser Pfad pausiert? (Kanalname oder null) */
export function pausiertKanalFuer(pfad) {
  for (const k of KANAELE) if (_pausiert[k] && _pausiert[k].pfad === pfad) return k;
  return null;
}

/** Ist dieser Pfad gerade pausiert? */
export function istPfadPausiert(pfad) { return pausiertKanalFuer(pfad) !== null; }

/** Einen pausierten Pfad an der gemerkten Stelle weiterspielen. */
export function fortsetzePfad(pfad) {
  const k = pausiertKanalFuer(pfad);
  if (!k) return false;
  const p = _pausiert[k];
  _pausiert[k] = null;
  spieleKanal(k, { name: p.name, pfad: p.pfad }, { loop: p.loop, pegel: p.pegel, offset: p.pos });
  return true;
}

/** Eine gemerkte Pause verwerfen (Stop: der naechste Start beginnt wieder bei 0). */
export function pauseVerwerfen(pfad) {
  const k = pausiertKanalFuer(pfad);
  if (!k) return false;
  _pausiert[k] = null;
  return true;
}

/** Gemerkte Pause-Stelle (Sekunden) fuer einen Pfad, oder null. Fuer die
 *  Schnelltasten, damit die Stelle mit dem Abenteuer gespeichert werden kann. */
export function pausePosFuer(pfad) {
  const k = pausiertKanalFuer(pfad);
  return (k && _pausiert[k]) ? _pausiert[k].pos : null;
}

/** Die Lautstaerke eines gerade laufenden Klangs (per Pfad) live setzen (0..1).
 *  Fuer die individuelle Lautstaerke einer Schnelltaste, die sofort greifen soll. */
export function setzePegelFuer(pfad, pegel) {
  const p = Math.max(0, Math.min(1, pegel));
  for (const k of KANAELE) {
    const e = _kanaele[k];
    if (e && e.pfad === pfad) {
      e.pegel = p;
      try { rampe(e.gain.gain, Math.max(0.0001, p), 0.2); } catch { /* egal */ }
      return true;
    }
  }
  return false;
}

// --- Alt-API (Rueckwaertskompatibilitaet) --------------------------------
// Frueher gab es 'musik'/'stimmung'. Neue Zuordnung: musik->abspielen,
// stimmung->hintergrund. So laufen aeltere Aufrufer weiter.
function altKanal(kanal) { return kanal === 'stimmung' || kanal === 'hintergrund' ? 'hintergrund' : 'abspielen'; }

export async function spieleSchleife(kanal, datei, pegel = 1) {
  return spieleKanal(altKanal(kanal), datei, { loop: true, pegel });
}

/** Einen Klang einmal auf dem Abspielen-Kanal spielen (crossfade, kein Stapeln). */
export async function spieleEinmal(datei, onEnde, pegel = 1) {
  return spieleKanal('abspielen', datei, { loop: false, pegel, onEnde });
}

/**
 * Eine Datei EINSPIELEN (ducking): die laufenden Kanaele Abspielen und Hintergrund
 * werden weich auf die Haelfte abgesenkt und der eingespielte Klang darueber gelegt.
 * Ist er durch, blenden die anderen Kanaele wieder auf ihren jeweiligen Pegel hoch.
 * Der Einspiel-Kanal ist ebenfalls monophon: ein neues Einspielen blendet das alte
 * ueber. Wird ueber den mixBus gespielt, also hoeren es auch die Spieler im Radio.
 */
export async function spieleEin(datei, opts = {}) {
  const { pegel = 1 } = opts; // Ziel-Lautstaerke 0..1 (fuer Kurztasten mit eigener Lautstaerke)
  const puffer = await ladePuffer(datei.pfad);
  const c = ctx();
  const dur = puffer.duration || 0;
  const t0 = c.currentTime;
  const ein = 0.35, aus = 0.5;

  // Vorheriges Einspielen weich ausblenden (die anderen Kanaele bleiben geduckt,
  // das neue Einspielen haelt sie ja weiter leiser).
  const altEin = _kanaele.einspielen;
  if (altEin) { altEin.gestoppt = true; try { rampe(altEin.gain.gain, 0, 0.25); altEin.source.stop(c.currentTime + 0.3); } catch { /* egal */ } }

  // Die beiden anderen Kanaele ducken (auf die Haelfte ihres eigenen Pegels).
  const loops = ['abspielen', ...HINTERGRUND_KANAELE].map(k => _kanaele[k]).filter(Boolean);
  for (const l of loops) rampe(l.gain.gain, Math.max(0.0001, (l.pegel || 1) * 0.5), ein);

  const source = c.createBufferSource();
  source.buffer = puffer;
  const gain = c.createGain();
  source.connect(gain);
  gain.connect(_mixBus);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, pegel), t0 + ein); // einblenden
  source.start();

  // Die geduckten Kanaele wieder auf ihren jeweiligen Pegel hochziehen.
  const zurueck = () => { for (const l of loops) rampe(l.gain.gain, Math.max(0.0001, l.pegel || 1), aus); };

  const eintrag = { source, gain, name: datei.name, pfad: datei.pfad, loops, zurueck, gestoppt: false };
  _kanaele.einspielen = eintrag;

  if (dur > ein + aus) {
    // Gegen Ende ausblenden und die Kanaele gleichzeitig wieder hoch (echte Ueberblende).
    const tAus = t0 + dur - aus;
    gain.gain.setValueAtTime(Math.max(0.0001, pegel), tAus);
    gain.gain.linearRampToValueAtTime(0.0001, tAus + aus);
    for (const l of loops) {
      const ziel = Math.max(0.0001, l.pegel || 1);
      l.gain.gain.setValueAtTime(Math.max(0.0001, ziel * 0.5), tAus);
      l.gain.gain.linearRampToValueAtTime(ziel, tAus + aus);
    }
    source.onended = () => { gibFrei('einspielen', eintrag); try { gain.disconnect(); } catch { /* egal */ } };
  } else {
    // Sehr kurzer Klang: erst am Ende die Kanaele wieder hochblenden.
    source.onended = () => { gibFrei('einspielen', eintrag); if (!eintrag.gestoppt) zurueck(); try { gain.disconnect(); } catch { /* egal */ } };
  }
}

/** Einen Kanal stoppen (mit Ausblenden). Bei Einspielen die geduckten Kanaele zurueck. */
export function stoppeKanal(kanal) {
  _pausiert[kanal] = null; // eine gemerkte Pause dieses Kanals verwerfen
  const e = _kanaele[kanal];
  if (!e) return;
  _kanaele[kanal] = null;
  e.gestoppt = true;
  if (e.zurueck) { try { e.zurueck(); } catch { /* egal */ } }
  blendeAus(e);
}

/**
 * Alles stoppen: alle drei Kanaele und ein laufendes Vorhoeren. Fuer Strg+F12
 * "Alles stoppen" — es darf nichts uebrig bleiben.
 */
export function stoppeAlles() {
  for (const k of KANAELE) stoppeKanal(k);
  beendeVorhoeren();
}

/** Beide Hintergrund-Reihen weich ausblenden. Nutzt "Abspielen", das den
 *  Hintergrund ersetzt, statt sich darueberzulegen. */
export function stoppeHintergruende() {
  for (const k of HINTERGRUND_KANAELE) stoppeKanal(k);
}

/** Was laeuft gerade in einem Kanal? (Name oder null) */
export function laeuftName(kanal) {
  return _kanaele[kanal] ? _kanaele[kanal].name : null;
}

/** Pfad des laufenden Klangs eines Kanals (oder null). */
export function laeuftPfad(kanal) {
  return _kanaele[kanal] ? _kanaele[kanal].pfad : null;
}

/** Laeuft dieser Pfad gerade auf IRGENDEINEM Kanal? (Name des Kanals oder null) */
export function laeuftKanalFuer(pfad) {
  for (const k of KANAELE) if (_kanaele[k] && _kanaele[k].pfad === pfad) return k;
  return null;
}

/** Alle Kanaele, auf denen dieser Pfad laeuft, stoppen. Gibt true, wenn etwas lief. */
export function stoppePfad(pfad) {
  let gestoppt = false;
  for (const k of KANAELE) {
    if (_kanaele[k] && _kanaele[k].pfad === pfad) { stoppeKanal(k); gestoppt = true; }
  }
  return gestoppt;
}

/**
 * Sende-Lautstaerke des Hintergrund-Kanals (0 bis 100). Regelt, wie laut der
 * Hintergrund in den Mix und damit in den Radio-Stream geht — so kann der Meister
 * den Hintergrund leiser stellen, wenn die Spieler ihn zu laut finden. Wirkt
 * sofort auf einen laufenden Hintergrund-Klang.
 */
export function setHintergrundLautstaerke(prozent) {
  _hintergrundVol = Math.max(0, Math.min(1, prozent / 100));
  const e = _kanaele.hintergrund;
  const ziel = getHintergrundPegel();
  if (e && !e.gestoppt) { e.pegel = ziel; try { rampe(e.gain.gain, Math.max(0.0001, ziel), 0.3); } catch { /* egal */ } }
}
export function getHintergrundLautstaerke() { return Math.round(_hintergrundVol * 100); }

/** Aktueller Ziel-Pegel (0..1) fuer neu gestartete Hintergrund-Klaenge.
 *  Zurueckgerechnet: Der eingestellte Wert ist der auf der LEITUNG gewuenschte
 *  Anteil, der Kanal selbst muss also um die Sendeverstaerkung leiser laufen.
 *  Beispiel: eingestellt 50, Verstaerkung 3 -> Kanal 16,7 Prozent, nach der
 *  Verstaerkung wieder 50 Prozent im Sendestrom. */
export function getHintergrundPegel() {
  const v = _sendeVerstaerkung > 0 ? _sendeVerstaerkung : 1;
  return Math.max(0, Math.min(1, _hintergrundVol / v));
}

/** Eigene Abhoer-Lautstaerke (0 bis 100) — beeinflusst NICHT die Hoerer. */
export function setMonitorLautstaerke(prozent) {
  _monitorVol = Math.max(0, Math.min(1, prozent / 100));
  // Beim Vorhoeren bleibt der Live-Mix fuer den Meister stumm; die Lautstaerke
  // wirkt dann auf das Vorhoeren. Sonst regelt sie den Live-Mix.
  if (_preview) rampe(_preview.gain.gain, monitorZiel(), 0.15);
  else if (_monitor) rampe(_monitor.gain, monitorZiel(), 0.15);
}

/** Anwendungslautstaerke (Numblock +/-) fuer den eigenen Player-Mix. Skaliert die
 *  Abhoer-Lautstaerke mit; der Sendestrom an die Spieler bleibt unberuehrt. Die
 *  Persistenz (app_master_vol) uebernimmt der Numblock-Handler. */
export function setAnwendungsLautstaerke(prozent) {
  _appMaster = Math.max(0, Math.min(1, prozent / 100));
  if (_preview) rampe(_preview.gain.gain, monitorZiel(), 0.15);
  else if (_monitor) rampe(_monitor.gain, monitorZiel(), 0.15);
}
export function getAnwendungsLautstaerke() { return Math.round(_appMaster * 100); }

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
  rampe(gain.gain, monitorZiel(), 0.4);
  _preview = { source, gain, pfad: datei.pfad, name: datei.name };
}

/** Vorhoeren beenden und den Live-Mix fuer den Meister wieder einblenden. */
export function beendeVorhoeren() {
  stoppeVorschau();
  if (_monitor) rampe(_monitor.gain, monitorZiel(), 0.4);
}

export function istVorhoeren() { return Boolean(_preview); }
export function vorhoerenPfad() { return _preview ? _preview.pfad : null; }

export function getMonitorLautstaerke() {
  return Math.round(_monitorVol * 100);
}

/** Mono/Stereo am Sende-Ausgang anwenden (channelCount des MediaStreamDestination). */
function anwendeMono() {
  if (!_radioDest) return;
  try {
    _radioDest.channelCount = _sendeMono ? 1 : 2;
    _radioDest.channelCountMode = 'explicit';
  } catch { /* manche Umgebungen erlauben das nicht -> bleibt Stereo */ }
}

/** Sendestrom auf Mono (true) oder Stereo (false) stellen. Vor dem Senden setzen. */
export function setSendeMono(mono) {
  _sendeMono = !!mono;
  anwendeMono();
}

/** Verstaerkung des Sendestroms setzen (1 = unveraendert, 3 = dreifach).
 *  Wirkt sofort, auch waehrend gesendet wird. */
export function setSendeVerstaerkung(faktor) {
  _sendeVerstaerkung = Math.max(0.1, Math.min(6, Number(faktor) || 1));
  if (_sendeGain) { try { rampe(_sendeGain.gain, _sendeVerstaerkung, 0.2); } catch { /* egal */ } }
  // Ein laufender Hintergrund muss mitziehen, sonst stimmt sein Anteil auf der
  // Leitung nicht mehr (der eingestellte Wert meint ja das Ergebnis).
  const e = _kanaele.hintergrund;
  if (e && !e.gestoppt) { const ziel = getHintergrundPegel(); e.pegel = ziel; try { rampe(e.gain.gain, Math.max(0.0001, ziel), 0.2); } catch { /* egal */ } }
}

/** Aktuelle Sende-Verstaerkung als Faktor. */
export function getSendeVerstaerkung() { return _sendeVerstaerkung; }

/** Der Sendestrom fuers Radio (ein Audio-Track mit dem gesamten Mix). */
export function getSendeStrom() {
  ctx();
  return _radioDest.stream;
}

/** Laeuft gerade irgendetwas? */
export function istAktiv() {
  return KANAELE.some(k => Boolean(_kanaele[k]));
}

// Beim Laden am Anwendungs-Master in sounds.js anmelden (seit 1.20; app.js laedt
// die Audio-Module nicht mehr vorab).
import * as __sounds from '../sounds.js';
__sounds.onAnwendungsLautstaerke((v) => setAnwendungsLautstaerke(v));
queueMicrotask(() => { try { setAnwendungsLautstaerke(__sounds.getAnwendungsLautstaerke()); } catch { /* egal */ } });
