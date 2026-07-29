/**
 * Skularistool — Auswahl aus einer (langen) Liste als eigener Bildschirm.
 * Nutzt das Standard-Menü mit Filter, Detail und Zurück. Ersetzt den früheren
 * Modal-Dialog für Vorteile, Talente, übernatürliche Fertigkeiten, Ausrüstung.
 *
 * onWahl wird aufgerufen, nachdem der Auswahl-Bildschirm bereits geschlossen ist,
 * also wieder auf dem aufrufenden Bereich. Bei Escape passiert nichts.
 */
import * as screen from './screen.js';
import { menuScreen } from './menu-screen.js';

/**
 * @param {object} o
 * @param {string} o.titel
 * @param {Array<{label:string, wert:any, detail?:string|Function}>} o.eintraege
 * @param {(wert:any)=>void} o.onWahl
 */
export function auswahlScreen(o) {
  const items = (o.eintraege || []).map(e => ({
    label: e.label,
    detail: e.detail,
    // Einträge, deren Voraussetzungen fehlen, bekommen eine eigene Farbe.
    // Wählbar bleiben sie, wie in Sephrasto.
    klasse: e.gesperrt ? 'ed-gesperrt' : undefined,
    onSelect: () => { screen.pop(); o.onWahl(e.wert); },
  }));
  // Gibt es gesperrte Einträge (z. B. nicht verfügbare Vorteile), springt Pfeil
  // links und rechts nur zwischen den verfügbaren.
  const hatGesperrte = (o.eintraege || []).some(e => e.gesperrt);
  const hinweis = hatGesperrte
    ? 'Bei langer Liste oben Filtern. Pfeil hoch und runter geht alle durch, Pfeil links und rechts springt nur zu den verfügbaren. Eingabetaste wählt, Shift und Pfeil-runter liest Details, Escape zurück.'
    : 'Bei langer Liste oben Filtern. Eingabetaste wählt, Shift und Pfeil-runter liest Details, Escape zurück.';
  // Gesprochene Tastenhilfe beim Öffnen der Liste.
  const ansage = hatGesperrte
    ? `${o.titel}. Pfeil hoch und runter wechselt die Zeile, Pfeil links und rechts springt zu den verfügbaren Einträgen, Bild auf und Bild ab blättert eine halbe Seite, Eingabetaste wählt.`
    : `${o.titel}. Pfeil hoch und runter wechselt die Zeile, Bild auf und Bild ab blättert eine halbe Seite, Eingabetaste wählt.`;
  screen.push(menuScreen({
    title: o.titel,
    subtitle: hinweis,
    items,
    filter: true,
    leer: 'Keine Einträge.',
    sprungVerfuegbar: hatGesperrte,
    ansage,
  }));
}
