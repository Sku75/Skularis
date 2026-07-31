/**
 * Skularis — gemeinsamer Menüpunkt "Regeln".
 *
 * Fasst die beiden Regel-Wege in einem Untermenü zusammen:
 *   - Kurzregelfilter        (regeln.js, alphabetisch mit Filter)
 *   - Gesamtregelwerk Ilaris pdf (regelwerk-lesen.js, der volle PDF-Text)
 *
 * Wird an allen Orten genutzt: Hauptmenü, Abenteuertisch, Meistertisch.
 */
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { regelnScreen } from './regeln.js';

/**
 * @param {object} [o]  wird an den Kurzregelfilter durchgereicht
 * @param {object} o.db
 * @param {object} [o.charakter]  markiert verfügbare Regeln (Abenteuertisch)
 * @param {Array}  [o.helden]     hängt hinter jede Regel, wer sie hat (Meistertisch)
 */
export function regelnMenuScreen(o = {}) {
  return menuScreen({
    title: 'Regeln',
    subtitle: 'Kurzregelfilter oder das ganze Regelwerk. Escape zurück.',
    items: [
      {
        label: 'Kurzregelfilter',
        hint: 'alle Regeln alphabetisch, mit Filter',
        onSelect: () => screen.push(regelnScreen({ ...o, titel: 'Kurzregelfilter' })),
      },
      {
        label: 'Gesamtregelwerk Ilaris pdf',
        hint: 'das vollständige Ilaris-Regelwerk zum Lesen',
        // Lazy geladen: das Regelwerk-Modul zieht den großen PDF-Text nach.
        onSelect: () => import('./regelwerk-lesen.js').then(m => screen.push(m.regelwerkLesenScreen())),
      },
    ],
  });
}
