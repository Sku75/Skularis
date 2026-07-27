/**
 * Skularis — Info-Fenster auf der rechten Bildschirmhälfte.
 *
 * Ein gerahmtes Fenster, das sich wie ein Rollo auf- und zurollt. Es dient zwei
 * Zwecken mit demselben Platz und demselben Rahmen:
 *
 *   Tooltip-Modus (Shift halten und Pfeil):
 *     Rollt auf, liest die erste Zeile. Pfeil hoch und runter gehen Zeile für
 *     Zeile, Strg und Pfeil springen zwischen Überschriften. Loslassen von Shift
 *     rollt zu. Nur per Tastatur, für die Maus gesperrt. Für Blinde gedacht,
 *     Sehende können mitlesen. Die Steuerung liegt im Controller (app.js).
 *
 *   Info-Modus (Strg und I oder Doppelklick):
 *     Bleibt offen. Schließen-Schaltfläche oben, Scrollbalken, Mausrad. Mit
 *     Pfeiltasten geht der Zeilenfokus durch, das Fenster scrollt mit. Escape
 *     oder die Schaltfläche schließen.
 *
 * Beide Modi teilen die Zeilenstruktur aus core/infotext.js: eine flache Liste
 * aus Überschriften und Inhaltszeilen.
 */
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { zuZeilen } from '../core/infotext.js';

let _overlay = null;
let _titelEl = null;
let _inhaltEl = null;
let _schliessenEl = null;

let _zeilen = [];
let _index = 0;
let _modus = null;          // 'tooltip' | 'info' | null
let _fokusVorher = null;    // Element, zu dem der Info-Modus zurückkehrt

function baue() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'ii-overlay';
  _overlay.setAttribute('aria-hidden', 'true'); // Ansage läuft über sprache

  const fenster = document.createElement('div');
  fenster.className = 'ii-fenster';

  const kopf = document.createElement('div');
  kopf.className = 'ii-kopf';
  _titelEl = document.createElement('span');
  _titelEl.className = 'ii-titel';
  kopf.appendChild(_titelEl);
  _schliessenEl = document.createElement('button');
  _schliessenEl.type = 'button';
  _schliessenEl.className = 'ii-schliessen';
  _schliessenEl.textContent = 'Schließen';
  _schliessenEl.addEventListener('click', () => schliesse());
  kopf.appendChild(_schliessenEl);
  fenster.appendChild(kopf);

  _inhaltEl = document.createElement('div');
  _inhaltEl.className = 'ii-inhalt';
  _inhaltEl.tabIndex = -1;
  fenster.appendChild(_inhaltEl);

  // Nur im Info-Modus reagiert das Fenster selbst auf Tasten.
  _inhaltEl.addEventListener('keydown', (e) => {
    if (_modus !== 'info') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); weiter(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); weiter(-1); }
    else if (e.key === 'ArrowRight' && e.ctrlKey) { e.preventDefault(); zurUeberschrift(1); }
    else if (e.key === 'ArrowLeft' && e.ctrlKey) { e.preventDefault(); zurUeberschrift(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); schliesse(); }
  });

  _overlay.appendChild(fenster);
  document.body.appendChild(_overlay);
}

function zeichneZeilen() {
  _inhaltEl.innerHTML = '';
  _zeilen.forEach((z, i) => {
    const el = document.createElement('div');
    el.className = 'ii-zeile' + (z.ueberschrift ? ' ii-ueberschrift' : '') + (i === _index ? ' ii-aktuell' : '');
    el.textContent = z.text;
    // Im Info-Modus per Maus anspringbar.
    if (_modus === 'info') {
      el.addEventListener('click', () => { _index = i; markiere(); sage(); });
    }
    _inhaltEl.appendChild(el);
  });
}

function markiere() {
  const alle = _inhaltEl.querySelectorAll('.ii-zeile');
  alle.forEach((el, i) => el.classList.toggle('ii-aktuell', i === _index));
  const aktiv = alle[_index];
  if (aktiv) aktiv.scrollIntoView({ block: 'nearest' });
}

function sage() {
  const z = _zeilen[_index];
  if (!z) return;
  sprache.sage(z.ueberschrift ? `Überschrift: ${z.text}` : z.text);
}

// --- Öffnen und Schließen ------------------------------------------------

function oeffne(titel, detail, modus) {
  baue();
  _zeilen = zuZeilen(detail);
  if (!_zeilen.length) _zeilen = [{ text: 'Keine weiteren Informationen.', ueberschrift: false }];
  _index = 0;
  _modus = modus;
  _titelEl.textContent = titel || 'Information';
  _overlay.classList.toggle('ii-info', modus === 'info');
  _overlay.classList.toggle('ii-tooltip', modus === 'tooltip');
  zeichneZeilen();
  // Aufrollen: erst im nächsten Rahmen die Klasse setzen, damit die Animation greift.
  requestAnimationFrame(() => _overlay.classList.add('ii-auf'));
  sounds.play('buch_auf');
}

/** Tooltip öffnen (Shift-Modus). Liest sofort die erste Zeile. */
export function oeffneTooltip(titel, detail) {
  if (_modus === 'info') return; // Info hat Vorrang
  oeffne(titel, detail, 'tooltip');
  markiere();
  sage();
}

/** Info-Fenster öffnen (Strg und I oder Doppelklick). Bleibt offen. */
export function oeffneInfo(titel, detail) {
  _fokusVorher = document.activeElement;
  oeffne(titel, detail, 'info');
  markiere();
  // Fokus ins Fenster, damit Pfeiltasten und Escape hier wirken.
  setTimeout(() => { _inhaltEl.focus(); sage(); }, 60);
}

/** Fenster schließen (beide Modi). */
export function schliesse() {
  if (!_overlay || !_modus) return;
  _overlay.classList.remove('ii-auf');
  sounds.play('buch_zu');
  const warModus = _modus;
  _modus = null;
  // Nach der Rollo-Animation ganz ausblenden.
  setTimeout(() => { if (!_modus) _overlay.classList.remove('ii-info', 'ii-tooltip'); }, 350);
  // Im Info-Modus den Fokus zurückgeben, den wir übernommen hatten.
  if (warModus === 'info' && _fokusVorher && document.contains(_fokusVorher)) {
    _fokusVorher.focus();
  }
}

/** Nur den Tooltip schließen (Shift losgelassen). */
export function schliesseTooltip() {
  if (_modus === 'tooltip') schliesse();
}

// --- Navigation ----------------------------------------------------------

export function istOffen() { return Boolean(_modus); }
export function imTooltip() { return _modus === 'tooltip'; }

/**
 * Anschlag am Rand: leiser Ton, danach die aktuelle Zeile erneut vorlesen. Die
 * kurze Verzögerung sorgt dafür, dass der Ton die Ansage nicht wegdrückt.
 */
function anschlag() {
  sounds.play('grenze');
  setTimeout(() => sage(), 200);
}

/** Eine Zeile weiter oder zurück. */
export function weiter(schritt) {
  if (!_modus) return;
  const neu = Math.max(0, Math.min(_zeilen.length - 1, _index + schritt));
  if (neu === _index) { anschlag(); return; }
  _index = neu;
  markiere();
  sage();
}

/** Zur nächsten Überschrift in eine Richtung springen. */
export function zurUeberschrift(richtung) {
  if (!_modus) return;
  let i = _index + richtung;
  while (i >= 0 && i < _zeilen.length) {
    if (_zeilen[i].ueberschrift) { _index = i; markiere(); sage(); return; }
    i += richtung;
  }
  anschlag();
}
