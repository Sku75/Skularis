/**
 * Skularis 0.1 — Startbildschirm (Hauptmenü mit 5 Punkten)
 */

import { emit } from '../state.js';
import * as sprache from '../sprache.js';
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { versteckeEP } from '../ui/ep-anzeige.js';

export function build() {
  versteckeEP(); // Im Hauptmenü ist kein einzelner Charakter geladen.
  return menuScreen({
    title: 'Skularis',
    subtitle: 'Hauptmenü — mit Pfeiltasten wählen, Eingabetaste öffnet, Escape zurück.',
    items: [
      {
        label: 'Charakterverwaltung',
        hint: 'Charaktere erstellen, ansehen und verwalten',
        onSelect: () => import('./charakterverwaltung.js').then(m => screen.push(m.build())),
      },
      {
        label: 'Abenteuer-Tisch',
        hint: 'Abenteuer erstellen oder laden, spielen',
        onSelect: () => import('./abenteuer-tisch.js').then(m => m.oeffne())
          .catch(() => sprache.sage('Abenteuer-Tisch wird gerade gebaut.')),
      },
      {
        label: 'Meister-Tisch',
        hint: 'Runde führen, Helden im Blick behalten',
        onSelect: () => import('./meister-tisch.js').then(m => m.oeffne())
          .catch((e) => { console.error('Meister-Tisch:', e); sprache.sage('Meister-Tisch konnte nicht geöffnet werden.'); }),
      },
      {
        label: 'Regeln',
        hint: 'Kurzregelfilter und das ganze Ilaris-Regelwerk',
        detail: 'Zwei Wege zu den Ilaris-Regeln: der Kurzregelfilter zum schnellen Nachschlagen '
          + 'einzelner Regeln und das vollständige Gesamtregelwerk aus der PDF zum Lesen. Dieselben '
          + 'zwei Wege findest du auch im Abenteuertisch und im Meister-Tisch.',
        onSelect: () => Promise.all([import('../core/db-laden.js'), import('./regeln-menu.js')])
          .then(([dbm, m]) => dbm.ladeDb().then(db => screen.push(m.regelnMenuScreen({ db }))))
          .catch((e) => { console.error('Regeln:', e); sprache.sage('Regeln konnten nicht geöffnet werden.'); }),
      },
      {
        label: 'Optionen',
        hint: 'Sound und Schrift einstellen',
        onSelect: () => import('./optionen.js').then(m => screen.push(m.build())),
      },
      {
        label: 'Skularis beenden',
        hint: 'Programm schließen',
        onSelect: () => emit('app-beenden'),
      },
    ],
  });
}
