/**
 * Skularis — Reiter-Hub mit F-Tasten-Navigation.
 *
 * Ein Hub ist ein Menue, dessen Punkte je eine Kurztaste tragen (F1 fuer den
 * ersten Punkt, F2 fuer den zweiten, und so weiter, von oben absteigend). Mit
 * diesen Tasten springt man von ueberall im Hub direkt zum jeweiligen Menue,
 * ohne erst mit Escape zurueck und dann mit Eingabetaste hinein zu muessen.
 * Jeder geoeffnete Reiter behaelt seine letzte Fokusstelle (screen.reiterZeigen).
 *
 * Zwei Arten von Punkten:
 *   - Reiter (mit factory): oeffnet oder wechselt zu einem Untermenue.
 *   - Aktion (mit aktion):  fuehrt sofort etwas aus (z. B. Speichern).
 *
 * Die Ansage eines Punktes lautet: Name, dann Kurztaste, dann Zusatztext.
 */
import * as screen from './screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from './menu-screen.js';

let _aktiv = null;
let _listenerInstalliert = false;

function installiereListener() {
  if (_listenerInstalliert) return;
  _listenerInstalliert = true;
  document.addEventListener('keydown', (e) => {
    if (!_aktiv) return;
    if (e.ctrlKey || e.altKey || e.shiftKey) return;
    const m = /^F(\d{1,2})$/.exec(e.key);
    if (!m) return;
    // Nur solange der Hub wirklich offen ist (Anker liegt im Stapel).
    if (!screen.imStack(_aktiv.anker)) { _aktiv = null; return; }
    // Bei offenem Dialog nichts abfangen.
    if (document.querySelector('dialog[open]')) return;
    const idx = parseInt(m[1], 10) - 1;
    if (idx < 0 || idx >= _aktiv.punkte.length) return;
    e.preventDefault();
    e.stopPropagation();
    _aktiv.aktiviere(idx);
  }, true);
}

/**
 * Hub oeffnen.
 * @param {object} o
 * @param {string} o.titel
 * @param {string} [o.subtitle]
 * @param {Array<{label, hint?, detail?, factory?:()=>object, aktion?:Function}>} o.punkte
 *   Reihenfolge = F-Tasten-Reihenfolge. factory liefert einen Bildschirm
 *   (mit build()); aktion wird sofort ausgefuehrt.
 */
export function oeffneHub(o) {
  // Kurztasten F1 bis F12 von oben; weitere Punkte bleiben ohne Taste.
  const punkte = (o.punkte || []).map((p, i) => ({ ...p, taste: i < 12 ? `F${i + 1}` : '' }));

  const aktiviere = (i) => {
    const p = punkte[i];
    if (!p) return;
    if (typeof p.aktion === 'function') { try { p.aktion(); } catch (e) { console.error('Hub-Aktion:', e); } return; }
    if (typeof p.factory === 'function') {
      if (!p.screen) p.screen = p.factory();
      screen.reiterZeigen(anker, p.screen);
    }
  };

  const anker = {
    title: o.titel,
    _hubAnker: true,
    build() {
      const items = punkte.map((p, i) => {
        // Ansage: Name, dann Kurztaste, dann Zusatztext.
        const teile = [];
        if (p.taste) teile.push(p.taste);
        if (p.hint) teile.push(p.hint);
        return {
          label: p.label,
          hint: teile.join('. '),
          detail: p.detail,
          klasse: p.klasse,
          onSelect: () => aktiviere(i),
        };
      });
      return menuScreen({
        title: o.titel,
        subtitle: o.subtitle || 'Mit F1 bis F12 direkt zum Menue springen. Escape verlaesst den Bereich.',
        items,
        filter: false,
      }).build();
    },
    onShow() {
      sprache.sage('Mit den F-Tasten springst du direkt zwischen den Menues.');
    },
  };

  _aktiv = { anker, punkte, aktiviere };
  installiereListener();
  screen.push(anker);
  return {
    anker,
    aktiviere,
    /** Hub ganz verlassen (Anker und alle Reiter entfernen). */
    verlasse() { _aktiv = null; screen.entferneAb(anker); },
  };
}

/** Den gerade offenen Hub verlassen (falls einer offen ist). */
export function verlasseAktiven() {
  if (_aktiv) { const a = _aktiv.anker; _aktiv = null; screen.entferneAb(a); }
}
