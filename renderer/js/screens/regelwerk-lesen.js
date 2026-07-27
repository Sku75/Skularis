/**
 * Skularis — Original-Ilaris-Regeldokument als lesbare Seite.
 *
 * Die vollständigen Ilaris-Regeln, aus der PDF extrahiert und in Kapitel,
 * Überschriften und Absätze gegliedert (daten/ilaris-regeln.js). Alles steht in
 * einer durchsuchbaren Liste, damit Blinde wie Sehende dieselbe Ansicht nutzen:
 *
 *   Filter oben          Volltextsuche über alle Absätze (Schnellsuche).
 *   Strg und Pfeil       springt zwischen den Überschriften.
 *   Strg und Bild auf/ab springt zwischen den Kapiteln.
 *   Inhaltsverzeichnis   ganz oben: ein Schalter je Kapitel springt sofort hin.
 *
 * Reines Nachschlagen, nichts wird verändert. Dasselbe Menü-Modul (menuScreen)
 * wie überall, damit die Bedienung gleich bleibt.
 */
import { menuScreen } from '../ui/menu-screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { ILARIS } from '../daten/ilaris-regeln.js';

const kapId = (i) => `rk-kap-${i}`;

/** Fokus zu einem Kapitel springen und es ansagen. */
function springeZuKapitel(i, titel) {
  const el = document.getElementById(kapId(i));
  if (!el) { sprache.sage('Kapitel im Filter nicht sichtbar. Erst den Filter aufheben.'); return; }
  el.focus();
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  sounds.playNavigation();
  sprache.sage(`${titel}, Kapitel`);
}

export function regelwerkLesenScreen() {
  const kapitel = ILARIS.kapitel || [];
  const items = [];

  // Inhaltsverzeichnis oben: ein Schalter je Kapitel, springt sofort hin.
  items.push({ label: 'Inhaltsverzeichnis', kapitel: true, onSelect: () => {} });
  kapitel.forEach((k, i) => {
    items.push({
      label: k.titel,
      hint: 'zum Kapitel springen',
      detail: `Springt zum Kapitel ${k.titel}.`,
      onSelect: () => springeZuKapitel(i, k.titel),
    });
  });

  // Der volle Text: Kapitel als Kapitel-Zeile, Abschnitte als Überschrift,
  // Absätze als einzelne Zeilen zum Durchwandern.
  kapitel.forEach((k, i) => {
    items.push({ label: k.titel, kapitel: true, id: kapId(i), onSelect: () => {} });
    for (const abschnitt of k.abschnitte || []) {
      if (abschnitt.titel) items.push({ label: abschnitt.titel, ueberschrift: true, onSelect: () => {} });
      for (const absatz of abschnitt.absaetze || []) {
        items.push({ label: absatz, onSelect: () => {} });
      }
    }
  });

  return menuScreen({
    title: 'Original Ilaris Regeldokument',
    subtitle: 'Die vollständigen Ilaris-Regeln zum Lesen. Filtern oben durchsucht den ganzen Text. '
      + 'Strg und Pfeil hoch oder runter springt zwischen den Überschriften, Strg und Bild auf oder '
      + 'ab zwischen den Kapiteln. Ganz oben das Inhaltsverzeichnis. Escape zurück.',
    items,
    filter: true,
  });
}
