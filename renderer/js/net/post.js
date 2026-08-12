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
const _gesehen = new Set();     // Ids bereits verarbeiteter Nachrichten (Dedup)
const _status = new Map();      // Meister: name -> { werte, seq, zeit }  (F2-Live)
let _statusSeq = 0;             // Spieler: laufende Nummer der eigenen Statusmeldung

// Auto-Reconnect (Spieler): greift bei Abbruch, wenn nicht bewusst getrennt.
// Zeitplan: 3x alle 5 s, dann 3x alle 10 s, dann Aufgabe. Name und Dedup-Ids
// bleiben erhalten (kein stopp() beim Reconnect), damit nichts verfaellt.
let _code = null;
let _manuell = false;
let _reconnectTimer = null;
let _reconnectVersuch = 0;
let _amReconnect = false;
let _verbundenGewesen = false; // Reconnect erst, wenn die Verbindung einmal STAND

/** Meister: letzter empfangener F2-Stand eines Spielers (oder null). */
export function getStatus(name) { const s = _status.get(name); return s ? s.werte : null; }
/** Meister: Live-Stand nach stabiler Charakter-ID (ordnet auch nach Umbenennung korrekt zu). */
export function getStatusById(id) {
  if (!id) return null;
  for (const s of _status.values()) if (s.werte && s.werte.id === id) return s.werte;
  return null;
}
/** Meister: alle Namen mit einem Live-Status. */
export function statusNamen() { return [..._status.keys()]; }

function postRaum(code) {
  const rein = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `skularis-post-${rein}`;
}

function neueId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${a[0].toString(36)}-${a[1].toString(36)}`;
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
    conn.on('data', (d) => meisterEmpfang(conn, d));
    conn.on('close', () => meisterConnWeg(conn));
    conn.on('error', () => meisterConnWeg(conn));
  });
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
  if (d.typ === 'hello') {
    const name = (String(d.name || 'Spieler').trim()) || 'Spieler';
    const alt = _conns.get(name);
    if (alt && alt !== conn) { try { alt.close(); } catch { /* egal */ } } // Reconnect: alten ersetzen
    _conns.set(name, conn);
    _cb.onSpielerNeu && _cb.onSpielerNeu(name);
    sendeSpielerListe();
    return;
  }
  if (d.typ === 'status') {
    const name = nameVon(conn) || d.name;
    if (!name) return;
    const vorher = _status.get(name);
    if (vorher && typeof d.seq === 'number' && d.seq < vorher.seq) return; // veraltetes Paket verwerfen
    _status.set(name, { werte: d.werte || {}, seq: (typeof d.seq === 'number' ? d.seq : 0), zeit: Date.now() });
    _cb.onStatus && _cb.onStatus(name, d.werte || {});
    return;
  }
  if (d.typ === 'msg' || d.typ === 'popup') {
    if (d.id && _gesehen.has(d.id)) return;
    if (d.id) _gesehen.add(d.id);
    const von = nameVon(conn) || d.von || 'Spieler';
    const typ = d.typ;
    // "An alle": an den Meister zustellen UND an alle anderen Spieler weiterreichen.
    if (d.an === '*') {
      for (const [n, c] of _conns) { if (c !== conn) { try { c.send({ typ, id: d.id, von, an: '*', text: d.text, zeit: d.zeit }); } catch { /* egal */ } } }
      _cb.onNachricht && _cb.onNachricht({ id: d.id, von, text: String(d.text || ''), zeit: d.zeit, typ, an: '*' });
      return;
    }
    // Post an einen anderen Spieler: über den Meister weiterreichen (Relay).
    if (d.an && d.an !== 'Meister') {
      const ziel = _conns.get(d.an);
      if (ziel) { try { ziel.send({ typ, id: d.id, von, an: d.an, text: d.text, zeit: d.zeit }); } catch { /* egal */ } }
      return;
    }
    _cb.onNachricht && _cb.onNachricht({ id: d.id, von, text: String(d.text || ''), zeit: d.zeit, typ });
  }
}

/**
 * Meister sendet an einen Spieler oder mit an='*' an alle. typ 'msg' (Posteingang)
 * oder 'popup' (Pop-up beim Empfänger). true bei mindestens einer Zustellung.
 */
export function meisterSende(an, text, typ = 'msg') {
  const paket = (ziel) => ({ typ, id: neueId(), von: 'Meister', an: ziel, text: String(text || ''), zeit: Date.now() });
  if (an === '*') {
    let ok = false;
    for (const c of _conns.values()) { try { c.send(paket('*')); ok = true; } catch { /* egal */ } }
    return ok;
  }
  const c = _conns.get(an);
  if (!c) return false;
  try { c.send(paket(an)); return true; } catch { return false; }
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
      _reconnectVersuch = 0;
      _verbundenGewesen = true;
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

function spielerEmpfang(d) {
  if (!d || typeof d !== 'object') return;
  if (d.typ === 'liste') { _cb.onSpielerListe && _cb.onSpielerListe(Array.isArray(d.namen) ? d.namen : []); return; }
  if (d.typ === 'msg' || d.typ === 'popup') {
    if (d.id && _gesehen.has(d.id)) return;
    if (d.id) _gesehen.add(d.id);
    _cb.onNachricht && _cb.onNachricht({ id: d.id, von: d.von || 'Meister', text: String(d.text || ''), zeit: d.zeit, typ: d.typ });
  }
}

/**
 * Spieler sendet an "Meister", einen Mitspieler-Namen oder '*' (alle, Relay über
 * Meister). typ 'msg' (Posteingang) oder 'popup' (Pop-up beim Empfänger).
 */
export function spielerSende(an, text, typ = 'msg') {
  if (!_meisterConn || !_meisterConn.open) return false;
  try { _meisterConn.send({ typ, id: neueId(), von: _selbstName, an, text: String(text || ''), zeit: Date.now() }); return true; }
  catch { return false; }
}

/** Spieler sendet seinen F2-Stand (Live-Übertragung) an den Meister. */
export function spielerStatus(werte) {
  if (!_meisterConn || !_meisterConn.open) return false;
  try { _meisterConn.send({ typ: 'status', name: _selbstName, seq: ++_statusSeq, werte: werte || {}, zeit: Date.now() }); return true; }
  catch { return false; }
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
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
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
