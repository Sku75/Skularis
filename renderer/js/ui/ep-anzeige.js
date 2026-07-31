/**
 * Skularis — feste EP-Anzeige unten mittig.
 *
 * Zeigt "Abenteuerpunkte x von y" gut sichtbar, wenn GENAU EIN Charakter geladen
 * ist (Editor, Abenteuertisch). Rein optisch für Sehende; Blinde bekommen die EP
 * über die Menüs. Am Meistertisch (mehrere Helden) und im Hauptmenü ausgeblendet.
 */
let _el = null;
function box() {
  if (!_el) _el = document.getElementById('ep-anzeige');
  return _el;
}

/**
 * EP anzeigen. frei = noch verfügbare EP, gesamt = Gesamt-EP.
 * Dargestellt als "Abenteuerpunkte frei von gesamt frei".
 */
export function zeigeEP(frei, gesamt) {
  const b = box();
  if (!b) return;
  b.textContent = `Abenteuerpunkte ${frei} von ${gesamt} frei`;
  b.classList.add('sichtbar');
}

/** EP-Anzeige ausblenden (Hauptmenü, Meistertisch, keine Charakterauswahl). */
export function versteckeEP() {
  const b = box();
  if (b) { b.classList.remove('sichtbar'); b.textContent = ''; }
}
