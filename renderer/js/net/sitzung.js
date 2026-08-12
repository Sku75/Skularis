/**
 * Skularis — gemeinsame Online-Sitzung: Radio (Ton) UND Post (Nachrichten) unter
 * EINEM Code. Damit hat, wer im Meister-Radio ist, automatisch auch die Post und
 * umgekehrt. Bewusst getrennt vom (spaeteren) Charakterbogen-Transfer.
 *
 * Spieler: verbindeSpieler(code, name, postCb, radioCb) baut BEIDE Verbindungen auf.
 * Meister: ein stabiler Sitzungscode (meisterCode) fuer Post UND Radio; das Starten
 * des Radios stellt sicher, dass auch die Post laeuft.
 *
 * Die PeerJS-Namensraeume 'skularis-post-<code>' und 'skularis-radio-<code>'
 * kollidieren nicht; derselbe Code adressiert beide. Post und Radio bleiben eigene
 * Peers (wie bisher), nur der Code ist jetzt gemeinsam.
 */
import * as radio from './radio.js';
import * as post from './post.js';
import { generiereSchluessel } from './radio.js';

let _code = null;      // aktueller Sitzungscode (Spieler: verbunden mit; Meister: eigener)
let _name = null;      // Spielername fuer die Post
let _rolle = null;     // 'spieler' | 'meister' | null
let _radioAn = false;  // hoert/sendet Radio gerade?
let _aenderung = null; // optionaler UI-Refresh-Hook

export function code() { return _code; }
export function name() { return _name; }
export function rolle() { return _rolle; }
export function radioAn() { return _radioAn; }
export function postAn() { return post.istVerbunden(); }
export function aktiv() { return _rolle !== null; }
export function setAenderung(fn) { _aenderung = typeof fn === 'function' ? fn : null; }
function ping() { try { _aenderung && _aenderung(); } catch { /* egal */ } }

// --- Meister-Sitzungscode (fuer Post UND Radio derselbe) -----------------

let _meisterCode = null;
/** Stabiler Meister-Code; wird einmal erzeugt und fuer Post + Radio genutzt. */
export function meisterCode() { if (!_meisterCode) _meisterCode = generiereSchluessel(); return _meisterCode; }
/** Gespeicherten Code beim Start uebernehmen (nur wenn noch keiner gesetzt ist, damit
 *  ein bereits laufender Code nicht mitten in der Sitzung wechselt). */
export function setMeisterCode(c) { const s = String(c || '').trim(); if (s && !_meisterCode) _meisterCode = s; }

// --- Spieler -------------------------------------------------------------

/**
 * Spieler verbindet Post UND Radio unter EINEM Code.
 * @param {string} rohCode     der Code des Meisters
 * @param {string} spielerName Name fuer die Post
 * @param {object} postCb      die Post-Callbacks des Aufrufers (Nachrichten, Mitspieler, Status)
 * @param {object} radioCb     optionale Radio-UI-Callbacks (onVerbunden/onGetrennt)
 * @returns {boolean} false, wenn Code oder Name fehlen
 */
export function verbindeSpieler(rohCode, spielerName, postCb = {}, radioCb = {}) {
  const c = String(rohCode || '').trim();
  const n = String(spielerName || '').trim();
  if (!c || !n) return false;
  _name = n;
  // Radio zuhoeren (Fehler bleiben STILL: der Meister sendet evtl. (noch) kein Radio,
  // die Post soll trotzdem laufen). Der Reconnect greift (wie in radio.js) erst,
  // nachdem der Ton einmal ankam.
  verbindeNurRadio(c, radioCb);
  // Post: die eigentliche Nachrichten-Logik liefert der Aufrufer als postCb.
  post.verbindeSpielerPost(c, n, wrapPostCb(postCb));
  return true;
}

/** Nur den Radio-Ton zuhoeren (ohne Post) — fuers globale F12 ohne offenes Abenteuer. */
export function verbindeNurRadio(rohCode, radioCb = {}) {
  const c = String(rohCode || '').trim();
  if (!c) return false;
  _rolle = 'spieler'; _code = c; _radioAn = false;
  const rc = (k) => { try { radioCb[k] && radioCb[k](); } catch { /* egal */ } };
  radio.starteHoeren(c, {
    onVerbunden: () => { _radioAn = true; ping(); rc('onVerbunden'); },
    onGetrennt: () => { _radioAn = false; ping(); rc('onGetrennt'); },
    onFehler: () => { _radioAn = false; ping(); rc('onFehler'); },
    onReconnectStart: () => { _radioAn = false; ping(); rc('onGetrennt'); },
    onReconnectErfolg: () => { _radioAn = true; ping(); rc('onVerbunden'); },
    onAufgegeben: () => { _radioAn = false; ping(); rc('onGetrennt'); },
  });
  return true;
}

/** Legt einen UI-Ping ueber die Verbindungs-Callbacks des Aufrufers, ohne sie zu ersetzen. */
function wrapPostCb(cb) {
  const w = { ...cb };
  const of = cb.onVerbunden, og = cb.onGetrennt, orc = cb.onReconnectErfolg;
  w.onVerbunden = () => { ping(); try { of && of(); } catch { /* egal */ } };
  w.onGetrennt = () => { ping(); try { og && og(); } catch { /* egal */ } };
  w.onReconnectErfolg = () => { ping(); try { orc && orc(); } catch { /* egal */ } };
  return w;
}

// --- Meister -------------------------------------------------------------

/** Meister-Post unter dem Sitzungscode starten (Radio bleibt optional). Gibt den Code zurueck. */
export function starteMeisterPost(postCb = {}) {
  _rolle = 'meister';
  _code = meisterCode();
  post.starteMeisterPost(_code, postCb);
  ping();
  return _code;
}

/**
 * Meister-Radio unter dem Sitzungscode senden; stellt sicher, dass auch die Post
 * laeuft (wer im Radio ist, hat auch Post). postCb wird nur genutzt, falls die Post
 * noch nicht laeuft. Gibt den Code zurueck.
 */
export function starteMeisterRadio(sendeStrom, radioCb = {}, radioOpts = {}, postCb = {}) {
  _rolle = 'meister';
  _code = meisterCode();
  if (!post.istAktiv()) post.starteMeisterPost(_code, postCb);
  const rc = { ...radioCb };
  const ob = radioCb.onBereit;
  rc.onBereit = () => { _radioAn = true; ping(); try { ob && ob(); } catch { /* egal */ } };
  radio.starteSenden(_code, sendeStrom, rc, radioOpts);
  return _code;
}

/** Nur das Radio beenden (die Post bleibt). */
export function stoppeMeisterRadio() { try { radio.stopp(); } catch { /* egal */ } _radioAn = false; ping(); }

// --- Trennen -------------------------------------------------------------

/** Beide Verbindungen beenden (Post und Radio). */
export function trenne() {
  try { radio.stopp(); } catch { /* egal */ }
  try { post.stopp(); } catch { /* egal */ }
  _rolle = null; _code = null; _name = null; _radioAn = false;
  ping();
}
