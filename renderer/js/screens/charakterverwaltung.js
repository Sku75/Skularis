/**
 * Skularistool 0.1 — Charakterverwaltung (Menü)
 */

import * as sprache from '../sprache.js';
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { versteckeEP } from '../ui/ep-anzeige.js';

export function build() {
  versteckeEP(); // Liste ohne geladenen Einzel-Charakter.
  return menuScreen({
    title: 'Charakterverwaltung',
    subtitle: 'Escape kehrt zum Hauptmenü zurück.',
    items: [
      {
        label: 'Meine Charaktere',
        hint: 'Gespeicherte Charaktere ansehen und verwalten',
        onSelect: () => import('./meine-charaktere.js').then(m => m.oeffne()),
      },
      {
        label: 'Neuen Charakter erstellen',
        hint: 'Startet die Charakter-Generierung: assistiert, aus einer Vorlage oder frei. Nach Ilaris Regeln',
        onSelect: () => import('../editor/editor.js')
          .then(m => m.starteNeu())
          .catch(() => sprache.sage('Das Erstellungs-Tool wird gerade gebaut.')),
      },
    ],
  });
}
