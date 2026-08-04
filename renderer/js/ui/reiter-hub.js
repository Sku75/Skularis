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
import * as reiterTasten from './reiter-tasten.js';
import { comboAusEvent } from '../shortcuts.js';

let _aktiv = null;
let _listenerInstalliert = false;

function installiereListener() {
  if (_listenerInstalliert) return;
  _listenerInstalliert = true;
  document.addEventListener('keydown', (e) => {
    if (!_aktiv) return;
    // Strg/Alt lassen wir dem System. Shift ist erlaubt: Shift+F-Taste springt
    // zum Reiter, aber FRISCH am ersten Menuepunkt (die gemerkte Stelle wird
    // verworfen). Ohne Shift kommt man an die zuletzt verlassene Stelle zurueck.
    if (e.ctrlKey || e.altKey) return;
    // Reiter-Nummer + „frisch" (oben) bestimmen. Fuer Abenteuer-/Meistertisch aus
    // der umbelegbaren Konfiguration (reiter-tasten.js), sonst (z. B. Editor-Hub)
    // das feste Schema F<n> bzw. Shift+F<n>.
    let ziel = null;
    if (_aktiv.bereich && reiterTasten.istBereich(_aktiv.bereich)) {
      const combo = comboAusEvent(e);
      if (combo) ziel = reiterTasten.lookup(_aktiv.bereich, combo);
    } else {
      const m = /^F(\d{1,2})$/.exec(e.key);
      if (m) ziel = { nr: parseInt(m[1], 10), frisch: e.shiftKey };
    }
    if (!ziel) return;
    // Nur solange der Hub wirklich offen ist (Anker liegt im Stapel).
    if (!screen.imStack(_aktiv.anker)) { _aktiv = null; return; }
    // Bei offenem Dialog nichts abfangen.
    if (document.querySelector('dialog[open]')) return;
    // Reiter-Nummer ueber die Zuordnung in den Array-Index (Aktionen uebersprungen).
    const idx = _aktiv.fTaste ? _aktiv.fTaste[ziel.nr] : (ziel.nr - 1);
    if (idx == null || idx < 0 || idx >= _aktiv.punkte.length) return;
    e.preventDefault();
    e.stopPropagation();
    _aktiv.aktiviere(idx, { frisch: ziel.frisch });
  }, true);
}

/** Nach einem F-Tasten-Wechsel: Fenstername, dann das fokussierte Feld ansagen. */
function ansageWechsel() {
  const cur = screen.current();
  const fenster = (cur && cur.title) || '';
  const el = document.activeElement;
  let feld = '';
  if (el) {
    feld = el.getAttribute('aria-label')
      || (el.querySelector && el.querySelector('.db-menu__label')?.textContent)
      || (el.textContent || '').trim().split('\n')[0]
      || '';
  }
  const text = [fenster, feld].filter(Boolean).join('. ');
  if (text) sprache.sage(text);
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
  // F-Tasten NUR fuer Bildschirmwechsel (Punkte mit factory). Aktionen wie
  // Speichern/Spieltag-Abschluss bekommen keine F-Taste, bleiben aber per
  // Eingabetaste erreichbar. fTaste bildet die F-Nummer auf den Array-Index ab,
  // weil die Nummerierung jetzt Aktionen ueberspringt.
  //
  // Ein Punkt darf eine feste Taste verlangen (festeTaste: 12) — dann bekommt er
  // immer diese Nummer (z. B. Audio auf F12 an beiden Tischen); die uebrigen
  // Bildschirme fuellen die restlichen Nummern auf und ueberspringen die festen.
  const fTaste = {};
  const punkteRaw = o.punkte || [];
  const fest = new Set();
  punkteRaw.forEach((p, i) => {
    if (typeof p.factory === 'function' && Number.isInteger(p.festeTaste)
      && p.festeTaste >= 1 && p.festeTaste <= 12 && !fest.has(p.festeTaste)) {
      fest.add(p.festeTaste); fTaste[p.festeTaste] = i;
    }
  });
  let fn = 0;
  const naechsteFreie = () => { do { fn += 1; } while (fn <= 12 && fest.has(fn)); return fn; };
  const punkte = punkteRaw.map((p, i) => {
    const istBildschirm = typeof p.factory === 'function';
    let taste = '';
    if (Number.isInteger(p.festeTaste) && fTaste[p.festeTaste] === i) {
      taste = `F${p.festeTaste}`;
    } else if (istBildschirm) {
      const nr = naechsteFreie();
      if (nr <= 12) { taste = `F${nr}`; fTaste[nr] = i; }
    }
    return { ...p, taste };
  });

  let _aktiverIndex = null;
  const aktiviere = (i, opts = {}) => {
    const p = punkte[i];
    if (!p) return;
    if (typeof p.aktion === 'function') { try { p.aktion(); } catch (e) { console.error('Hub-Aktion:', e); } return; }
    if (typeof p.factory !== 'function') return;
    // Tiefe Position (Segment) des noch aktiven Reiters sichern — nur wenn wir
    // wirklich auf einem Reiter stehen (Segment ueber dem Anker nicht leer).
    if (_aktiverIndex != null && _aktiverIndex !== i) {
      const seg = screen.segmentUeberAnker(anker);
      if (seg.length) punkte[_aktiverIndex].segment = seg;
    }
    let segment;
    if (opts.frisch || !p.segment) {
      // Ueber das Hub-Menue mit Enter: frisch am Anfang (oben) starten.
      p.screen = p.factory();
      p.segment = [p.screen];
      segment = p.segment;
    } else {
      // Per F-Taste: zurueck an die zuletzt verlassene Stelle.
      segment = p.segment;
    }
    _aktiverIndex = i;
    screen.reiterSegmentZeigen(anker, segment);
    // Nach dem Wechsel zuerst den Fensternamen ansagen, dann das Feld, auf dem
    // der Fokus steht. Kurze Verzoegerung, bis der Fokus gesetzt ist.
    setTimeout(ansageWechsel, 150);
  };

  // Titel darf eine Funktion sein (z. B. fuer eine Live-Anzeige wie die freien EP).
  const titelText = () => (typeof o.titel === 'function' ? o.titel() : o.titel);

  const anker = {
    title: titelText(),
    _hubAnker: true,
    build() {
      anker.title = titelText();
      const items = punkte.map((p, i) => {
        // Die F-Taste gehoert INS Label, damit sie beim Fokus mit angesagt wird
        // ("Charakterstatus, F2"). Der uebrige Hinweis bleibt nur optisch (hint).
        return {
          label: p.taste ? `${p.label}, ${p.taste}` : p.label,
          hint: p.hint || '',
          detail: p.detail,
          klasse: p.klasse,
          ergebnisId: p.ergebnisId,
          // Ueber das Hub-Menue mit Enter: frisch am Anfang starten (Punkt 10).
          onSelect: () => aktiviere(i, { frisch: true }),
        };
      });
      return menuScreen({
        title: anker.title,
        subtitle: o.subtitle || 'Mit F1 bis F12 direkt zum Menue springen. Escape verlaesst den Bereich.',
        items,
        filter: false,
      }).build();
    },
    onShow() {
      sprache.sage('Mit den F-Tasten springst du direkt zwischen den Menues.');
    },
    // Escape auf der Hub-Ebene: optionale Abfrage vor dem Verlassen.
    // o.beimVerlassen liefert 'ja' | 'nein' | 'abbrechen'. Bei ja/nein wird der
    // Bereich verlassen (zurueck bis zum Einstieg, nicht in ein Zwischenmenue);
    // bei abbrechen bleibt man im Hub. onBack gibt immer false zurueck, weil die
    // Navigation hier selbst erledigt wird (kein zusaetzliches einzelnes pop).
    async onBack() {
      let ent = 'ja';
      if (typeof o.beimVerlassen === 'function') {
        try { ent = await o.beimVerlassen(); } catch (e) { console.error('beimVerlassen:', e); ent = 'ja'; }
      }
      if (ent === 'abbrechen') return false;
      verlasseZumEinstieg();
      return false;
    },
  };

  function verlasseZumEinstieg() {
    _aktiv = null;
    if (o.zurueckAuf && screen.imStack(o.zurueckAuf)) screen.zurueckBis(o.zurueckAuf);
    else screen.entferneAb(anker);
  }

  _aktiv = { anker, punkte, aktiviere, fTaste, bereich: o.bereich };
  installiereListener();
  if (o.ersetzen) screen.replace(anker); else screen.push(anker);
  return {
    anker,
    aktiviere,
    /** Hub ganz verlassen: zurueck bis zum Einstieg (oder Anker entfernen). */
    verlasse() { verlasseZumEinstieg(); },
  };
}

/** Ist gerade ein Reiter-Hub offen (Anker liegt im Stapel)? */
export function hubAktiv() {
  return Boolean(_aktiv && screen.imStack(_aktiv.anker));
}

/** Den gerade offenen Hub verlassen (falls einer offen ist). */
export function verlasseAktiven() {
  if (_aktiv) { const a = _aktiv.anker; _aktiv = null; screen.entferneAb(a); }
}
