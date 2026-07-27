/**
 * Skularistool — Editor-Bereich: Attribute
 * Acht verstellbare Wertzeilen (Pfeil links/rechts) mit Live-EP-Ansage.
 * Darunter zwei Summenzeilen: vergebene Punkte und dafür ausgegebene EP.
 */
import * as editor from './editor.js';
import { wertZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { gesamtEP } from '../core/regeln.js';
import { ATTRIBUTE_KURZ, ATTRIBUTE_LANG } from './texte.js';

/** Die acht Wertzeilen plus Summen in einen Container hängen. */
export function attributeInhalt(box) {
  const char = editor.getChar();
  const db = editor.getDb();

  const punkteSumme = () => Object.values(char.attribute || {}).reduce((s, v) => s + (v || 0), 0);
  const epSumme = () => gesamtEP(char, db).attribute;

  const zeilePunkte = infoZeile('', 'Die Summe aller acht Attributswerte. Sie ist keine Regelgrenze, sondern eine Orientierung.');
  const zeileEP = infoZeile('', 'Erfahrungspunkte, die allein in den Attributen stecken. Was insgesamt noch frei ist, steht in der Überschrift.');

  const summenAktualisieren = () => {
    const werte = [
      [zeilePunkte, `Vergebene Punkte insgesamt: ${punkteSumme()}`],
      [zeileEP, `Ausgegebene Erfahrungspunkte für Attribute: ${epSumme()}`],
    ];
    for (const [zeile, text] of werte) {
      zeile.textContent = text;
      zeile.setAttribute('data-sr-label', text);
      zeile.dataset.srValue = text;
      zeile.setAttribute('aria-label', text);
    }
  };

  for (const a of db.attribute) {
    box.appendChild(wertZeile({
      label: `${a.anzeigename} ${a.name}`,
      get: () => char.attribute[a.name] || 0,
      set: (v) => { char.attribute[a.name] = v; },
      min: 0,
      max: 20,
      onChange: () => { summenAktualisieren(); return editor.epAnsage(); },
      detail: `${a.anzeigename} (${a.name}). Steigerungsfaktor ${a.steigerungsfaktor}.${a.text ? ' ' + a.text : ''}`,
    }));
  }

  box.appendChild(zeilePunkte);
  box.appendChild(zeileEP);
  summenAktualisieren();
}

export function attributeScreen() {
  return {
    title: '',
    build() {
      const frei = editor.aktualisiere();
      this.title = `Attribute, ${frei} EP frei`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Attribute'));
      wrap.appendChild(infoZeile(ATTRIBUTE_KURZ, ATTRIBUTE_LANG));

      const box = document.createElement('div');
      attributeInhalt(box);
      wrap.appendChild(box);

      verbindeDetail(wrap);
      return wrap;
    },
  };
}
