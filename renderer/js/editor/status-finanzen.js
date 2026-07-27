/**
 * Skularis — Editor-Bereich: Status und Finanzen
 *
 * Status wirkt sich regelseitig nur auf die Lebenshaltungskosten aus.
 * Die Finanzen bestimmen Startkapital und Schicksalspunkte; die
 * Schicksalspunkte berechnet die Engine daraus (regeln.js, abgeleiteteWerte).
 *
 * Beide Listen sind Einfachauswahl: der gewählte Eintrag trägt die Ansage
 * "gewählt". Werte werden sofort übernommen, ein OK gibt es bewusst nicht.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { listenSchalter } from './assistent-seite.js';
import { abgeleiteteWerte } from '../core/regeln.js';
import {
  STATUSSE, STATUS_KURZ, STATUS_LANG,
  FINANZEN, FINANZEN_KURZ, FINANZEN_LANG,
} from './texte.js';

export const STATUS_STANDARD = 3;    // Unterschicht
export const FINANZEN_STANDARD = 2;  // Normal

/**
 * Status-Liste in einen Container hängen.
 * @param {Function} [danach] wird nach der Wahl aufgerufen. Im Assistenten geht
 *   es damit direkt eine Seite weiter, genau wie bei Spezies, Kultur und
 *   Profession. Ohne danach bleibt die Seite stehen (freier Editor).
 */
export function statusInhalt(box, filter = '', danach = null) {
  const char = editor.getChar();
  for (const s of STATUSSE) {
    if (filter && !s.name.toLowerCase().includes(filter)) continue;
    box.appendChild(listenSchalter({
      label: s.name,
      hint: s.kurz,
      detail: s.lang,
      gewaehlt: char.status === s.index,
      onSelect: () => {
        char.status = s.index;
        sprache.sage(`Status ${s.name} gewählt.`);
        if (danach) danach(); else screen.refresh();
      },
    }));
  }
}

/** Finanz-Liste in einen Container hängen. Siehe statusInhalt zu danach. */
export function finanzenInhalt(box, filter = '', danach = null) {
  const char = editor.getChar();
  for (const f of FINANZEN) {
    if (filter && !f.name.toLowerCase().includes(filter)) continue;
    box.appendChild(listenSchalter({
      label: f.name,
      hint: `${f.dukaten} Dukaten Startkapital, ${f.schip} Schicksalspunkte${f.standard ? ', Standard' : ''}`,
      detail: `${f.name}. Startkapital ${f.dukaten} Dukaten, ${f.schip} Schicksalspunkte zu Spielbeginn. `
        + 'Von diesem Startkapital bezahlst du deine gesamte Ausrüstung. '
        + 'Schicksalspunkte über dem Maximum von 4 kannst du im Spiel nicht zurückgewinnen.',
      gewaehlt: char.finanzen === f.index,
      onSelect: () => {
        char.finanzen = f.index;
        editor.aktualisiere();
        sprache.sage(`${f.name} gewählt, ${abgeleiteteWerte(char).SchiP} Schicksalspunkte.`);
        if (danach) danach(); else screen.refresh();
      },
    }));
  }
}

/** Eigener Bildschirm für den freien Editor: beides untereinander. */
export function statusFinanzenScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const statusName = (STATUSSE.find(s => s.index === char.status) || {}).name || 'Mittelschicht';
      const finanzName = (FINANZEN.find(f => f.index === char.finanzen) || {}).name || 'Normal';
      this.title = `Status und Finanzen, ${statusName}, ${finanzName}, ${abgeleiteteWerte(char).SchiP} Schicksalspunkte`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';

      wrap.appendChild(abschnittTitel('Status'));
      wrap.appendChild(infoZeile(STATUS_KURZ, STATUS_LANG));
      const s = document.createElement('div');
      statusInhalt(s);
      wrap.appendChild(s);

      wrap.appendChild(abschnittTitel('Finanzen'));
      wrap.appendChild(infoZeile(FINANZEN_KURZ, FINANZEN_LANG));
      const f = document.createElement('div');
      finanzenInhalt(f);
      wrap.appendChild(f);

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
