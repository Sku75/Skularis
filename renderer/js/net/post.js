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
  if (d.typ === 'msg') {
    if (d.id && _gesehen.has(d.id)) return;
    if (d.id) _gesehen.add(d.id);
    const von = nameVon(conn) || d.von || 'Spieler';
    // Post an einen anderen Spieler: über den Meister weiterreichen (Relay).
    if (d.an && d.an !== 'Meister') {
      const ziel = _conns.get(d.an);
      if (ziel) { try { ziel.send({ typ: 'msg', id: d.id, von, an: d.an, text: d.text, zeit: d.zeit }); } catch { /* egal */ } }
      return;
    }
    _cb.onNachricht && _cb.onNachricht({ id: d.id, von, text: String(d.text || ''), zeit: d.zeit });
  }
}

/** Meister sendet an einen verbundenen Spieler. true bei Erfolg. */
export function meisterSende(an, text) {
  const c = _conns.get(an);
  if (!c) return false;
  try { c.send({ typ: 'msg', id: neueId(), von: 'Meister', an, text: String(text || ''), zeit: Date.now() }); return true; }
  catch { return false; }
}

// --- Spieler ------------------------------------------------------------

/**
 * Als Spieler zum Meister verbinden (Code + eigener Name).
 * cb: onVerbunden(), onGetrennt(), onFehler(text), onNachricht({id,von,text,zeit}),
 *     onSpielerListe(namen[])
 */
export function verbindeSpielerPost(code, name, cb) {
  stopp();
  _rolle = 'spieler';
  _cb = cb || {};
  _selbstName = (String(name || '').trim()) || 'Spieler';
  _peer = new window.Peer({ config: ICE, debug: 1 });
  _peer.on('open', () => {
    let conn;
    try { conn = _peer.connect(postRaum(code), { metadata: { name: _selbstName }, reliable: true }); }
    catch { _cb.onFehler && _cb.onFehler('Verbindung nicht möglich.'); return; }
    if (!conn) { _cb.onFehler && _cb.onFehler('Verbindung nicht möglich.'); return; }
    _meisterConn = conn;
    conn.on('open', () => { try { conn.send({ typ: 'hello', name: _selbstName }); } catch { /* egal */ } _cb.onVerbunden && _cb.onVerbunden(); });
    conn.on('data', (d) => spielerEmpfang(d));
    conn.on('close', () => _cb.onGetrennt && _cb.onGetrennt());
    conn.on('error', () => _cb.onFehler && _cb.onFehler('Verbindung gestört.'));
    setTimeout(() => { if (_meisterConn && !_meisterConn.open) _cb.onFehler && _cb.onFehler('Kein Meister unter diesem Code. Läuft die Post-Verbindung beim Meister?'); }, 8000);
  });
  _peer.on('error', (e) => {
    const t = e && e.type ? e.type : '';
    if (t === 'peer-unavailable') _cb.onFehler && _cb.onFehler('Kein Meister unter diesem Code.');
    else _cb.onFehler && _cb.onFehler('Post-Fehler: ' + (e && e.message ? e.message : t || 'unbekannt'));
  });
}

function spielerEmpfang(d) {
  if (!d || typeof d !== 'object') return;
  if (d.typ === 'liste') { _cb.onSpielerListe && _cb.onSpielerListe(Array.isArray(d.namen) ? d.namen : []); return; }
  if (d.typ === 'msg') {
    if (d.id && _gesehen.has(d.id)) return;
    if (d.id) _gesehen.add(d.id);
    _cb.onNachricht && _cb.onNachricht({ id: d.id, von: d.von || 'Meister', text: String(d.text || ''), zeit: d.zeit });
  }
}

/** Spieler sendet an "Meister" oder an einen Mitspieler-Namen (Relay über Meister). */
export function spielerSende(an, text) {
  if (!_meisterConn || !_meisterConn.open) return false;
  try { _meisterConn.send({ typ: 'msg', id: neueId(), von: _selbstName, an, text: String(text || ''), zeit: Date.now() }); return true; }
  catch { return false; }
}

export function stopp() {
  try { for (const c of _conns.values()) c.close(); } catch { /* egal */ }
  _conns.clear();
  if (_meisterConn) { try { _meisterConn.close(); } catch { /* egal */ } _meisterConn = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* egal */ } _peer = null; }
  _rolle = null;
  _cb = {};
}
