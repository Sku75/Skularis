/**
 * Skularistool — Auswahl aus einer (langen) Liste als eigener Bildschirm.
 * Nutzt das Standard-Menü mit Filter, Detail und Zurück. Ersetzt den früheren
 * Modal-Dialog für Vorteile, Talente, übernatürliche Fertigkeiten, Ausrüstung.
 *
 * Standard: onWahl wird aufgerufen, nachdem der Auswahl-Bildschirm bereits
 * geschlossen ist (wieder auf dem aufrufenden Bereich). Bei Escape passiert nichts.
 *
 * Mit o.bleibt: true bleibt der Auswahl-Bildschirm nach der Wahl offen (fürs
 * Kaufen mehrerer Dinge hintereinander). Der Fokus rutscht auf den vorherigen
 * Eintrag, die Liste wird frisch aufgebaut (gekaufte Einträge verschwinden, wenn
 * o.eintraege eine Funktion ist). onWahl darf dann NICHT selbst den Bildschirm
 * wechseln (kein screen.pop/refresh) — das erledigt dieser Bildschirm.
 */
import * as screen from './screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from './menu-screen.js';

/**
 * @param {object} o
 * @param {string} o.titel
 * @param {Array<{label,wert,detail?,gesperrt?}>|Function} o.eintraege  Liste oder Funktion, die die Liste liefert
 * @param {(wert:any)=>void} o.onWahl
 * @param {boolean} [o.bleibt]  im Bildschirm bleiben (mehrfach wählen)
 */
export function auswahlScreen(o) {
  const bleibt = !!o.bleibt;
  const holeEintraege = typeof o.eintraege === 'function' ? o.eintraege : () => (o.eintraege || []);

  const scr = {
    title: o.titel,
    _gezeigt: false,
    build() {
      const eintraege = holeEintraege();
      const hatGesperrte = eintraege.some(e => e.gesperrt);
      const items = eintraege.map((e, i) => ({
        id: `wahl-${i}`,
        label: e.label,
        detail: e.detail,
        // Einträge, deren Voraussetzungen fehlen, bekommen eine eigene Farbe.
        // Wählbar bleiben sie, wie in Sephrasto.
        klasse: e.gesperrt ? 'ed-gesperrt' : undefined,
        onSelect: bleibt
          ? async () => {
              await o.onWahl(e.wert);
              // Im Bildschirm bleiben; Fokus auf den vorherigen Eintrag, damit
              // man bequem mehrere Dinge hintereinander wählen kann.
              screen.refresh(i > 0 ? `#wahl-${i - 1}` : undefined);
            }
          : () => { screen.pop(); o.onWahl(e.wert); },
      }));
      const hinweis = hatGesperrte
        ? 'Bei langer Liste oben Filtern. Pfeil hoch und runter geht alle durch, Pfeil links und rechts springt nur zu den verfügbaren. Eingabetaste wählt, Shift und Pfeil-runter liest Details, Escape zurück.'
        : 'Bei langer Liste oben Filtern. Eingabetaste wählt, Shift und Pfeil-runter liest Details, Escape zurück.';
      return menuScreen({
        title: o.titel,
        subtitle: hinweis,
        items,
        filter: true,
        leer: 'Keine Einträge.',
        sprungVerfuegbar: hatGesperrte,
      }).build();
    },
    onShow() {
      // Tastenhilfe nur beim ersten Öffnen ansagen, nicht bei jedem Neuaufbau.
      if (scr._gezeigt) return;
      scr._gezeigt = true;
      const hatGesperrte = holeEintraege().some(e => e.gesperrt);
      sprache.sage(hatGesperrte
        ? `${o.titel}. Pfeil hoch und runter wechselt die Zeile, Pfeil links und rechts springt zu den verfügbaren Einträgen, Bild auf und Bild ab blättert eine halbe Seite, Eingabetaste wählt.`
        : `${o.titel}. Pfeil hoch und runter wechselt die Zeile, Bild auf und Bild ab blättert eine halbe Seite, Eingabetaste wählt.`);
    },
  };
  screen.push(scr);
}
