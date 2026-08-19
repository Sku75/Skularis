/**
 * Skularistool — barrierefreie Editor-Bausteine.
 */
import * as sounds from '../sounds.js';
import * as sprache from '../sprache.js';
import { alsText } from '../core/infotext.js';

/**
 * Verstellbare Wertzeile (Attribut, Fertigkeit, Energie ...).
 * Fokussierbar; Pfeil links/rechts oder Plus/Minus verändert den Wert.
 * Pfeil hoch/runter (navigation.js) wechselt zwischen Zeilen.
 *
 * @param {object} o
 * @param {string} o.label
 * @param {() => number} o.get
 * @param {(v:number) => void} o.set
 * @param {number} o.min
 * @param {number} o.max
 * @param {(v:number, delta:number) => void} [o.onChange]  liefert die Ansage-Zusatzinfo (z. B. EP)
 * @returns {HTMLElement}
 */
export function wertZeile(o) {
  const row = document.createElement('div');
  row.className = 'db-row ed-zeile';
  row.tabIndex = 0;
  if (o.detail !== undefined) row.__detail = o.detail;

  // Sichtbarer Minus-Knopf (links) — auch für Sehende/Maus gut bedienbar.
  // aria-hidden + tabindex -1: die Tastatur-/Screenreader-Bedienung läuft
  // unverändert über die Zeile selbst (Pfeil links/rechts), die Knöpfe sind
  // rein optisch und mit der Maus klickbar.
  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'ed-zeile__stell ed-zeile__stell--minus';
  btnMinus.textContent = '−';
  btnMinus.tabIndex = -1;
  btnMinus.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'ed-zeile__text';

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'ed-zeile__stell ed-zeile__stell--plus';
  btnPlus.textContent = '+';
  btnPlus.tabIndex = -1;
  btnPlus.setAttribute('aria-hidden', 'true');

  row.appendChild(btnMinus);
  row.appendChild(text);
  row.appendChild(btnPlus);

  const render = () => {
    const v = o.get();
    const extra = o.suffix ? (o.suffix() || '') : '';
    const t = `${o.label}: ${v}${extra ? ', ' + extra : ''}`;
    text.textContent = t;
    row.setAttribute('data-sr-label', t);
    row.dataset.srValue = t;
    // KEIN aria-label auf der Zeile: NVDA liest sonst den Namen (aria-label) UND
    // den sichtbaren Inhalt = doppelt. Der Name kommt aus dem sichtbaren Text
    // (die Plus/Minus-Knöpfe sind aria-hidden und zählen nicht mit).
    // Knöpfe optisch sperren, wenn der Rand erreicht ist.
    btnMinus.disabled = v <= o.min;
    btnPlus.disabled = v >= o.max;
    // Detail kann vom Wert abhängen (z. B. Probenwert) → Cache verwerfen
    if (o.detail !== undefined) { row.__detail = o.detail; delete row.__detailText; }
    row.dispatchEvent(new CustomEvent('detail-refresh', { bubbles: true }));
  };
  render();

  // Gemeinsame Verstell-Logik für Tastatur UND die sichtbaren Knöpfe.
  const verstelle = (delta) => {
    const v = o.get();
    const nv = Math.max(o.min, Math.min(o.max, v + delta));
    if (nv === v) {
      // Am Anschlag (kann nicht weiter). Stumme Regler (Lautstaerke) geben den
      // Anschlagklang, sonst der uebliche Fehlerton (ausser o.ohneTon).
      if (o.stumm) sounds.playGrenze();
      else if (!o.ohneTon) sounds.playError();
      return;
    }
    o.set(nv);
    // o.ohneTon: kein Klick beim Verstellen (z. B. bei Lautstaerke-Reglern).
    if (!o.ohneTon) { if (delta > 0) sounds.playWertHoch(); else sounds.playWertRunter(); }
    render();
    const zusatz = o.onChange ? (o.onChange(nv, delta) || '') : '';
    // o.stumm: KEINE Ansage der neuen Position (Lautstaerke); nur am Rand (min/max
    // = 0/100) ein Anschlagklang. Sonst wie bisher: o.nurWert nur die Zahl,
    // andernfalls Label und Wert.
    if (o.stumm) {
      if (nv === o.min || nv === o.max) sounds.playGrenze();
    } else {
      sprache.sage(o.nurWert ? `${nv}` : `${o.label} ${nv}${zusatz ? ', ' + zusatz : ''}`);
    }
  };

  // Maus-Klick auf die Knöpfe: verstellen, ohne der Zeile den Fokus zu stehlen
  // (mousedown verhindern hält den Tastatur-Fokus auf der Zeile).
  const klick = (delta) => (e) => { e.preventDefault(); e.stopPropagation(); row.focus(); verstelle(delta); };
  btnMinus.addEventListener('mousedown', (e) => e.preventDefault());
  btnPlus.addEventListener('mousedown', (e) => e.preventDefault());
  btnMinus.addEventListener('click', klick(-1));
  btnPlus.addEventListener('click', klick(1));

  row.addEventListener('keydown', (e) => {
    // Enter öffnet optional eine Detailebene (z. B. Talente der Fertigkeit)
    if (e.key === 'Enter' && o.onActivate) {
      e.preventDefault();
      e.stopPropagation();
      o.onActivate();
      return;
    }
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === '+') delta = 1;
    else if (e.key === 'ArrowLeft' || e.key === '-') delta = -1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    verstelle(delta);
  });

  row.__render = render;
  return row;
}

/** Reine Info-/Statuszeile (fokussierbar, nur Anzeige). */
export function infoZeile(text, detail) {
  const row = document.createElement('div');
  row.className = 'db-row ed-info';
  row.tabIndex = 0;
  row.textContent = text;
  row.setAttribute('data-sr-label', text);
  row.dataset.srValue = text;
  // Nur-Anzeige: hier kann man nichts auslösen, also soll der Screenreader auch
  // KEIN Rollenwort ("Schalter") anhängen. sprache.benenneFuerFokus unterdrückt
  // es bei data-nur-lesen per aria-roledescription.
  row.dataset.nurLesen = '1';
  // Bewusst KEIN aria-label: der sichtbare Text ist zugleich der Name für NVDA.
  // Ein zusätzlicher aria-label-Name würde als eigener „Abschnitt" ein zweites Mal
  // vorgelesen (siehe sprache.benenneFuerFokus).
  if (detail !== undefined) row.__detail = detail;
  return row;
}

/** Aktionszeile als Schalter. Optionales Detail (Shift+Pfeil-runter / Detailbox). */
export function aktionZeile(label, onSelect, hint, detail) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'db-btn ed-aktion';
  b.textContent = label;
  if (hint) b.setAttribute('aria-label', `${label}. ${hint}`);
  if (detail !== undefined) b.__detail = detail;
  b.addEventListener('click', () => { sounds.playClick(); onSelect(); });
  return b;
}

/**
 * Hängt einen sichtbaren Detailbereich unter einen Wert-Bereich (ed-bereich) und
 * hält ihn beim Fokuswechsel aktuell. So sehen Sehende dieselbe Zusatzinfo, die
 * Blinde per Shift+Pfeil-runter hören (element.__detail). aria-hidden = nur visuell.
 */
export function verbindeDetail(wrap) {
  const box = document.createElement('div');
  box.className = 'ed-detail';
  box.setAttribute('aria-hidden', 'true');
  wrap.appendChild(box);

  // Ein Detail kann ein String oder eine strukturierte Zeilenliste sein; für
  // die sichtbare Detailleiste wird beides zu Text zusammengefasst.
  const aktualisiere = () => {
    const el = document.activeElement;
    if (!el || !wrap.contains(el)) { box.textContent = ''; return; }
    const d = el.__detail;
    if (d === undefined || d === null) { box.textContent = ''; return; }
    if (typeof d === 'function') {
      Promise.resolve().then(() => d()).then((t) => {
        if (document.activeElement === el) box.textContent = alsText(t);
      }).catch(() => { box.textContent = ''; });
      return;
    }
    box.textContent = alsText(d);
  };

  wrap.addEventListener('focusin', aktualisiere);
  wrap.addEventListener('detail-refresh', aktualisiere);
  return box;
}

/** Überschrift eines Abschnitts — nur visuell, NVDA bekommt die Ansage per aria-live. */
export function abschnittTitel(titel) {
  const h = document.createElement('div');
  h.className = 'ed-abschnitt';
  h.setAttribute('aria-hidden', 'true');
  h.textContent = titel;
  return h;
}
