/**
 * Skularistool 0.1 — Bildschirm-Verwaltung (Stapel)
 *
 * Ein "Bildschirm" (screen) ist ein Objekt:
 *   { title: string, build(): HTMLElement, onShow?(el), onBack?() }
 *
 * Bildschirme werden gestapelt: push() legt einen neuen oben auf,
 * pop() (Escape) kehrt zum vorigen zurück. Jeder Bildschirm ist ein
 * role="application"-Panel; die Pfeil-Navigation (navigation.js) hält den
 * Fokus darin. Beim Zeigen wird Titel + fokussiertes Element angesagt.
 *
 * Fokus-Merkung: Beim Verlassen eines Bildschirms (push) wird die Position
 * des aktuell fokussierten Punktes gemerkt. Beim Zurückspringen (pop) landet
 * der Fokus wieder genau dort — nicht am Anfang des Menüs.
 */

import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import * as navigation from '../navigation.js';

let _container = null;
let _fokusTimer = null;
const _stack = [];

export function init(container) {
  _container = container;
}

export function push(screen) {
  // Fokus-Position des Bildschirms merken, den wir verlassen.
  const cur = current();
  if (cur) cur._focusIndex = _aktuellerFokusIndex();
  _stack.push(screen);
  _render({ sound: true, restore: false });
}

export function replace(screen) {
  if (_stack.length === 0) _stack.push(screen);
  else _stack[_stack.length - 1] = screen;
  _render({ sound: true, restore: false });
}

export function reset(screen) {
  _stack.length = 0;
  _stack.push(screen);
  _render({ sound: false, restore: false });
}

export function pop() {
  if (_stack.length <= 1) return false;
  _stack.pop();
  sounds.playSchliessen();
  _render({ sound: false, restore: true });
  return true;
}

/**
 * Zurückgehen mit Wächter. Definiert ein Bildschirm onBack(), wird erst
 * gefragt (z. B. "Charakter wirklich verwerfen?"); nur bei true wird gepoppt.
 * Escape und der sichtbare Zurück-Schalter nutzen beide diesen Weg.
 * @returns {Promise<boolean>} true, wenn tatsächlich zurückgegangen wurde
 */
export async function zurueck() {
  const cur = current();
  if (cur && typeof cur.onBack === 'function') {
    let erlaubt = true;
    try { erlaubt = await cur.onBack(); } catch (e) { console.error('onBack:', e); }
    if (!erlaubt) return false;
  }
  return pop();
}

/** Direkt zum Wurzel-Bildschirm (Hauptmenü) zurück, ein einziges Rendern. */
export function zuWurzel() {
  if (_stack.length <= 1) return;
  _stack.length = 1;
  _render({ sound: false, restore: false });
}

export function tiefe() {
  return _stack.length;
}

export function current() {
  return _stack[_stack.length - 1] || null;
}

/**
 * Aktuellen Bildschirm neu aufbauen (z. B. nach Datenänderung).
 * @param {string} [fokusSelector] Optionaler CSS-Selektor: das passende Element
 *   im neuen Aufbau bekommt den Fokus, statt der gemerkten Listenposition.
 */
export function refresh(fokusSelector) {
  if (_stack.length) {
    const cur = current();
    if (cur) cur._focusIndex = _aktuellerFokusIndex();
    _render({ sound: false, restore: true, fokusSelector });
  }
}

function _aktuellerFokusIndex() {
  const panel = _container && _container.firstElementChild;
  if (!panel) return null;
  const alle = Array.from(panel.querySelectorAll(navigation.FOCUSABLE));
  const idx = alle.indexOf(document.activeElement);
  return idx >= 0 ? idx : null;
}

function _render({ sound, restore, fokusSelector }) {
  const screen = current();
  if (!screen || !_container) return;

  _container.innerHTML = '';
  const el = screen.build();
  el.classList.add('screen');
  // role="application": NVDA liest fokussierte Elemente nicht selbst vor —
  // wir steuern die Ansagen über aria-live. Kein aria-label, damit der Titel
  // nicht zusätzlich zur aria-live-Ansage vorgelesen wird.
  el.setAttribute('role', 'application');
  el.tabIndex = -1;
  _container.appendChild(el);

  navigation.setAktivesPanel(el);

  if (sound) sounds.playTab();

  // Fokusziel bestimmen: bei pop() der gemerkte Punkt, sonst der erste.
  const alle = Array.from(el.querySelectorAll(navigation.FOCUSABLE));
  let ziel = alle[0] || null;
  if (restore && typeof screen._focusIndex === 'number' && alle[screen._focusIndex]) {
    ziel = alle[screen._focusIndex];
  }
  // Ausdrückliches Fokusziel (z. B. "Vorteil hinzufügen" nach dem Hinzufügen)
  // hat Vorrang vor der gemerkten Position.
  if (fokusSelector) {
    const gewuenscht = el.querySelector(fokusSelector);
    if (gewuenscht) ziel = gewuenscht;
  }
  screen._focusIndex = null;

  // Beim Öffnen nur den Titel ansagen. Das fokussierte Element liest NVDA gleich
  // selbst vor (siehe _setzeFokus), sonst käme die erste Zeile doppelt.
  sprache.sage(screen.title);

  if (typeof screen.onShow === 'function') {
    try { screen.onShow(el); } catch (e) { console.error('onShow:', e); }
  }

  // Ein noch offener Fokus-Auftrag von einem vorigen Aufbau wird verworfen.
  // Sonst würde er kurz danach auf ein Element zeigen, das es nicht mehr gibt;
  // der Fokus landete dann auf dem Dokument selbst und die Pfeiltasten waren tot.
  if (_fokusTimer) clearTimeout(_fokusTimer);
  _fokusTimer = setTimeout(() => {
    _fokusTimer = null;
    _setzeFokus(ziel);
  }, 80);
}

/**
 * Fokus sicher setzen. Ist das Ziel inzwischen aus dem Dokument verschwunden
 * (weil zwischenzeitlich neu aufgebaut wurde), wird der erste Punkt des
 * aktuellen Bildschirms genommen. So bleibt der Fokus nie im Nichts hängen.
 */
function _setzeFokus(ziel) {
  const panel = _container && _container.firstElementChild;
  if (!panel) return;

  let el = (ziel && panel.contains(ziel)) ? ziel : panel.querySelector(navigation.FOCUSABLE);
  if (!el) el = panel;

  // Zusammengesetzte Zeilen vollständig benennen, damit NVDA den Fokus einmal
  // und komplett vorliest.
  sprache.benenneFuerFokus(el);
  el.focus();
  if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) el.select();
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  // Letzte Sicherung: hat der Fokus das Panel trotzdem nicht erreicht, das
  // Panel selbst nehmen, damit die Pfeil-Navigation wieder greift.
  if (!panel.contains(document.activeElement)) panel.focus();
}

/** Fokus zurück in den aktuellen Bildschirm holen (siehe navigation.js). */
export function fokusZurueckHolen() {
  _setzeFokus(null);
}
