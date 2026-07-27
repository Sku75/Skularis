/**
 * Skularis 0.1 — Startbildschirm (Hauptmenü mit 5 Punkten)
 */

import { emit } from '../state.js';
import * as sprache from '../sprache.js';
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';

export function build() {
  return menuScreen({
    title: 'Skularis',
    subtitle: 'Hauptmenü — mit Pfeiltasten wählen, Eingabetaste öffnet, Escape zurück.',
    items: [
      {
        label: 'Charakterverwaltung',
        hint: 'Charaktere erstellen, ansehen, importieren und exportieren',
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
        label: 'Regelnachschlagewerk',
        hint: 'Alle Regeln alphabetisch, mit Filter',
        detail: 'Die vollständigen Ilaris-Regeln zum Nachschlagen, ohne dass ein Charakter offen '
          + 'sein muss. Dasselbe Nachschlagewerk findest du auch im Meister-Tisch und während '
          + 'eines Abenteuers, dort jeweils mit Bezug auf die Helden.',
        onSelect: () => Promise.all([import('../core/db-laden.js'), import('./regeln.js')])
          .then(([dbm, m]) => dbm.ladeDb().then(db => screen.push(m.regelnScreen({ db }))))
          .catch((e) => { console.error('Regeln:', e); sprache.sage('Regelnachschlagewerk konnte nicht geöffnet werden.'); }),
      },
      {
        label: 'Original Ilaris Regeldokument, vollständig',
        hint: 'Die komplette Ilaris-PDF als lesbare Seite mit Filter und Kapitelsprung',
        detail: 'Das vollständige Original-Regeldokument von Ilaris, aus der PDF übernommen und '
          + 'zum Lesen aufbereitet. Oben ein Filter für die Volltextsuche, Strg und Pfeil springt '
          + 'zwischen Überschriften, Strg und Bild auf oder ab zwischen Kapiteln, ganz oben das '
          + 'Inhaltsverzeichnis zum sofortigen Springen.',
        onSelect: () => import('./regelwerk-lesen.js').then(m => screen.push(m.regelwerkLesenScreen()))
          .catch((e) => { console.error('Regeldokument:', e); sprache.sage('Regeldokument konnte nicht geöffnet werden.'); }),
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
