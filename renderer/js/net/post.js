/**
 * Skularis — Meisterpost (Textnachrichten über PeerJS-Datenkanal).
 *
 * Getrennt vom Audio-Radio (eigener Peer-Namensraum "skularis-post-<code>"), damit
 * Post und Ton unabhängig laufen und ein Abbruch des einen den anderen nicht stört.
 * Sterntopologie: der Meister ist die Mitte, die Spieler verbinden sich zu ihm.
 * Post von Spieler zu Spieler wird über den Meister weitergereicht (Relay).
 *
 * Ablauf: Der Meister startet die Post-Verbindung unter einem Code. Der Spieler gibt
 * den Code und seinen Namen ein; beim Verbinden schickt er einen "hello"-Gruß mit
 * dem Namen. Der Meister führt eine Liste Name -> Verbindung. Reconnect mit gleichem
 * Namen ersetzt den alten Eintrag (kein Doppeleintrag). Jede Nachricht trägt eine Id
 * gegen Doppelzustellung.
 *
 * PeerJS wird als globales window.Peer geladen (renderer/assets/vendor).
 */

import { diag } from '../core/diag.js';

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

let _peer = null;
let _rolle = null;              // 'meister' | 'spieler'
const _conns = new Map();       // Meister: name -> DataConnection
let _meisterConn = null;        // Spieler: Verbindung zum Meister
let _selbstName = '';
let _cb = {};

// Würfelprotokoll (verlustfrei über Sequenznummern):
const _wuerfe = new Map();      // Meister: name -> [ {seq, was, ergebnis, detail, zeit} ] (neueste vorn)
let _wurfSeq = 0;              // Spieler: laufende Nummer der eigenen Würfe
const _wurfLog = [];          // Spieler: eigenes Wurf-Protokoll (für erneutes Senden nach Reconnect)

/** Meister: alle Namen mit Würfen (inkl. "Meister"). */
export function wurfNamen() { return [..._wuerfe.keys()]; }
/** Meister: Wurf-Liste eines Namens (neueste zuerst) oder []. */
export function getWuerfe(name) { return _wuerfe.get(name) || []; }
/** Meister: letzter Wurf eines Namens oder null. */
export function letzterWurf(name) { const l = _wuerfe.get(name); return (l && l[0]) || null; }
/** Einen Wurf in das Meister-Protokoll legen (dedup über seq je Name). */
function wurfSpeichern(name, rec) {
  if (!name || !rec) return;
  let liste = _wuerfe.get(name);
  if (!liste) { liste = []; _wuerfe.set(name, liste); }
  if (typeof rec.seq === 'number' && liste.some(x => x.seq === rec.seq)) return; // schon da
  liste.unshift({ seq: rec.seq, was: rec.was || '', ergebnis: rec.ergebnis || '', detail: rec.detail || '', zeit: rec.zeit || jetzt() });
  if (liste.length > 200) liste.length = 200; // Deckel
}
/** Meister: einen EIGENEN (verdeckten) Wurf ins Protokoll unter "Meister" legen. */
export function meisterEigenerWurf(rec) { wurfSpeichern('Meister', { ...rec, seq: ++_wurfSeq }); }

// Auto-Reconnect (Spieler): greift bei Abbruch, wenn nicht bewusst getrennt.
// Zeitplan: 3x alle 5 s, dann 3x alle 10 s, dann Aufgabe. Name und Dedup-Ids
// bleiben erhalten (kein stopp() beim Reconnect), damit nichts verfaellt.
let _code = null;
let _manuell = false;
let _reconnectTimer = null;
let _reconnectVersuch = 0;
let _amReconnect = false;
let _verbundenGewesen = false; // Reconnect erst, wenn die Verbindung einmal STAND
let _stabilTimer = null;       // nullt den Versuchszaehler erst nach 60 s stabiler Verbindung

// --- Heartbeat (Totmann-Erkennung) --------------------------------------
// PeerJS meldet einen echten Netzabbruch oft NICHT (kein close-Event). Daher ein
// eigener Herzschlag: beide Seiten senden regelmaessig ping und antworten mit pong.
// Bleibt die Gegenseite zu lange still, gilt die Leitung als tot -> Meister wirft den
// Spieler aus der Liste, Spieler baut AKTIV neu auf (statt auf PeerJS zu warten).
const HEARTBEAT_MS = 12000;   // alle 12 s ein ping
const TOT_MS = 40000;         // ~3 ausbleibende Antworten -> Leitung tot
let _hbMeister = null;        // Meister: ein Intervall fuer alle Spieler
let _hbSpieler = null;        // Spieler: ein Intervall zum Meister
let _meisterLastSeen = 0;     // Spieler: wann kam zuletzt etwas vom Meister
function jetzt() { return Date.now(); }
function istHerzschlag(d) { return d && (d.typ === 'ping' || d.typ === 'pong'); }

function postRaum(code) {
  const rein = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `skularis-post-${rein}`;
}

export function istAktiv() { return Boolean(_peer); }
export function rolle() { return _rolle; }
export function verbundeneSpieler() { return [..._conns.keys()]; }
export function istVerbunden() {
  if (_rolle === 'spieler') return Boolean(_meisterConn && _meisterConn.open);
  return Boolean(_peer);
}

// --- Meister ------------------------------------------------------------

/**
 * Post-Verbindung als Meister starten.
 * cb: onBereit(), onFehler(text), onSpielerNeu(name), onSpielerWeg(name),
 *     onNachricht({id, von, text, zeit})
 */
export function starteMeisterPost(code, cb) {
  stopp();
  _rolle = 'meister';
  _cb = cb || {};
  _peer = new window.Peer(postRaum(code), { config: ICE, debug: 1 });
  _peer.on('open', () => _cb.onBereit && _cb.onBereit());
  _peer.on('error', (e) => {
    const t = e && e.type ? e.type : '';
    if (t === 'unavailable-id') _cb.onFehler && _cb.onFehler('Unter diesem Code läuft schon eine Post-Verbindung. Erzeuge einen neuen Code.');
    else _cb.onFehler && _cb.onFehler('Post-Fehler: ' + (e && e.message ? e.message : t || 'unbekannt'));
  });
  _peer.on('connection', (conn) => {
    conn._lastSeen = jetzt();
    conn.on('data', (d) => meisterEmpfang(conn, d));
    conn.on('close', () => meisterConnWeg(conn));
    conn.on('error', () => meisterConnWeg(conn));
  });
  if (_hbMeister) clearInterval(_hbMeister);
  _hbMeister = setInterval(meisterHerzschlag, HEARTBEAT_MS);
}

/** Meister-Herzschlag: jeden Spieler anpingen; wer zu lange still ist, gilt als tot. */
function meisterHerzschlag() {
  const t = jetzt();
  for (const [, conn] of [..._conns]) {
    if (conn._lastSeen && (t - conn._lastSeen) > TOT_MS) {
      try { conn.close(); } catch { /* egal */ }
      meisterConnWeg(conn); // markiert offline + sendet Spielerliste
      continue;
    }
    try { conn.send({ typ: 'ping' }); } catch { /* egal */ }
  }
}

function nameVon(conn) {
  for (const [n, c] of _conns) if (c === conn) return n;
  return null;
}

function meisterConnWeg(conn) {
  const n = nameVon(conn);
  if (n && _conns.get(n) === conn) {
    _conns.delete(n);
    _cb.onSpielerWeg && _cb.onSpielerWeg(n);
    sendeSpielerListe();
  }
}

function sendeSpielerListe() {
  const namen = [..._conns.keys()];
  for (const c of _conns.values()) { try { c.send({ typ: 'liste', namen }); } catch { /* egal */ } }
}

function meisterEmpfang(conn, d) {
  if (!d || typeof d !== 'object') return;
  conn._lastSeen = jetzt();
  if (d.typ === 'ping') { try { conn.send({ typ: 'pong' }); } catch { /* egal */ } return; }
  if (d.typ === 'pong') return; // nur Lebenszeichen, kein Inhalt
  try { diag(`RX Meister: typ=${d.typ} id=${d.id || '-'} von=${d.name || nameVon(conn) || '?'} an=${d.an || '-'}`); } catch { /* egal */ }
  if (d.typ === 'hello') {
    const name = (String(d.name || 'Spieler').trim()) || 'Spieler';
    const alt = _conns.get(name);
    if (alt && alt !== conn) { try { alt.close(); } catch { /* egal */ } } // Reconnect: alten ersetzen
    _conns.set(name, conn);
    _cb.onSpielerNeu && _cb.onSpielerNeu(name);
    sendeSpielerListe();
    return;
  }
  if (d.typ === 'wurf') {
    const name = nameVon(conn) || d.von;
    if (!name) return;
    wurfSpeichern(name, d); // verlustfrei: dedup über seq; Reconnect schickt das ganze Log erneut
    _cb.onWurf && _cb.onWurf(name);
    return;
  }
}

/** Meister: einen einzelnen Spieler bewusst trennen (aus der Connectliste). */
export function trenneSpieler(name) {
  const c = _conns.get(name);
  if (!c) return false;
  try { c.close(); } catch { /* egal */ }
  _conns.delete(name);
  sendeSpielerListe();
  return true;
}

/** Meister: alle Spieler bewusst trennen. */
export function trenneAlleSpieler() {
  for (const [n, c] of [..._conns]) { try { c.close(); } catch { /* egal */ } _conns.delete(n); }
  sendeSpielerListe();
}

// --- Spieler ------------------------------------------------------------

/**
 * Als Spieler zum Meister verbinden (Code + eigener Name).
 * cb: onVerbunden(), onGetrennt(), onFehler(text), onNachricht({id,von,text,zeit}),
 *     onSpielerListe(namen[])
 */
export function verbindeSpielerPost(code, name, cb) {
  stopp();
  _manuell = false;
  _rolle = 'spieler';
  _cb = cb || {};
  _selbstName = (String(name || '').trim()) || 'Spieler';
  _code = code;
  _reconnectVersuch = 0;
  _amReconnect = false;
  _verbundenGewesen = false;
  spielerVerbindeIntern(true);
}

/** Verbindung als Spieler (neu) aufbauen. erst=true beim allerersten Versuch. */
function spielerVerbindeIntern(erst) {
  try { if (_peer) _peer.destroy(); } catch { /* egal */ }
  _meisterConn = null;
  _peer = new window.Peer({ config: ICE, debug: 1 });
  _peer.on('open', () => {
    let conn;
    try { conn = _peer.connect(postRaum(_code), { metadata: { name: _selbstName }, reliable: true }); }
    catch { if (erst) _cb.onFehler && _cb.onFehler('Verbindung nicht möglich.'); dropBehandelnPost(); return; }
    if (!conn) { if (erst) _cb.onFehler && _cb.onFehler('Verbindung nicht möglich.'); dropBehandelnPost(); return; }
    _meisterConn = conn;
    conn.on('open', () => {
      try { conn.send({ typ: 'hello', name: _selbstName }); } catch { /* egal */ }
      const warReconnect = _amReconnect;
      _amReconnect = false;
      // Zaehler erst nach einer STABILEN Minute nullen (1.20): sonst greift der
      // Sechs-Versuche-Deckel bei flatternder Leitung nie (Endlos-Kreisel).
      if (_stabilTimer) clearTimeout(_stabilTimer);
      _stabilTimer = setTimeout(() => { _stabilTimer = null; _reconnectVersuch = 0; }, 60000);
      _verbundenGewesen = true;
      _meisterLastSeen = jetzt();
      if (_hbSpieler) clearInterval(_hbSpieler);
      _hbSpieler = setInterval(spielerHerzschlag, HEARTBEAT_MS);
      sendeWurfLogErneut(); // Wurf-Protokoll abgleichen (verlustfrei über seq)
      if (warReconnect) _cb.onReconnectErfolg && _cb.onReconnectErfolg();
      else _cb.onVerbunden && _cb.onVerbunden();
    });
    conn.on('data', (d) => spielerEmpfang(d));
    conn.on('close', () => dropBehandelnPost('Verbindung zum Meister getrennt.'));
    conn.on('error', () => dropBehandelnPost('Verbindung gestört.'));
    setTimeout(() => {
      if (_manuell || (_meisterConn && _meisterConn.open)) return;
      dropBehandelnPost('Kein Meister unter diesem Code. Läuft die Post-Verbindung beim Meister?');
    }, 8000);
  });
  _peer.on('error', (e) => {
    const t = e && e.type ? e.type : '';
    const msg = t === 'peer-unavailable' ? 'Kein Meister unter diesem Code.' : 'Post-Fehler: ' + (e && e.message ? e.message : t || 'unbekannt');
    dropBehandelnPost(msg);
  });
}

/**
 * Abbruch. War die Verbindung noch NIE aufgebaut (erster Versuch scheitert), nur
 * melden - KEIN Reconnect-Kreisel. Erst wenn sie einmal stand und dann abbricht,
 * greift der Reconnect (3x5s, dann 3x10s, dann Aufgabe).
 */
function dropBehandelnPost(fehlerText) {
  if (_manuell) return;
  if (_stabilTimer) { clearTimeout(_stabilTimer); _stabilTimer = null; }
  if (!_verbundenGewesen) {
    if (fehlerText) _cb.onFehler && _cb.onFehler(fehlerText);
    return;
  }
  if (!_amReconnect) { _amReconnect = true; _cb.onReconnectStart && _cb.onReconnectStart(); }
  if (_reconnectTimer) return;
  _reconnectVersuch += 1;
  if (_reconnectVersuch > 6) { _amReconnect = false; _cb.onAufgegeben && _cb.onAufgegeben(); return; }
  const delay = _reconnectVersuch <= 3 ? 5000 : 10000;
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; if (_manuell) return; spielerVerbindeIntern(false); }, delay);
}

/** Spieler-Herzschlag: den Meister anpingen; bleibt er zu lange still, aktiv neu verbinden. */
function spielerHerzschlag() {
  if (_manuell) return;
  const conn = _meisterConn;
  if (conn && conn.open) { try { conn.send({ typ: 'ping' }); } catch { /* egal */ } }
  if (_verbundenGewesen && _meisterLastSeen && (jetzt() - _meisterLastSeen) > TOT_MS) {
    // Leitung tot, obwohl PeerJS nichts meldet -> aktiv neu aufbauen.
    _meisterLastSeen = jetzt(); // Mehrfach-Ausloesung verhindern
    if (_hbSpieler) { clearInterval(_hbSpieler); _hbSpieler = null; }
    try { if (_meisterConn) _meisterConn.close(); } catch { /* egal */ }
    dropBehandelnPost('Verbindung zum Meister eingeschlafen, ich verbinde neu.');
  }
}

function spielerEmpfang(d) {
  if (!d || typeof d !== 'object') return;
  _meisterLastSeen = jetzt();
  if (d.typ === 'ping') { try { if (_meisterConn) _meisterConn.send({ typ: 'pong' }); } catch { /* egal */ } return; }
  if (d.typ === 'pong') return; // nur Lebenszeichen
  try { diag(`RX Spieler: typ=${d.typ} id=${d.id || '-'} von=${d.von || '?'}`); } catch { /* egal */ }
  if (d.typ === 'liste') { _cb.onSpielerListe && _cb.onSpielerListe(Array.isArray(d.namen) ? d.namen : []); return; }
}

/**
 * Spieler protokolliert einen Wurf und sendet ihn (mit Sequenznummer) an den
 * Meister. Der Wurf bleibt im lokalen Log; nach einem Reconnect wird das ganze Log
 * erneut geschickt (der Meister dedupt über die seq) — so geht kein Wurf verloren.
 */
export function spielerWurf(rec) {
  const eintrag = { seq: ++_wurfSeq, was: rec.was || '', ergebnis: rec.ergebnis || '', detail: rec.detail || '', zeit: rec.zeit || Date.now() };
  _wurfLog.push(eintrag);
  if (_wurfLog.length > 300) _wurfLog.shift();
  if (_meisterConn && _meisterConn.open) { try { _meisterConn.send({ typ: 'wurf', name: _selbstName, ...eintrag }); } catch { /* egal */ } }
  return true;
}

/** Spieler: das ganze Wurf-Log erneut senden (Abgleich nach Reconnect). */
function sendeWurfLogErneut() {
  if (!_meisterConn || !_meisterConn.open) return;
  for (const e of _wurfLog) { try { _meisterConn.send({ typ: 'wurf', name: _selbstName, ...e }); } catch { /* egal */ } }
}

/** Laeuft gerade ein automatischer Wiederverbindungs-Versuch (Spieler)? */
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

export function stopp() {
  _manuell = true; // bewusstes Trennen -> kein Reconnect
  if (_hbMeister) { clearInterval(_hbMeister); _hbMeister = null; }
  if (_hbSpieler) { clearInterval(_hbSpieler); _hbSpieler = null; }
  _meisterLastSeen = 0;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_stabilTimer) { clearTimeout(_stabilTimer); _stabilTimer = null; }
  _amReconnect = false;
  _reconnectVersuch = 0;
  _verbundenGewesen = false;
  try { for (const c of _conns.values()) c.close(); } catch { /* egal */ }
  _conns.clear();
  if (_meisterConn) { try { _meisterConn.close(); } catch { /* egal */ } _meisterConn = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* egal */ } _peer = null; }
  _rolle = null;
  _cb = {};
}
