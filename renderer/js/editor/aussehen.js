/**
 * Skularis — Editor-Bereich: Aussehen
 *
 * Die Felder sind eins zu eins die von Sephrasto und vom Charakterbogen:
 * sieben beschriftete Einzelfelder (Geschlecht, Geburtsdatum, Größe, Gewicht,
 * Haarfarbe, Augenfarbe, Titel) und darunter sechs freie Zeilen unter der
 * Überschrift Aussehen. Es gibt bewusst keine erfundenen Feldnamen: was hier
 * "Aussehen, Zeile 1" heißt, ist auch in Sephrasto die erste freie Zeile.
 * Die Beispiele stehen nur in der Ansage, nicht in der Datei.
 *
 * aussehenInhalt() hängt die Felder in einen beliebigen Container und liefert
 * uebernehmen() und zuruecksetzen() zurück. So nutzen der Assistent (Speichern
 * beim Seitenwechsel) und der freie Editor denselben Code.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { abschnittTitel, infoZeile, aktionZeile, verbindeDetail } from './widgets.js';
import { textFeld } from './assistent-seite.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { BESCHREIBUNG_FELDER, AUSSEHEN_ZEILEN, leereZeilen } from '../core/character.js';
import { AUSSEHEN_KURZ, AUSSEHEN_LANG } from './texte.js';

/**
 * @param {HTMLElement} box
 * @returns {{ uebernehmen: () => void, zuruecksetzen: () => void }}
 */
export function aussehenInhalt(box) {
  const char = editor.getChar();
  if (!Array.isArray(char.aussehen)) char.aussehen = leereZeilen(AUSSEHEN_ZEILEN.length);
  const eingaben = {};

  for (const f of BESCHREIBUNG_FELDER) {
    const feld = textFeld({ label: f.label, id: `bd-${f.key}`, wert: char[f.key] || '', beispiel: f.hint });
    feld.__detail = `${f.label}.${f.hint ? ' ' + f.hint + '.' : ''} `
      + `Steht in Sephrasto und auf dem Charakterbogen im Feld ${f.ziel}.`;
    eingaben[f.key] = feld.__eingabe;
    box.appendChild(feld);
  }

  box.appendChild(abschnittTitel('Aussehen'));
  box.appendChild(infoZeile(
    'Sechs freie Zeilen. Beschreibe das Aussehen in Stichworten, eine Zeile je Gedanke.',
    'Diese sechs Zeilen sind auch in Sephrasto und auf dem Charakterbogen frei und ohne '
    + 'eigene Beschriftung. Die Beispiele sind nur Vorschläge, du kannst jede Zeile für '
    + 'alles nutzen. Leere Zeilen stören nicht.'
  ));

  const zeilen = [];
  AUSSEHEN_ZEILEN.forEach((beispiel, i) => {
    const feld = textFeld({
      label: `Aussehen, Zeile ${i + 1}`,
      id: `aussehen-${i + 1}`,
      wert: char.aussehen[i] || '',
      beispiel,
    });
    feld.__detail = `Freie Zeile ${i + 1} von ${AUSSEHEN_ZEILEN.length}, ${beispiel}. `
      + `In Sephrasto ist das die Zeile Aussehen ${i + 1}.`;
    zeilen.push(feld.__eingabe);
    box.appendChild(feld);
  });

  return {
    uebernehmen() {
      for (const f of BESCHREIBUNG_FELDER) char[f.key] = (eingaben[f.key]?.value || '').trim();
      zeilen.forEach((el, i) => { char.aussehen[i] = (el.value || '').trim(); });
    },
    zuruecksetzen() {
      for (const f of BESCHREIBUNG_FELDER) char[f.key] = '';
      char.aussehen = leereZeilen(AUSSEHEN_ZEILEN.length);
    },
  };
}

/** Eigener Bildschirm für den freien Editor. */
export function aussehenScreen() {
  let inhalt = null;

  return {
    title: 'Aussehen',
    onBack() { if (inhalt) inhalt.uebernehmen(); return true; },

    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Aussehen'));
      wrap.appendChild(infoZeile(AUSSEHEN_KURZ, AUSSEHEN_LANG));

      const box = document.createElement('div');
      inhalt = aussehenInhalt(box);
      wrap.appendChild(box);

      wrap.appendChild(aktionZeile('Aussehen übernehmen', () => {
        inhalt.uebernehmen();
        sprache.sage('Aussehen übernommen.');
      }, 'Eingaben in den Charakter schreiben',
        'Die Eingaben werden auch beim Verlassen der Seite mit Escape übernommen.'));

      wrap.appendChild(aktionZeile('Aussehen zurücksetzen', async () => {
        if (!await jaNeinDialog({
          titel: 'Aussehen zurücksetzen',
          frage: 'Alle Felder des Aussehens wirklich leeren?',
          jaLabel: 'Leeren', neinLabel: 'Behalten',
        })) return;
        inhalt.zuruecksetzen();
        screen.refresh();
        sprache.sage('Aussehen zurückgesetzt.');
      }, 'alle Felder leeren'));

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
