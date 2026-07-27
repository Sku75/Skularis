/**
 * Skularis — Editor-Bereich: Familie, Hintergrund und Herkunft
 *
 * Neun freie Zeilen, genau wie in Sephrasto und auf dem Charakterbogen. Dort
 * stehen sie unter der Überschrift "Familie/Hintergrund/Herkunft" ohne eigene
 * Beschriftung; die Beispiele hier sind nur Vorschläge für die Ansage.
 *
 * Nicht zu verwechseln mit den Eigenheiten: die sind eine Regelmechanik und
 * bringen Schicksalspunkte, der Hintergrund ist reine Beschreibung.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { abschnittTitel, infoZeile, aktionZeile, verbindeDetail } from './widgets.js';
import { textFeld } from './assistent-seite.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { HINTERGRUND_ZEILEN, leereZeilen } from '../core/character.js';
import { HINTERGRUND_KURZ, HINTERGRUND_LANG } from './texte.js';

/**
 * @param {HTMLElement} box
 * @returns {{ uebernehmen: () => void, zuruecksetzen: () => void }}
 */
export function hintergrundInhalt(box) {
  const char = editor.getChar();
  if (!Array.isArray(char.hintergrund)) char.hintergrund = leereZeilen(HINTERGRUND_ZEILEN.length);

  const zeilen = [];
  HINTERGRUND_ZEILEN.forEach((beispiel, i) => {
    const feld = textFeld({
      label: `Hintergrund, Zeile ${i + 1}`,
      id: `hintergrund-${i + 1}`,
      wert: char.hintergrund[i] || '',
      hint: beispiel,
    });
    feld.__detail = `Freie Zeile ${i + 1} von ${HINTERGRUND_ZEILEN.length}, ${beispiel}. `
      + `In Sephrasto ist das die Zeile Hintergrund ${i}.`;
    zeilen.push(feld.__eingabe);
    box.appendChild(feld);
  });

  return {
    uebernehmen() {
      zeilen.forEach((el, i) => { char.hintergrund[i] = (el.value || '').trim(); });
    },
    zuruecksetzen() {
      char.hintergrund = leereZeilen(HINTERGRUND_ZEILEN.length);
    },
  };
}

/** Eigener Bildschirm für den freien Editor. */
export function hintergrundScreen() {
  let inhalt = null;

  return {
    title: 'Familie, Hintergrund und Herkunft',
    onBack() { if (inhalt) inhalt.uebernehmen(); return true; },

    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Familie, Hintergrund und Herkunft'));
      wrap.appendChild(infoZeile(HINTERGRUND_KURZ, HINTERGRUND_LANG));

      const box = document.createElement('div');
      inhalt = hintergrundInhalt(box);
      wrap.appendChild(box);

      wrap.appendChild(aktionZeile('Hintergrund übernehmen', () => {
        inhalt.uebernehmen();
        sprache.sage('Hintergrund übernommen.');
      }, 'Eingaben in den Charakter schreiben',
        'Die Eingaben werden auch beim Verlassen der Seite mit Escape übernommen.'));

      wrap.appendChild(aktionZeile('Hintergrund zurücksetzen', async () => {
        if (!await jaNeinDialog({
          titel: 'Hintergrund zurücksetzen',
          frage: 'Alle neun Zeilen wirklich leeren?',
          jaLabel: 'Leeren', neinLabel: 'Behalten',
        })) return;
        inhalt.zuruecksetzen();
        screen.refresh();
        sprache.sage('Hintergrund zurückgesetzt.');
      }, 'alle Zeilen leeren'));

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
