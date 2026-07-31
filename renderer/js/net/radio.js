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
let _hoererVol = 0.8;

/** Einen kurzen Zahlen-Schluessel erzeugen: sechs Ziffern (z. B. "123456"). */
export function generiereSchluessel() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

/** Schluessel -> feste PeerJS-Kennung (nur erlaubte Zeichen). */
function raumId(schluessel) {
  const rein = String(schluessel || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `skularis-radio-${rein}`;
}

/** Eine stille Tonspur, die der Hoerer beim Anruf mitschickt (er sendet nichts). */
function stilleSpur() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ac.createMediaStreamDestination();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  g.gain.value = 0;
  osc.connect(g); g.connect(dest);
  osc.start();
  return dest.stream;
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
export function starteSenden(schluessel, sendeStrom, cb) {
  stopp();
  _rolle = 'sender';
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
    cb.onHoererNeu && cb.onHoererNeu(_calls.size);
    call.on('close', () => { if (_calls.has(call)) { _calls.delete(call); cb.onHoererWeg && cb.onHoererWeg(_calls.size); } });
    verbindungWatch(call, (n) => cb.onHoererWeg && cb.onHoererWeg(n));
  });
}

/**
 * Zuhoeren starten (Spieler).
 * @param {string} schluessel
 * @param {object} cb  { onVerbunden(), onGetrennt(), onFehler(text) }
 */
export function starteHoeren(schluessel, cb) {
  stopp();
  _rolle = 'hoerer';
  _peer = new window.Peer({ config: ICE, debug: 1 });
  _peer.on('open', () => {
    let call;
    try { call = _peer.call(raumId(schluessel), stilleSpur()); }
    catch { cb.onFehler && cb.onFehler('Verbindung nicht moeglich.'); return; }
    if (!call) { cb.onFehler && cb.onFehler('Verbindung nicht moeglich.'); return; }
    let hatTon = false;
    call.on('stream', (remote) => {
      hatTon = true;
      spieleEmpfang(remote);
      cb.onVerbunden && cb.onVerbunden();
    });
    call.on('close', () => cb.onGetrennt && cb.onGetrennt());
    call.on('error', () => cb.onFehler && cb.onFehler('Verbindung gestoert.'));
    // Kommt binnen einiger Sekunden kein Ton, ist meist der Schluessel falsch
    // oder es sendet gerade niemand.
    setTimeout(() => { if (!hatTon) cb.onFehler && cb.onFehler('Kein Sender gefunden. Stimmt der Schluessel, sendet der Meister?'); }, 8000);
  });
  _peer.on('error', (e) => {
    const typ = e && e.type ? e.type : '';
    if (typ === 'peer-unavailable') cb.onFehler && cb.onFehler('Kein Sender unter diesem Schluessel. Sendet der Meister schon?');
    else cb.onFehler && cb.onFehler('Radio-Fehler: ' + (e && e.message ? e.message : typ || 'unbekannt'));
  });
}

/** Empfangenen Ton abspielen; Lautstaerke ueber das Wiedergabe-Element. */
function spieleEmpfang(remote) {
  if (!_audioEl) {
    _audioEl = new Audio();
    _audioEl.autoplay = true;
  }
  _audioEl.srcObject = remote;
  _audioEl.volume = _hoererVol;
  _audioEl.play().catch(() => { /* Autoplay erst nach Geste — die Geste war der Klick */ });
}

/** Hoerer-Lautstaerke (0 bis 100), getrennt von allen anderen Toenen. */
export function setHoererLautstaerke(prozent) {
  _hoererVol = Math.max(0, Math.min(1, prozent / 100));
  if (_audioEl) _audioEl.volume = _hoererVol;
}

export function getHoererLautstaerke() {
  return Math.round(_hoererVol * 100);
}

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

/** Alles beenden und aufraeumen. */
export function stopp() {
  for (const c of _calls) { try { c.close(); } catch { /* egal */ } }
  _calls.clear();
  if (_audioEl) { try { _audioEl.pause(); _audioEl.srcObject = null; } catch { /* egal */ } _audioEl = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* egal */ } _peer = null; }
  _rolle = null;
}
