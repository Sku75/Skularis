/**
 * Skularis Alpha 0.02.03 — Pfeil-Navigation + Fokus-Containment
 * Portierung der Pfeilsteuerung aus charakter_view.py _nav_pfeil()
 *
 * - Arrow Down/Up: Nächstes/Voriges fokussierbares Element im aktiven Panel
 * - Home/End: Erstes/Letztes Element (außerhalb von Inputs)
 * - Fokus bleibt im aktiven Tab-Panel
 * - Warnton an Panel-Grenzen (kein Wrapping)
 * - Zeile wird bei Fokuswechsel vorgelesen
 * - Textfelder: „markiert"-Ansage bei Selektion
 */

import * as sprache from './sprache.js';
import * as sounds from './sounds.js';

export const FOCUSABLE = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex="0"]',
  'a[href]',
].join(', ');

let _aktivesPanel = null;
let _letzterImPanel = null;

export function init() {
  document.addEventListener('keydown', _onKeyDown);
  // Den zuletzt besuchten Punkt im Bildschirm merken. Von der
  // Barrierefreiheits-Box in der Kopfzeile führt Pfeil hoch/runter dorthin
  // zurück, statt ins Leere zu laufen.
  document.addEventListener('focusin', (e) => {
    if (_aktivesPanel && _aktivesPanel.contains(e.target)) _letzterImPanel = e.target;
  });
}

export function setAktivesPanel(panel) {
  _aktivesPanel = panel;
  _letzterImPanel = null;
}

/**
 * Fokus aus der Kopfzeile (oder aus dem Nichts) zurück in den Bildschirm holen.
 * @returns {boolean} ob ein Ziel gefunden wurde
 */
export function zurueckInsPanel() {
  if (!_aktivesPanel) return false;
  let el = (_letzterImPanel && _aktivesPanel.contains(_letzterImPanel)) ? _letzterImPanel : null;
  if (!el) el = _aktivesPanel.querySelector(FOCUSABLE);
  if (!el) return false;
  _fokussiere(el);
  sounds.playNavigation();
  return true;
}

/**
 * Ein Element fokussieren, sodass NVDA es selbst einmal vorliest. Vorher bekommt
 * eine zusammengesetzte Zeile ihren vollständigen Namen (benenneFuerFokus).
 * KEINE eigene aria-live-Ansage — sonst käme alles doppelt.
 */
function _fokussiere(el) {
  sprache.benenneFuerFokus(el);
  el.focus();
  if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) el.select();
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Ansage für ein fokussiertes Element per aria-live. Wird nur noch beim Anschlag
 * am Listenrand genutzt: dort bewegt sich der Fokus nicht, NVDA liest also nicht
 * von selbst, und die aktuelle Zeile soll trotzdem noch einmal kommen.
 * Textfelder mit selektiertem Text: „Label: Wert, markiert".
 */
function _sageElement(el) {
  if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search') && el.value) {
    const label = el.getAttribute('aria-label') || '';
    sprache.sage(`${label}: ${el.value}, markiert`);
  } else {
    sprache.sageZeile(el);
  }
}

export function fokussiereErstes(container, silent = false) {
  const el = (container || _aktivesPanel)?.querySelector(FOCUSABLE);
  if (el) _fokussiere(el);
  return el || null;
}

export function fokussiereLetztes(container) {
  const alle = (container || _aktivesPanel)?.querySelectorAll(FOCUSABLE);
  if (alle && alle.length > 0) _fokussiere(alle[alle.length - 1]);
}

function _getAlleFokussierbar() {
  if (!_aktivesPanel) return [];
  return Array.from(_aktivesPanel.querySelectorAll(FOCUSABLE));
}

/**
 * Zur nächsten Überschrift im aktiven Bildschirm springen. Überschriften sind
 * fokussierbare Elemente mit data-ueberschrift.
 * @returns {boolean} ob eine gefunden wurde
 */
function zurUeberschrift(richtung) {
  return zurMarkierung(richtung, 'ueberschrift');
}

/** Zum nächsten Kapitel springen (Regeldokument): Elemente mit data-kapitel. */
function zurKapitel(richtung) {
  return zurMarkierung(richtung, 'kapitel');
}

/** Zum nächsten fokussierbaren Element mit dem gegebenen data-Merkmal springen. */
function zurMarkierung(richtung, merkmal) {
  const alle = _getAlleFokussierbar();
  let idx = alle.indexOf(document.activeElement);
  if (idx < 0) idx = richtung > 0 ? -1 : alle.length;
  for (let i = idx + richtung; i >= 0 && i < alle.length; i += richtung) {
    if (alle[i].dataset && alle[i].dataset[merkmal]) {
      _fokussiere(alle[i]);
      sounds.playNavigation();
      return true;
    }
  }
  return false;
}

/** Zum nächsten verfügbaren (nicht gesperrten) Menü-Eintrag springen. */
function zurVerfuegbarem(richtung) {
  const alle = _getAlleFokussierbar();
  let idx = alle.indexOf(document.activeElement);
  if (idx < 0) idx = richtung > 0 ? -1 : alle.length;
  for (let i = idx + richtung; i >= 0 && i < alle.length; i += richtung) {
    const el = alle[i];
    if (el.classList && el.classList.contains('db-menu__item') && !el.classList.contains('ed-gesperrt')) {
      _fokussiere(el);
      sounds.playNavigation();
      return true;
    }
  }
  return false;
}

/** Wie viele Zeilen eine halbe Seite sind (aus Panelhöhe und Zeilenhöhe). */
function halbeSeiteSchritte() {
  if (!_aktivesPanel) return 5;
  const bezug = (_aktivesPanel.contains(document.activeElement) ? document.activeElement : _aktivesPanel.querySelector(FOCUSABLE));
  const rowH = bezug ? Math.max(1, bezug.getBoundingClientRect().height) : 40;
  const viewH = _aktivesPanel.clientHeight || window.innerHeight || 600;
  const sichtbar = Math.max(1, Math.floor(viewH / rowH));
  return Math.max(1, Math.floor(sichtbar / 2));
}

/** Eine halbe Seite in der Liste blättern (Fokus springt um mehrere Zeilen). */
function blaettern(richtung) {
  const alle = _getAlleFokussierbar();
  if (!alle.length) return false;
  let idx = alle.indexOf(document.activeElement);
  if (idx < 0) idx = richtung > 0 ? 0 : alle.length - 1;
  const ziel = Math.max(0, Math.min(alle.length - 1, idx + richtung * halbeSeiteSchritte()));
  if (ziel === idx) return false;
  _fokussiere(alle[ziel]);
  sounds.playNavigation();
  return true;
}

/**
 * Anschlag am Rand einer Liste: leiser Ton, danach die Zeile, auf der man steht,
 * erneut vorlesen. Die kurze Verzögerung sorgt dafür, dass der Ton die Ansage
 * nicht wegdrückt. Gilt in allen Menüs.
 */
function anschlag() {
  sounds.play('grenze');
  const el = document.activeElement;
  setTimeout(() => { if (document.activeElement === el) _sageElement(el); }, 200);
}

function _naechstesElement(richtung) {
  const alle = _getAlleFokussierbar();
  if (alle.length === 0) return null;

  const aktiv = document.activeElement;
  let idx = alle.indexOf(aktiv);

  if (idx < 0) return alle[0];

  idx += richtung;
  if (idx >= alle.length || idx < 0) {
    return null;  // Grenze erreicht — Warnton wird vom Aufrufer gespielt
  }

  return alle[idx];
}

function _istInEingabefeld(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const typ = el.type;
    return typ === 'text' || typ === 'number' || typ === 'search' || typ === 'url' || typ === 'email';
  }
  if (el.contentEditable === 'true') return true;
  return false;
}

function _onKeyDown(e) {
  // Enter funktioniert ÜBERALL — auch in Dialogen, nicht nur im aktiven Panel
  // (In Python: bind_class("Button", "<Return>", e.widget.invoke()))
  if (e.key === 'Enter') {
    // Kam die Eingabetaste aus einem Dialog, hat der Dialog sie schon selbst
    // verarbeitet (und sich dabei oft geschlossen). Dann NICHT zusätzlich das
    // inzwischen fokussierte Hintergrund-Element anklicken — sonst würde z. B.
    // nach dem Erschwernis-Dialog die Probe erneut ausgelöst.
    if (e.target && e.target.closest && e.target.closest('dialog')) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) {
      e.preventDefault();
      el.click();
    }
    return;
  }

  // Pfeil-Navigation nur innerhalb des aktiven Panels
  if (!_aktivesPanel) return;

  // Fokus ausserhalb des Bildschirms? Bei offenem Dialog nicht eingreifen, der
  // bringt seine eigene Steuerung mit. Sonst holen Pfeil hoch/runter, Pos1 und
  // Ende den Fokus zurück in den Bildschirm. Das gilt für die
  // Barrierefreiheits-Box in der Kopfzeile, die man mit Tabulator erreicht und
  // in der die Pfeiltasten sonst wirkungslos wären, und für den Fall, dass der
  // Fokus nach einem Neuaufbau gar nirgends steht.
  // Links und rechts bleiben unangetastet, damit der Lautstärkeregler in der
  // Kopfzeile weiter bedienbar ist.
  if (!_aktivesPanel.contains(document.activeElement)) {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      zurueckInsPanel();
    }
    return;
  }

  // Strg und Pfeil hoch/runter: zur nächsten Überschrift springen. Überschriften
  // sind Zeilen mit data-ueberschrift (z. B. im Charakterbogen). Shift bleibt
  // dem Tooltip vorbehalten und wird hier nicht angefasst.
  if (e.ctrlKey && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    if (_istInEingabefeld(document.activeElement)) return;
    e.preventDefault();
    if (!zurUeberschrift(e.key === 'ArrowDown' ? 1 : -1)) anschlag();
    return;
  }

  // Strg und Bild auf/ab: zwischen Kapiteln springen (Regeldokument).
  if (e.ctrlKey && !e.shiftKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
    if (_istInEingabefeld(document.activeElement)) return;
    e.preventDefault();
    if (!zurKapitel(e.key === 'PageDown' ? 1 : -1)) anschlag();
    return;
  }

  // Bild auf/ab (ohne Strg): eine halbe Seite in der Liste blättern. Gilt in
  // den Menüs, im Regeldokument und im Charakterbogen.
  if (!e.ctrlKey && !e.shiftKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
    if (_istInEingabefeld(document.activeElement)) return;
    e.preventDefault();
    if (!blaettern(e.key === 'PageDown' ? 1 : -1)) anschlag();
    return;
  }

  // Pfeil links/rechts: nur in Listen mit data-sprung-verfuegbar (z. B. die
  // Vorteil-Auswahl) zu den verfügbaren, nicht gesperrten Einträgen springen.
  // Sonst unangetastet lassen, damit Wert-Zeilen (Attribute, Fertigkeiten,
  // Zähler) links und rechts weiter zum Verstellen nutzen.
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const aktiv = document.activeElement;
    const liste = aktiv && aktiv.closest ? aktiv.closest('[data-sprung-verfuegbar]') : null;
    if (liste && !_istInEingabefeld(aktiv)) {
      e.preventDefault();
      if (!zurVerfuegbarem(e.key === 'ArrowRight' ? 1 : -1)) anschlag();
      return;
    }
  }

  // In Textfeldern: Pfeiltasten normal verwenden
  if (_istInEingabefeld(document.activeElement)) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Nur wenn nicht in Textarea (dort braucht man die Pfeile)
      if (document.activeElement.tagName === 'TEXTAREA') return;
    } else {
      return;
    }
  }

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      const el = _naechstesElement(1);
      if (!el) { anschlag(); break; }
      const eingabe = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search');
      _fokussiere(el);
      sounds[eingabe ? 'playEingabeStart' : 'playNavigation']();
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      const el = _naechstesElement(-1);
      if (!el) { anschlag(); break; }
      const eingabe = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search');
      _fokussiere(el);
      sounds[eingabe ? 'playEingabeStart' : 'playNavigation']();
      break;
    }
    case 'Home': {
      if (e.ctrlKey || !_istInEingabefeld(document.activeElement)) {
        e.preventDefault();
        fokussiereErstes();
      }
      break;
    }
    case 'End': {
      if (e.ctrlKey || !_istInEingabefeld(document.activeElement)) {
        e.preventDefault();
        fokussiereLetztes();
      }
      break;
    }
  }
}
