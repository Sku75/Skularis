/**
 * Skularis — feste Würfelanzeige oben rechts (Abenteuertisch und Meistertisch).
 *
 * Bis zu vier Zeilen, immer an derselben Stelle:
 *   1. Ergebnis der letzten Probe
 *   2. die Rechnung dazu
 *   3. Schaden des letzten Schadenswurfs
 *   4. die Rechnung dazu
 *
 * Die beiden Blöcke stehen unabhängig voneinander: Eine neue Probe ersetzt nur
 * die oberen zwei Zeilen, ein neuer Schadenswurf nur die unteren zwei. So bleibt
 * das Probenergebnis lesbar, während der Schaden gewürfelt wird.
 *
 * Rein optisch für Sehende und für Spieler mit Vergrößerungssoftware. Blinde
 * bekommen alles über die Sprachausgabe, deshalb ist die Box im HTML per
 * aria-hidden aus dem Screenreader genommen und nicht fokussierbar.
 *
 * Am Abenteuertisch tritt sie an die Stelle der EP-Anzeige: Punkte verteilt man
 * im Charaktereditor, am Tisch ändern sie sich nicht. Am Meistertisch läuft sie
 * zusätzlich mit — auch der Meister würfelt.
 *
 * Die Box ist genauso breit wie das Info-Fenster und bildet mit ihm eine Spalte
 * auf der rechten Bildschirmseite: seit 1.43 OBEN das Ergebnis, darunter die
 * Erklärung. Solange die Box sichtbar ist, trägt das Wurzelelement die Marke
 * 'wurf-platz'; daran macht das Info-Fenster oben Platz und beginnt erst
 * darunter. So überdecken sich beide nicht, und die Rollleiste bleibt frei.
 */
let _el = null;
let _probe = null;    // { ergebnis, rechnung }
let _schaden = null;  // { ergebnis, rechnung }

function box() {
  if (!_el) _el = document.getElementById('wurf-anzeige');
  return _el;
}

function zeile(text, stark) {
  const d = document.createElement('div');
  d.className = stark ? 'wurf-anzeige__zeile wurf-anzeige__haupt' : 'wurf-anzeige__zeile';
  d.textContent = text;
  return d;
}

/** Der Programmname, groß und mittig — steht in der Box, solange nicht gewürfelt wurde. */
function marke() {
  const d = document.createElement('div');
  d.className = 'wurf-anzeige__marke';
  d.textContent = 'Skularis';
  return d;
}

/**
 * Aus dem Titel einer Probe die Angabe für die Klammer machen.
 *
 * Skularis kennt den Namen schon: "Zauber Kugelblitz", "Attacke Langdolch",
 * "Mut-Probe" oder bei einer Fertigkeit schlicht "Schwimmen". Nur wo das Wort
 * fehlt, das die Art benennt, kommt "Probe" davor.
 */
export function mitProbeWort(titel) {
  const t = String(titel || '').trim();
  if (!t) return 'Probe';
  if (/^(Zauber|Ritual|Attacke|Parade|Angriff|Ausweichen|Schaden|Manöver|Wurf|Probe)\b/i.test(t)) return t;
  if (/-Probe$/i.test(t)) return t;
  return `Probe ${t}`;
}

function male() {
  const b = box();
  if (!b) return;
  b.textContent = '';
  if (!_probe && !_schaden) {
    // Der Rahmen steht von Anfang an. Bis zum ersten Wurf trägt er den
    // Programmnamen, damit die Fläche nicht wie ein Versehen aussieht.
    b.appendChild(marke());
    return;
  }
  if (_probe) {
    b.appendChild(zeile(_probe.ergebnis, true));
    if (_probe.rechnung) b.appendChild(zeile(_probe.rechnung, false));
  }
  if (_schaden) {
    b.appendChild(zeile(_schaden.ergebnis, true));
    if (_schaden.rechnung) b.appendChild(zeile(_schaden.rechnung, false));
  }
}

/** Die Box einblenden (leer, bis der erste Wurf kommt). */
export function zeigeWurfAnzeige() {
  const b = box();
  if (!b) return;
  b.classList.add('sichtbar');
  // Marke fürs Info-Fenster: Es macht oben Platz, solange die Box dort steht.
  document.documentElement.classList.add('wurf-platz');
  male();
}

/** Probenergebnis oben eintragen, z. B. "Würfelergebnis: 24 (Probe Schwimmen)". */
export function zeigeProbenwurf(ergebnis, rechnung) {
  _probe = { ergebnis: String(ergebnis || ''), rechnung: String(rechnung || '') };
  male();
}

/** Schadensergebnis als eigenen Block unter der Probe eintragen. */
export function zeigeSchadenswurf(ergebnis, rechnung) {
  _schaden = { ergebnis: String(ergebnis || ''), rechnung: String(rechnung || '') };
  male();
}

/** Box ausblenden und leeren (beim Verlassen des Tisches). */
export function versteckeWurfAnzeige() {
  const b = box();
  if (b) { b.classList.remove('sichtbar'); b.textContent = ''; }
  document.documentElement.classList.remove('wurf-platz');
  _probe = null;
  _schaden = null;
}
