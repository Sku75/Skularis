/**
 * Skularistool — Editor-Bereich: Fertigkeiten und Talente
 * Jede Fertigkeit: Links/Rechts ändert den Wert, Eingabetaste öffnet ihre Talente.
 * Maximalwert nach Ilaris: höchstes zugehöriges Attribut + 2.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import { wertZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { fertigkeitBasiswert, fertigkeitProbenwert } from '../core/regeln.js';
import { talentUebersicht, talentGruppen } from './talente.js';

export function fertigkeitenScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const frei = editor.aktualisiere();
      this.title = `Fertigkeiten und Talente, ${frei} EP frei`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Fertigkeiten und Talente'));
      wrap.appendChild(infoZeile(
        'Links und rechts ändern den Fertigkeitswert, Eingabetaste öffnet die Talente.'
      ));

      for (const f of db.fertigkeiten) {
        if (!char.fertigkeiten[f.name]) char.fertigkeiten[f.name] = { wert: 0 };
        const eintrag = char.fertigkeiten[f.name];
        const attrMax = Math.max(0, ...f.attribute.map(a => char.attribute[a] || 0)) + 2;
        const basis = fertigkeitBasiswert(char, f);

        wrap.appendChild(wertZeile({
          label: `${f.name}, Basiswert ${basis}`,
          get: () => eintrag.wert,
          set: (v) => { eintrag.wert = v; },
          min: 0,
          max: Math.max(attrMax, eintrag.wert),
          suffix: () => {
            // Alle vier Werte direkt sichtbar: Basiswert (im Label), Fertigkeitswert
            // (die editierte Zahl), dazu hier live die beiden Probenwerte.
            const fw = eintrag.wert;
            const pwMit = fertigkeitProbenwert(char, f, fw, true);
            const pwOhne = fertigkeitProbenwert(char, f, fw, false);
            const n = talentGruppen(char, db, f.name).gewaehlt.length;
            return `Probenwert mit Talent ${pwMit}, ohne Talent ${pwOhne}${n ? `, ${n} Talente` : ''}`;
          },
          onChange: () => editor.epAnsage(),
          onActivate: () => import('./talente.js').then(m => screen.push(m.talentScreen(f.name, false))),
          // Erst die Übersicht der Talente, dann die Probenrechnung — so hört
          // man zuerst, was die Fertigkeit umfasst, und muss sich nicht durch
          // die Zahlen bis zu den Talenten durcharbeiten.
          detail: () => {
            const b = fertigkeitBasiswert(char, f);
            const fw = eintrag.wert;
            const attrText = f.attribute.map(a => `${a} ${char.attribute[a] || 0}`).join(', ');
            return talentUebersicht(char, db, f.name)
              + ` Probenwert mit passendem Talent ${fertigkeitProbenwert(char, f, fw, true)},`
              + ` ohne Talent ${fertigkeitProbenwert(char, f, fw, false)}.`
              + ` Basiswert ${b}, der gerundete Mittelwert der Attribute ${attrText}.`
              + ` Steigerungsfaktor ${f.steigerungsfaktor}.`;
          },
        }));
      }
      verbindeDetail(wrap);
      return wrap;
    },
  };
}
