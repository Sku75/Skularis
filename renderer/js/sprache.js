/**
 * Skularis — Screenreader-Ansagen (aria-live)
 * Ersetzt gui/sprache.py: statt accessible_output2 werden
 * aria-live-Regionen im DOM befuellt.
 * NVDA/JAWS lesen diese automatisch vor.
 */

import * as einstellungen from './daten/einstellungen.js';

let _an = true;
let _gesperrt = false;
let _warteschlange = [];

// Roemische -> Arabische Ziffern (fuer TTS)
const ROEMISCH_MAP = {
  XVIII:18, XVII:17, XVI:16, XIV:14, XIII:13, XII:12, XIX:19,
  XI:11, XV:15, XX:20, VIII:8, VII:7, VI:6, IV:4, IX:9,
  III:3, II:2, X:10, V:5, I:1,
};
const ROEMISCH_RE = /(?<!\+)\b(XVIII|XVII|XVI|XIV|XIII|XII|XIX|XI|XV|XX|VIII|VII|VI|IV|IX|III|II|X|V|I)\b/g;

function romanZuArabisch(text) {
  if (!text) return text;
  return text.replace(ROEMISCH_RE, m => String(ROEMISCH_MAP[m]));
}

function sonderzeichenErsetzen(text) {
  if (!text) return text;
  text = text.replace(/\+/g, ' plus ');
  text = text.replace(/(?<![a-zA-ZäöüÄÖÜß])-|-(?![a-zA-ZäöüÄÖÜß])/g, ' minus ');
  text = text.replace(/ +/g, ' ');
  return text.trim();
}

function _aufbereiten(text) {
  text = romanZuArabisch(String(text));
  text = sonderzeichenErsetzen(text);
  return text;
}

export async function init() {
  _an = await einstellungen.get('sprache_an') !== false;
}

export function istAn() {
  return _an;
}

export function setAn(b) {
  _an = Boolean(b);
  einstellungen.setWert('sprache_an', _an);
}

/**
 * Warteschlange sperren — verhindert, dass FocusIn-Events
 * wichtige Ansagen unterbrechen (wie in Python: warteschlange_start/ende).
 */
export function warteschlangeStart() {
  _gesperrt = true;
  _warteschlange = [];
}

export function warteschlangeEnde() {
  _gesperrt = false;
  if (_warteschlange.length > 0) {
    sage(_warteschlange.join('. '));
    _warteschlange = [];
  }
}

/**
 * Zweimal denselben Text in eine aria-live-Region schreiben liest NVDA oft nicht
 * erneut vor. Ein unsichtbares, bei jedem Aufruf wechselndes Zeichen am Ende
 * erzwingt eine echte Änderung, damit jede Ansage wirklich gesprochen wird —
 * auch dieselbe Zeile ein zweites Mal (Tooltip erneut öffnen, Zeile nach einem
 * Anschlag noch einmal vorlesen). Das Zeichen (schmales Leerzeichen) ist stumm.
 */
let _wechsel = false;
let _letzterText = '';
let _letzteZeit = -100000;
const DUBLETTE_MS = 150;
const _pendingRaf = {};
function ansagen(elId, text) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Dublette verschlucken: Beim Anspringen eines Elements sagen oft zwei Wege
  // denselben Text fast gleichzeitig an (Pfeil-Ansage plus Fokus-Ansage, teils
  // in verschiedenen Regionen). Innerhalb eines kurzen Fensters nur einmal
  // sprechen. Gewollte Wiederholungen kommen spaeter und bleiben erhalten.
  const jetzt = (typeof performance !== 'undefined' ? performance.now() : 0);
  if (text === _letzterText && (jetzt - _letzteZeit) < DUBLETTE_MS) return;
  _letzterText = text;
  _letzteZeit = jetzt;
  _wechsel = !_wechsel;
  const marker = _wechsel ? ' ' : '';
  el.textContent = '';
  // Mehrere Ansagen im SELBEN Frame (Bildschirm-Titel + onShow-Ansage +
  // Aktions-Rueckmeldung nach screen.refresh) zu EINER zusammenfassen: die letzte
  // gewinnt. So liest NVDA beim Oeffnen/Auffrischen nicht Titel UND Ansage getrennt.
  if (_pendingRaf[elId]) cancelAnimationFrame(_pendingRaf[elId]);
  _pendingRaf[elId] = requestAnimationFrame(() => { _pendingRaf[elId] = 0; el.textContent = text + marker; });
}

/**
 * Assertive Ansage — unterbricht laufende Rede.
 * Entspricht sprache.sage() in Python.
 */
export function sage(text) {
  if (!_an || !text) return;
  text = _aufbereiten(text);
  // Wenn gesperrt: in Warteschlange einreihen statt sofort ansagen
  if (_gesperrt) { _warteschlange.push(text); return; }
  ansagen('sr-live', text);
}

/**
 * Polite Ansage — reiht sich ein.
 * Entspricht sprache.sage_zusatz() in Python.
 */
export function sageZusatz(text) {
  if (!_an || !text) return;
  ansagen('sr-polite', _aufbereiten(text));
}

/**
 * Status-Ansage (polite, fuer Statusleiste).
 */
export function sageStatus(text) {
  if (!_an || !text) return;
  ansagen('sr-status', _aufbereiten(text));
}

/**
 * Erzeugt einen Beschreibungstext fuer ein focussierbares Element.
 * Ersetzt sprache.beschreibe(widget) in Python.
 */
export function beschreibe(element) {
  if (!element) return '';

  const label = element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.textContent?.trim()
    || '';

  const role = element.getAttribute('role') || element.tagName.toLowerCase();

  const parts = [];

  if (element.tagName === 'BUTTON' || role === 'button') {
    parts.push('Schalter');
  }

  parts.push(label);

  if (element.tagName === 'INPUT') {
    const typ = element.type;
    if (typ === 'range') {
      parts.push(`Schieberegler, Wert ${element.value}`);
    } else if (typ === 'checkbox') {
      parts.push(element.checked ? 'aktiviert' : 'nicht aktiviert');
    } else if (typ === 'number') {
      parts.push(`Zahleneingabe, Wert ${element.value}`);
    } else {
      parts.push('Eingabefeld');
      if (element.value) parts.push(element.value);
    }
  } else if (element.tagName === 'SELECT') {
    const opt = element.options[element.selectedIndex];
    parts.push(`Auswahlliste, ${opt ? opt.textContent : ''}`);
  } else if (element.tagName === 'TEXTAREA') {
    parts.push('Mehrzeiliges Textfeld');
  } else if (role === 'tab') {
    const selected = element.getAttribute('aria-selected') === 'true';
    parts.push(selected ? 'Reiter, ausgewählt' : 'Reiter');
    const shortcut = element.getAttribute('aria-keyshortcuts');
    if (shortcut) parts.push(shortcut);
  }

  if (element.disabled) parts.push('deaktiviert');

  return parts.filter(Boolean).join(', ');
}

/**
 * Gibt den Beschreibungstext einer Zeile zurueck (wie sageZeile, aber ohne Ansage).
 */
export function getZeilenText(element) {
  if (!element) return '';
  // Buttons: immer eigenstaendig beschreiben, nie als Teil der Zeile
  if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') {
    return beschreibe(element);
  }
  const row = element.closest('.db-row');
  if (!row) return beschreibe(element);
  // Trägt die Zeile selbst einen sauberen Vorlese-Text (data-sr-label), diesen
  // nehmen — er ist frei von rein optischer Deko wie den Plus/Minus-Knöpfen, die
  // im rohen textContent stünden.
  const eigen = row.getAttribute('data-sr-label') || row.getAttribute('data-sr-value');
  if (eigen && eigen.trim()) return eigen.trim();
  const parts = [];
  row.querySelectorAll('[data-sr-label], [data-sr-value]').forEach(el => {
    // Buttons ueberspringen — werden eigenstaendig angesagt
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return;
    const text = el.getAttribute('data-sr-label')
      || el.getAttribute('data-sr-value')
      || el.textContent?.trim();
    if (text) parts.push(text);
  });
  return parts.length ? parts.join(', ') : beschreibe(element);
}

/**
 * Liest eine komplette Zeile (.db-row) vor.
 */
export function sageZeile(element) {
  const text = getZeilenText(element);
  if (text) sage(text);
}

/**
 * NVDA liest ein fokussiertes Element selbst vor. Fokussierbare Text- und
 * Wertzeilen (div) bekommen dabei bewusst KEINEN eigenen Objektnamen per
 * aria-label: ein gesetzter Name macht die Zeile fuer NVDA zu einem benannten
 * "Abschnitt" und wird ZUSAETZLICH zum sichtbaren Zeileninhalt vorgelesen — man
 * hoert den Text also doppelt ("Inhalt" und "Inhalt, Abschnitt"). Ohne aria-label
 * liest NVDA nur den sichtbaren Inhalt der Zeile, also genau einmal. Rein optische
 * Teile (Plus/Minus-Knoepfe) sind per aria-hidden ohnehin aus dem Namen genommen.
 * Schalter, Eingabefelder und Auswahllisten tragen ihren Namen selbst und bleiben
 * unangetastet.
 */
export function benenneFuerFokus(element) {
  if (!element) return;
  const tag = element.tagName;
  // Echte Widgets tragen ihren Namen selbst und werden nie doppelt gelesen.
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  // Im Textbetrachter (Lesemodus) bleiben die Zeilen normaler Text.
  if (element.closest && element.closest('[data-lesemodus="1"]')) return;
  // Die fokussierbare Zeile wie einen Menuepunkt aufbauen: EXPLIZITER Name plus
  // Schalter-Rolle. Nur mit aria-label liest NVDA den Namen genau EINMAL und steigt
  // nicht zusaetzlich in den Text-Inhalt ab.
  //
  // WICHTIG: den Namen aus dem SAUBEREN Text bestimmen (data-sr-label, sonst ein
  // bewusst gesetzter aria-label, sonst der sichtbare Textinhalt) — NIEMALS ueber
  // getZeilenText/beschreibe, denn sobald die Zeile role="button" hat, stellt
  // beschreibe das Wort "Schalter" voran; das wuerde sich bei jedem erneuten Fokus
  // erneut davorhaengen ("Schalter, Schalter, ... Inhalt").
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const row = (element.closest && element.closest('.db-row')) || element;
  let text = norm(row.getAttribute('data-sr-label')) || norm(row.getAttribute('data-sr-value'));
  if (!text) {
    // Zusammengesetzte Zeile: eigene data-sr-Zellen aneinanderhaengen (ohne Schalter).
    const parts = [];
    row.querySelectorAll('[data-sr-label], [data-sr-value]').forEach(el => {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return;
      const t = norm(el.getAttribute('data-sr-label') || el.getAttribute('data-sr-value'));
      if (t) parts.push(t);
    });
    text = parts.length ? parts.join(', ') : (norm(element.getAttribute('aria-label')) || norm(row.textContent));
  }
  if (text) element.setAttribute('aria-label', text);
  element.setAttribute('role', 'button');
}
