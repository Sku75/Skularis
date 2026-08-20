/**
 * Skularis — Online-Radio (WebRTC ueber PeerJS).
 *
 * Der Meister sendet seinen Audio-Mix (aus audio-player) an alle Spieler, die
 * denselben Schluessel eingegeben haben. Kein eigener Server: die Erstverbindung
 * vermittelt der kostenlose PeerJS-Cloud-Dienst (kein Konto noetig), der Ton
 * selbst laeuft direkt zwischen Meister und Spielern.
 *
 * Ablauf: Der Meister meldet sich unter einer festen Kennung an, die sich aus dem
 * Schluessel ergibt (raumId). Jeder Spieler ruft diese Kennung an und schickt
 * dabei einen stillen Tonspur mit; der Meister beantwortet den Anruf mit seinem
 * echten Sendestrom, den der Spieler dann hoert.
 *
 * PeerJS wird als globales window.Peer geladen (renderer/assets/vendor).
 */

// Oeffentliche STUN-Server (kontofrei). TURN (fuer sehr strenge Firewalls) liesse
// sich hier spaeter ergaenzen; fuer die meisten Heimanschluesse reicht STUN.
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};


let _peer = null;
let _rolle = null;         // 'sender' | 'hoerer'
const _calls = new Set();  // Sender: verbundene Hoerer
let _audioEl = null;       // Hoerer: Wiedergabe-Element
let _hoererVol = 0.25; // Standard beim ersten Start (danach gilt der gespeicherte Wert)
let _appMaster = 1; // Anwendungslautstaerke (Numblock +/-): skaliert den Radio-EMPFANG mit, nie den eigenen Sendestrom

// Beim Laden am Master in sounds.js anmelden — app.js muss dieses Modul dafuer
// nicht mehr vorab importieren (Startlast).
import * as sounds from '../sounds.js';
sounds.onAnwendungsLautstaerke((v) => setAnwendungsLautstaerke(v));
queueMicrotask(() => { try { setAnwendungsLautstaerke(sounds.getAnwendungsLautstaerke()); } catch { /* egal */ } });

// Auto-Reconnect (Hoerer): greift, wenn die Verbindung abbricht und der Spieler
// NICHT selbst getrennt hat. Zeitplan: 3x alle 5 s, dann 3x alle 10 s, dann Aufgabe.
let _manuell = false;        // true = bewusst getrennt (kein Reconnect)
let _hoerKey = null;
let _hoerCb = {};
let _reconnectTimer = null;
let _reconnectVersuch = 0;
let _amReconnect = false;
let _verbundenGewesen = false; // Reconnect erst, wenn die Verbindung einmal STAND
// Der Versuchszaehler wird erst nach einer STABILEN Minute zurueckgesetzt (1.20).
// Frueher genuegte ein kurzer Ton-Frame — bei flatternder Leitung griff der
// Sechs-Versuche-Deckel dadurch nie, und es entstand ein endloser Trenn- und
// Neuverbinde-Kreisel (der Spielabend-Fehler).
const STABIL_MS = 60000;
let _stabilTimer = null;

/** Einen kurzen Zahlen-Schluessel erzeugen: vier Ziffern (z. B. "1234"). */
export function generiereSchluessel() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, '0');
}

/** Schluessel -> feste PeerJS-Kennung (nur erlaubte Zeichen). */
function raumId(schluessel) {
  const rein = String(schluessel || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `skularis-radio-${rein}`;
}

/**
 * Eine stille Tonspur, die der Hoerer beim Anruf mitschickt (er sendet nichts).
 * WICHTIG (1.20): EIN wiederverwendeter AudioContext fuer alle Versuche. Frueher
 * erzeugte jeder Reconnect-Versuch einen neuen Context, der nie geschlossen
 * wurde — Chrome deckelt die Anzahl, danach schlugen alle neuen Verbindungen
 * fehl und nur ein Programm-Neustart half. Geschlossen wird er in stopp().
 */
let _stilleCtx = null;
let _stilleStream = null;
function stilleSpur() {
  if (_stilleStream && _stilleCtx && _stilleCtx.state !== 'closed') return _stilleStream;
  _stilleCtx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = _stilleCtx.createMediaStreamDestination();
  const osc = _stilleCtx.createOscillator();
  const g = _stilleCtx.createGain();
  g.gain.value = 0;
  osc.connect(g); g.connect(dest);
  osc.start();
  _stilleStream = dest.stream;
  return _stilleStream;
}

function verbindungWatch(call, onWeg) {
  const pc = call.peerConnection;
  if (!pc) return;
  pc.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    if (s === 'disconnected' || s === 'failed' || s === 'closed') {
      if (_calls.has(call)) { _calls.delete(call); onWeg(_calls.size); }
    }
  });
}

/**
 * Senden starten (Meister).
 * @param {string} schluessel
 * @param {MediaStream} sendeStrom  aus audio-player.getSendeStrom()
 * @param {object} cb  { onBereit(), onHoererNeu(anzahl), onHoererWeg(anzahl), onFehler(text) }
 */
export function starteSenden(schluessel, sendeStrom, cb, opts = {}) {
  stopp();
  _manuell = false;
  _rolle = 'sender';
  const maxBitrate = (opts && typeof opts.maxBitrate === 'number') ? opts.maxBitrate : null; // kbit/s
  _peer = new window.Peer(raumId(schluessel), { config: ICE, debug: 1 });
  _peer.on('open', () => cb.onBereit && cb.onBereit());
  _peer.on('error', (e) => {
    const typ = e && e.type ? e.type : '';
    if (typ === 'unavailable-id') cb.onFehler && cb.onFehler('Dieser Schluessel sendet schon. Erzeuge einen neuen.');
    else cb.onFehler && cb.onFehler('Radio-Fehler: ' + (e && e.message ? e.message : typ || 'unbekannt'));
  });
  _peer.on('call', (call) => {
    call.answer(sendeStrom);          // mit dem echten Sendestrom antworten
    _calls.add(call);
    if (maxBitrate) setzeBitrate(call, maxBitrate);
    cb.onHoererNeu && cb.onHoererNeu(_calls.size);
    call.on('close', () => { if (_calls.has(call)) { _calls.delete(call); cb.onHoererWeg && cb.onHoererWeg(_calls.size); } });
    verbindungWatch(call, (n) => cb.onHoererWeg && cb.onHoererWeg(n));
  });
}

/** Sende-Bitrate eines Anrufs begrenzen (Opus, ueber RTCRtpSender.setParameters). */
function setzeBitrate(call, kbps) {
  const anwenden = () => {
    try {
      const pc = call.peerConnection;
      if (!pc || !pc.getSenders) return;
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = Math.max(6000, Math.round(kbps * 1000));
      sender.setParameters(params).catch(() => { /* egal, bleibt Standard */ });
    } catch { /* egal */ }
  };
  // Kurz warten, bis der Sender nach dem Answer existiert.
  setTimeout(anwenden, 600);
}

/**
 * Zuhoeren starten (Spieler).
 * @param {string} schluessel
 * @param {object} cb  { onVerbunden(), onGetrennt(), onFehler(text) }
 */
export function starteHoeren(schluessel, cb) {
  stopp();
  _manuell = false;
  _rolle = 'hoerer';
  _hoerKey = schluessel;
  _hoerCb = cb || {};
  _reconnectVersuch = 0;
  _amReconnect = false;
  _verbundenGewesen = false;
  hoereIntern(true);
}

/** Verbindung als Hoerer (neu) aufbauen. erst=true beim allerersten Versuch. */
function hoereIntern(erst) {
  try { if (_peer) _peer.destroy(); } catch { /* egal */ }
  _peer = new window.Peer({ config: ICE, debug: 1 });
  _peer.on('open', () => {
    let call;
    try { call = _peer.call(raumId(_hoerKey), stilleSpur()); }
    catch { if (erst) _hoerCb.onFehler && _hoerCb.onFehler('Verbindung nicht moeglich.'); dropBehandeln(); return; }
    if (!call) { if (erst) _hoerCb.onFehler && _hoerCb.onFehler('Verbindung nicht moeglich.'); dropBehandeln(); return; }
    let hatTon = false;
    call.on('stream', (remote) => {
      hatTon = true;
      const warReconnect = _amReconnect;
      _amReconnect = false;
      _verbundenGewesen = true;
      // Zaehler NICHT sofort nullen: erst wenn die Verbindung eine Minute stabil
      // stand, gilt sie als gesund (sonst Endlos-Kreisel bei flatternder Leitung).
      if (_stabilTimer) clearTimeout(_stabilTimer);
      _stabilTimer = setTimeout(() => { _stabilTimer = null; _reconnectVersuch = 0; }, STABIL_MS);
      spieleEmpfang(remote);
      if (warReconnect) _hoerCb.onReconnectErfolg && _hoerCb.onReconnectErfolg();
      else _hoerCb.onVerbunden && _hoerCb.onVerbunden();
    });
    call.on('close', () => { dropBehandeln('Verbindung getrennt.'); });
    call.on('error', () => { dropBehandeln('Verbindung gestoert.'); });
    // Kommt binnen einiger Sekunden kein Ton, ist der Meister (noch) nicht da.
    setTimeout(() => {
      if (hatTon || _manuell) return;
      dropBehandeln('Kein Sender gefunden. Stimmt der Schluessel, sendet der Meister?');
    }, 8000);
  });
  _peer.on('error', (e) => {
    const typ = e && e.type ? e.type : '';
    const msg = typ === 'peer-unavailable'
      ? 'Kein Sender unter diesem Schluessel. Sendet der Meister schon?'
      : 'Radio-Fehler: ' + (e && e.message ? e.message : typ || 'unbekannt');
    dropBehandeln(msg);
  });
}

/**
 * Ein Abbruch. War die Verbindung noch NIE aufgebaut (erster Versuch scheitert),
 * wird nur der Fehler gemeldet - KEIN Reconnect-Kreisel (sonst stoert er den Aufbau).
 * Erst wenn die Verbindung einmal stand und dann abbricht, greift der Reconnect.
 */
function dropBehandeln(fehlerText) {
  if (_manuell) return;
  // Abbruch beendet die Stabil-Messung (der Zaehler bleibt stehen).
  if (_stabilTimer) { clearTimeout(_stabilTimer); _stabilTimer = null; }
  if (!_verbundenGewesen) {
    // Erstverbindung fehlgeschlagen: melden, nicht endlos neu versuchen.
    if (fehlerText) _hoerCb.onFehler && _hoerCb.onFehler(fehlerText);
    return;
  }
  if (!_amReconnect) { _amReconnect = true; _hoerCb.onReconnectStart && _hoerCb.onReconnectStart(); }
  planeReconnectHoerer();
}

function planeReconnectHoerer() {
  if (_manuell) return;
  if (_reconnectTimer) return; // schon ein Versuch geplant
  _reconnectVersuch += 1;
  if (_reconnectVersuch > 6) { _amReconnect = false; _hoerCb.onAufgegeben && _hoerCb.onAufgegeben(); return; }
  const delay = _reconnectVersuch <= 3 ? 5000 : 10000;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (_manuell) return;
    hoereIntern(false);
  }, delay);
}

/** Empfangenen Ton abspielen; Lautstaerke ueber das Wiedergabe-Element. */
function spieleEmpfang(remote) {
  if (!_audioEl) {
    _audioEl = new Audio();
    _audioEl.autoplay = true;
  }
  _audioEl.srcObject = remote;
  _audioEl.volume = Math.max(0, Math.min(1, _hoererVol * _appMaster));
  _audioEl.play().catch(() => { /* Autoplay erst nach Geste — die Geste war der Klick */ });
}

/** Hoerer-Lautstaerke (0 bis 100), getrennt von allen anderen Toenen. */
export function setHoererLautstaerke(prozent) {
  _hoererVol = Math.max(0, Math.min(1, prozent / 100));
  if (_audioEl) _audioEl.volume = Math.max(0, Math.min(1, _hoererVol * _appMaster));
}

export function getHoererLautstaerke() {
  return Math.round(_hoererVol * 100);
}

/** Anwendungslautstaerke (Numblock +/-) fuer den Radio-Empfang. Skaliert nur, was
 *  DU hoerst; der eigene Sendestrom an die Spieler bleibt unberuehrt. Die
 *  Persistenz (app_master_vol) uebernimmt der Numblock-Handler. */
export function setAnwendungsLautstaerke(prozent) {
  _appMaster = Math.max(0, Math.min(1, prozent / 100));
  if (_audioEl) _audioEl.volume = Math.max(0, Math.min(1, _hoererVol * _appMaster));
}
export function getAnwendungsLautstaerke() { return Math.round(_appMaster * 100); }

/** Anzahl aktuell verbundener Hoerer (nur beim Sender sinnvoll). */
export function hoererAnzahl() {
  return _calls.size;
}

export function istAktiv() {
  return Boolean(_peer);
}

export function rolle() {
  return _rolle;
}

/** Laeuft gerade ein automatischer Wiederverbindungs-Versuch (Hoerer)? */
export function istAmReconnect() { return _amReconnect; }

/** Das automatische Wiederverbinden abbrechen (z. B. per ESC). true, wenn gestoppt. */
export function reconnectAbbrechen() {
  if (!_amReconnect && !_reconnectTimer) return false;
  _manuell = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _amReconnect = false;
  _reconnectVersuch = 0;
  return true;
}

/** Alles beenden und aufraeumen. Gilt als BEWUSSTES Trennen -> kein Reconnect. */
export function stopp() {
  _manuell = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_stabilTimer) { clearTimeout(_stabilTimer); _stabilTimer = null; }
  _amReconnect = false;
  _reconnectVersuch = 0;
  _verbundenGewesen = false;
  for (const c of _calls) { try { c.close(); } catch { /* egal */ } }
  _calls.clear();
  if (_audioEl) { try { _audioEl.pause(); _audioEl.srcObject = null; } catch { /* egal */ } _audioEl = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* egal */ } _peer = null; }
  // Den Stille-Context schliessen (siehe stilleSpur): kein Context-Leck mehr.
  if (_stilleCtx) { try { _stilleCtx.close(); } catch { /* egal */ } _stilleCtx = null; _stilleStream = null; }
  _rolle = null;
}
