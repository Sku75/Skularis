/**
 * Skularis — feste Würfelanzeige am Abenteuertisch (unten rechts).
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
 * im Charaktereditor, am Tisch ändern sie sich nicht.
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

function male() {
  const b = box();
  if (!b) return;
  b.textContent = '';
  if (!_probe && !_schaden) {
    b.appendChild(zeile('Noch nicht gewürfelt', false));
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
  male();
}

/** Probenergebnis oben eintragen, z. B. "Ergebnis: Triumph 24". */
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
  _probe = null;
  _schaden = null;
}
