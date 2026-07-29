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
import { regelNotation } from '../core/regelnotation.js';

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

// Eine kurze, satzlose Zeile ist wahrscheinlich eine Tabellenzelle aus der PDF.
function istZelle(s) {
  const t = String(s == null ? '' : s).trim();
  return t.length > 0 && t.length <= 16 && !/[.!?:"]$/.test(t);
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
      const abs = abschnitt.absaetze || [];
      let p = 0;
      while (p < abs.length) {
        // Aus der PDF zerfallen Tabellen in viele kurze Zellen. Ein Lauf von
        // mindestens drei kurzen, satzlosen Zeilen wird als Tabelle erkannt und
        // mit einem erklärenden Satz eingerahmt, damit man ihn Zeile für Zeile
        // liest und weiß, dass es eine Tabelle ist. Die Zellen bleiben erhalten.
        if (istZelle(abs[p])) {
          let e = p;
          while (e < abs.length && istZelle(abs[e])) e++;
          if (e - p >= 3) {
            items.push({ label: `Es folgt eine Tabelle mit ${e - p} Feldern, Zeile für Zeile lesbar.`, ueberschrift: true, onSelect: () => {} });
            for (let t = p; t < e; t++) {
              const zt = regelNotation(abs[t]);
              items.push({ label: zt, detail: zt, onSelect: () => {} });
            }
            items.push({ label: 'Ende der Tabelle.', ueberschrift: true, onSelect: () => {} });
            p = e;
            continue;
          }
        }
        // Normaler Absatz. Zeichen als Wörter ausschreiben (VT-2-BE wird
        // "VT minus 2 minus BE"). Der Absatz ist zugleich sein Detail: Shift und
        // Pfeil-runter liest ihn Satz für Satz (zuZeilen zerlegt in Sätze).
        const txt = regelNotation(abs[p]);
        items.push({ label: txt, detail: txt, onSelect: () => {} });
        p++;
      }
    }
  });

  return menuScreen({
    title: 'Original Ilaris Regeldokument',
    subtitle: 'Die vollständigen Ilaris-Regeln zum Lesen. Filtern oben durchsucht den ganzen Text. '
      + 'Shift und Pfeil-runter liest den Absatz Satz für Satz. Bild auf und Bild ab blättert eine halbe Seite. '
      + 'Strg und Pfeil hoch oder runter springt zwischen den Überschriften, Strg und Bild auf oder '
      + 'ab zwischen den Kapiteln. Ganz oben das Inhaltsverzeichnis. Escape zurück.',
    items,
    filter: true,
  });
}
