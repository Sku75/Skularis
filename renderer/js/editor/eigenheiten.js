/**
 * Skularis — Editor-Bereich: Eigenheiten
 *
 * Eine Eigenheit besteht aus drei Feldern: der Eigenheit selbst, ihren
 * positiven und ihren negativen Aspekten. Gespeicherte Eigenheiten werden
 * durchbuchstabiert (A, B, C ...) und stehen unter der Erstellung; jede hat
 * einen Löschen-Schalter mit Rückfrage.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { abschnittTitel, infoZeile, aktionZeile, verbindeDetail } from './widgets.js';
import { textFeld } from './assistent-seite.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { eigenheitBuchstabe } from '../core/character.js';
import { bauInfo } from '../core/infotext.js';
import { EIGENHEITEN_KURZ, EIGENHEITEN_LANG } from './texte.js';
import { EIGENHEITEN_VORLAGE } from '../daten/eigenheiten-vorlage.js';

const MINDESTENS = 2;

/** Vollinfo einer Eigenheit, gegliedert nach positiven und negativen Aspekten. */
function beschreibe(e, i) {
  return bauInfo([
    [`Eigenheit ${eigenheitBuchstabe(i)}`, e.name + '.'],
    e.positiv ? ['Positive Aspekte', e.positiv + '.'] : null,
    e.negativ ? ['Negative Aspekte', e.negativ + '.'] : null,
  ].filter(Boolean));
}

/** Tooltip einer Vorlage-Eigenheit: Name, positive und negative Aspekte. */
function vorlageDetail(v) {
  return bauInfo([
    [v.name, 'Beispiel-Eigenheit aus der Vorlage.'],
    ['Positive Aspekte', v.positiv + '.'],
    ['Negative Aspekte', v.negativ + '.'],
  ]);
}

/**
 * Eigenheiten-Erstellung und -Liste in einen Container hängen.
 * @returns {{ uebernehmen: () => void, zuruecksetzen: () => void, pruefe: () => string }}
 */
export function eigenheitenInhalt(box) {
  const char = editor.getChar();
  if (!Array.isArray(char.eigenheiten)) char.eigenheiten = [];

  const fName = textFeld({ label: 'Eigenheit', id: 'eig-name', hint: 'zum Beispiel: Ein Kind der Großstadt' });
  const fPos = textFeld({ label: 'Positive Aspekte', id: 'eig-pos', hint: 'mindestens zwei, mit Komma getrennt' });
  const fNeg = textFeld({ label: 'Negative Aspekte', id: 'eig-neg', hint: 'mindestens zwei, mit Komma getrennt' });

  fName.__detail = 'Der Name der Eigenheit, kurz und einprägsam. Beispiel aus dem Regelwerk: Ein Kind der Großstadt.';
  fPos.__detail = 'Wofür die Eigenheit nützt. Beispiel: kennt jede Gasse und jedes Versteck, taucht in der Menge unter.';
  fNeg.__detail = 'Wo die Eigenheit schadet. Beispiel: verirrt sich rettungslos in der Wildnis, versteht wenig vom Landleben.';

  box.appendChild(fName);
  box.appendChild(fPos);
  box.appendChild(fNeg);

  const leeren = () => { fName.__eingabe.value = ''; fPos.__eingabe.value = ''; fNeg.__eingabe.value = ''; };

  const speichern = () => {
    const name = fName.__eingabe.value.trim();
    if (!name) { sounds.playError(); sprache.sage('Bitte zuerst eine Eigenheit eintragen.'); return false; }
    char.eigenheiten.push({
      name,
      positiv: fPos.__eingabe.value.trim(),
      negativ: fNeg.__eingabe.value.trim(),
    });
    const buchstabe = eigenheitBuchstabe(char.eigenheiten.length - 1);
    leeren();
    screen.refresh();
    sprache.sage(`Eigenheit ${buchstabe} gespeichert, ${name}. Insgesamt ${char.eigenheiten.length} Eigenheiten.`);
    return true;
  };

  box.appendChild(aktionZeile('Eigenheit speichern', speichern,
    'legt die drei Felder als neue Eigenheit ab',
    'Speichert die oben eingetragene Eigenheit. Danach sind die Felder wieder leer für die nächste.'));

  // Eigenheit aus Vorlage: eine durchsuchbare Liste fertiger Beispiele mit
  // positiven und negativen Aspekten, hinzufügbar wie ein Vorteil. Danach steht
  // die Eigenheit ganz normal in der Liste und ist löschbar.
  box.appendChild(aktionZeile('Eigenheit aus Vorlage hinzufügen', () => {
    const haben = new Set(char.eigenheiten.map(e => e.name));
    const eintraege = EIGENHEITEN_VORLAGE.filter(v => !haben.has(v.name)).map(v => ({
      label: v.name,
      wert: v.name,
      detail: vorlageDetail(v),
    }));
    if (eintraege.length === 0) { sounds.playError(); sprache.sage('Alle Vorlage-Eigenheiten sind bereits gewählt.'); return; }
    auswahlScreen({
      titel: 'Eigenheit aus Vorlage wählen',
      eintraege,
      onWahl: (gewaehlt) => {
        const v = EIGENHEITEN_VORLAGE.find(x => x.name === gewaehlt);
        if (!v) return;
        char.eigenheiten.push({ name: v.name, positiv: v.positiv, negativ: v.negativ });
        const buchstabe = eigenheitBuchstabe(char.eigenheiten.length - 1);
        screen.refresh();
        sprache.sage(`Eigenheit ${buchstabe} hinzugefügt, ${v.name}. Positiv: ${v.positiv}. Negativ: ${v.negativ}. Insgesamt ${char.eigenheiten.length} Eigenheiten.`);
      },
    });
  },
    'öffnet eine durchsuchbare Liste mit Beispiel-Eigenheiten zum Auswählen',
    'Fertige Beispiel-Eigenheiten mit positiven und negativen Aspekten. Oben filtern, Shift und Pfeil-runter liest die Aspekte, Eingabetaste fügt hinzu. Danach ist die Eigenheit wie eine selbst erstellte löschbar.'));

  // Bereits gespeicherte Eigenheiten
  if (char.eigenheiten.length === 0) {
    box.appendChild(infoZeile(`Noch keine Eigenheit gespeichert. Es werden mindestens ${MINDESTENS} gebraucht.`));
  } else {
    char.eigenheiten.forEach((e, i) => {
      const b = eigenheitBuchstabe(i);
      box.appendChild(aktionZeile(`${b}, ${e.name}, löschen`, async () => {
        if (!await jaNeinDialog({
          titel: 'Eigenheit entfernen',
          frage: `Eigenheit ${b}, ${e.name}, wirklich entfernen?`,
        })) return;
        char.eigenheiten.splice(i, 1);
        screen.refresh();
        sprache.sage(`Eigenheit ${b} entfernt. Noch ${char.eigenheiten.length} Eigenheiten.`);
      }, 'Eigenheit entfernen', beschreibe(e, i)));
    });
  }

  return {
    /** Ein noch nicht gespeicherter, ausgefüllter Entwurf geht beim Seitenwechsel nicht verloren. */
    uebernehmen() {
      if (fName.__eingabe.value.trim()) speichern();
    },
    zuruecksetzen() {
      char.eigenheiten = [];
      leeren();
    },
    pruefe() {
      return char.eigenheiten.length >= MINDESTENS
        ? ''
        : `Es werden mindestens ${MINDESTENS} Eigenheiten gebraucht, erst ${char.eigenheiten.length} gespeichert.`;
    },
  };
}

/** Eigener Bildschirm für den freien Editor. */
export function eigenheitenScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const anzahl = (char.eigenheiten || []).length;
      this.title = `Eigenheiten, ${anzahl} gespeichert`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Eigenheiten'));
      wrap.appendChild(infoZeile(EIGENHEITEN_KURZ, EIGENHEITEN_LANG));

      const box = document.createElement('div');
      eigenheitenInhalt(box);
      wrap.appendChild(box);

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
