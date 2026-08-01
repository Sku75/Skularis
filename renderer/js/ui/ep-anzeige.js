/**
 * Skularis — feste EP-Anzeige unten mittig.
 *
 * Zeigt "Erfahrungspunkte x von y" gut sichtbar, wenn GENAU EIN Charakter geladen
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
 * Dargestellt als "Erfahrungspunkte frei von gesamt frei".
 */
export function zeigeEP(frei, gesamt) {
  const b = box();
  if (!b) return;
  b.textContent = `Erfahrungspunkte ${frei} von ${gesamt} frei`;
  b.classList.add('sichtbar');
}

/**
 * Die bereits sichtbare EP-Anzeige auf den neuesten Stand bringen — OHNE sie neu
 * einzublenden. Wird nach jeder EP-Neuberechnung gerufen, damit die Erstattung
 * (Rueckkauf, Entfernen, Zuruecksetzen) immer sofort und ueberall sichtbar ist,
 * nicht nur in der Sprachansage. Ist die Anzeige gerade ausgeblendet
 * (Hauptmenue, Meistertisch), passiert nichts.
 */
export function aktualisiereEP(frei, gesamt) {
  const b = box();
  if (b && b.classList.contains('sichtbar')) {
    b.textContent = `Erfahrungspunkte ${frei} von ${gesamt} frei`;
  }
}

/** EP-Anzeige ausblenden (Hauptmenü, Meistertisch, keine Charakterauswahl). */
export function versteckeEP() {
  const b = box();
  if (b) { b.classList.remove('sichtbar'); b.textContent = ''; }
}
