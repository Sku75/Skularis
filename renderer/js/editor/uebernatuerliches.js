/**
 * Skularis — Editor-Bereich: Übernatürliches (Zauber, Liturgien, Anrufungen)
 *
 * Es gibt hier bewusst kein "Fertigkeit hinzufügen" mehr. Wie in Sephrasto
 * (Charakter.py, checkVoraussetzungen) ergeben sich die übernatürlichen
 * Fertigkeiten allein aus den Vorteilen: wer die Tradition der Gildenmagier
 * kauft, bekommt genau die 20 Fertigkeiten, die dazugehören; fällt die
 * Tradition weg, verschwinden sie wieder, solange nichts daran hängt.
 *
 * Je Fertigkeit: Wert mit Links und Rechts, Talente mit Eingabetaste.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { wertZeile, aktionZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { fertigkeitBasiswert, fertigkeitProbenwert } from '../core/regeln.js';
import { lesbar } from '../core/voraussetzungen.js';
import { talentUebersicht, talentGruppen } from './talente.js';
import { talenteFuer, entferneTalent } from '../core/character.js';

export function uebernatuerlichesScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const frei = editor.aktualisiere();
      const namen = Object.keys(char.uebernatuerlich);
      this.title = `Übernatürliches, ${namen.length} Fertigkeiten, ${frei} EP frei`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Übernatürliches: Zauber, Liturgien, Anrufungen'));

      if (namen.length === 0) {
        wrap.appendChild(infoZeile(
          'Dieser Charakter hat keine übernatürlichen Fertigkeiten. Sie ergeben sich aus den Vorteilen: '
          + 'erst eine Tradition wählen, zum Beispiel Tradition der Gildenmagier eins, dann erscheinen '
          + 'die passenden Fertigkeiten hier von selbst.',
          'Der Vorteil Zauberer allein genügt nicht, er erlaubt nur das Zaubern an sich. Welche Zauber '
          + 'ein Charakter lernen darf, entscheidet die Tradition. Ein Magiedilettant kommt an 17 '
          + 'Fertigkeiten, ein Gildenmagier an 20, ein Rondrageweihter an 4. '
          + 'Die Auswahl triffst du im Bereich Vorteile.',
        ));
        verbindeDetail(wrap);
        return wrap;
      }

      wrap.appendChild(infoZeile(
        `${namen.length} Fertigkeiten aus deinen Traditionen. Links und rechts ändern den Wert, `
        + 'Eingabetaste öffnet die Talente.',
        'Diese Liste wird nicht von Hand gepflegt, sondern folgt deinen Vorteilen — genau wie in '
        + 'Sephrasto. Nimmst du eine Tradition wieder heraus, verschwinden die zugehörigen '
        + 'Fertigkeiten, solange kein Talent und kein gesteigerter Wert daran hängt.',
      ));

      for (const uname of namen) {
        const eintrag = char.uebernatuerlich[uname];
        const udef = db.uebernatByName[uname];
        const attrMax = udef ? Math.max(0, ...udef.attribute.map(a => char.attribute[a] || 0)) + 2 : 20;
        const basis = udef ? fertigkeitBasiswert(char, udef) : 0;

        wrap.appendChild(wertZeile({
          label: `${uname}, Basiswert ${basis}`,
          get: () => eintrag.wert,
          set: (v) => { eintrag.wert = v; },
          min: 0,
          max: Math.max(attrMax, eintrag.wert),
          suffix: () => {
            const n = talentGruppen(char, db, uname).gewaehlt.length;
            return n ? `${n} Talente` : '';
          },
          onChange: () => editor.epAnsage(),
          onActivate: () => import('./talente.js').then(m => screen.push(m.talentScreen(uname, true))),
          // Erst die Übersicht der Talente, dann die Probenrechnung.
          detail: () => {
            if (!udef) return '';
            const b = fertigkeitBasiswert(char, udef);
            const fw = eintrag.wert;
            const attrText = udef.attribute.map(a => `${a} ${char.attribute[a] || 0}`).join(', ');
            return talentUebersicht(char, db, uname)
              + ` Probenwert mit passendem Talent ${fertigkeitProbenwert(char, udef, fw, true)},`
              + ` ohne Talent ${fertigkeitProbenwert(char, udef, fw, false)}.`
              + ` Basiswert ${b}, der gerundete Mittelwert der Attribute ${attrText}.`
              + ` Steigerungsfaktor ${udef.steigerungsfaktor}.`
              + (udef.voraussetzungen ? ` Zugänglich durch: ${lesbar(db, udef.voraussetzungen)}.` : '');
          },
        }));

        // Nur was der Nutzer selbst gesteigert oder gefüllt hat, lässt sich
        // zurücksetzen. Die Fertigkeit selbst gehört zur Tradition.
        const eigene = talenteFuer(char, db, uname)
          .filter(n => !Object.prototype.hasOwnProperty.call(char.geschenkteTalente || {}, n));
        if (eintrag.wert > 0 || eigene.length) {
          wrap.appendChild(aktionZeile(`${uname} zurücksetzen`, async () => {
            if (!await jaNeinDialog({
              titel: 'Zurücksetzen',
              frage: `${uname} auf null setzen und ${eigene.length} Talente entfernen? `
                + 'Talente, die auch zu anderen Fertigkeiten gehören, verschwinden dort ebenfalls.',
            })) return;
            eintrag.wert = 0;
            for (const n of eigene) entferneTalent(char, n);
            const f2 = editor.aktualisiere();
            screen.refresh();
            sprache.sage(`${uname} zurückgesetzt, ${f2} EP frei.`);
          }, 'Wert auf null und Talente entfernen'));
        }
      }

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
