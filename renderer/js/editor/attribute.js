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

  // Energien (AsP/KaP/GuP) hier bei den anderen Werten steigern — nur, wenn ein
  // Vorteil (Zauberer/Geweiht/Paktierer) einen Grundwert verleiht. Jeder zugekaufte
  // Punkt kostet nach Steigerungsfaktor eins (der n-te n EP); nur die Zukäufe zählen.
  const ENERGIE_NAME = { AsP: 'Astralpunkte', KaP: 'Karmapunkte', GuP: 'Gunstpunkte' };
  const energien = Object.entries(char.energien || {}).filter(([, e]) => (e.basis || 0) > 0);
  if (energien.length) {
    box.appendChild(abschnittTitel('Energien'));
    for (const [ename, e] of energien) {
      const name = ENERGIE_NAME[ename] || ename;
      const basis = e.basis || 0;
      const mod = e.mod || 0;
      box.appendChild(wertZeile({
        label: `${name}, Grundwert ${basis}`,
        get: () => e.gekauft || 0,
        set: (v) => { e.gekauft = v; },
        min: 0,
        max: 999,
        suffix: () => `zusätzlich, gesamt ${basis + mod + (e.gekauft || 0)}`,
        onChange: () => editor.epAnsage(),
        detail: () => {
          const g = e.gekauft || 0;
          const kosten = g * (g + 1) / 2;
          return `${name}. Grundwert aus Vorteilen ${basis}${mod ? `, Aufschlag ${mod}` : ''}, `
            + `zugekauft ${g}, gesamt ${basis + mod + g}. `
            + `Der nächste Punkt kostet ${g + 1} EP; die ${g} zugekauften kosten zusammen ${kosten} EP. `
            + 'Steigerungsfaktor eins.';
        },
      }));

      // Direkt unter den Astralpunkten: NUR ANZEIGE des Magierstab-Astralspeichers
      // und der Zauberspeicher. Beides kommt jetzt ueber Vorteile und ist im Editor
      // nicht mehr verstellbar (Magierstab Astralspeicher = fest 32 AsP; Magierstab
      // Zauberspeicher 1/2). Laden und Wirken der Zauber geschieht im Spiel.
      if (ename === 'AsP') {
        const hatV = (n) => (char.vorteile || []).some(x => (typeof x === 'string' ? x : x.name) === n);
        if (hatV('Magierstab Astralspeicher') || (char.astralspeicherStab || 0) > 0) {
          box.appendChild(infoZeile(`Astralspeicher Stab: ${char.astralspeicherStab || 0}`,
            'Astralspeicher im Magierstab, fester Wert ueber den Vorteil "Magierstab Astralspeicher" (32 Astralpunkte). Nicht mehr von Hand einstellbar.'));
        }
        const slots = hatV('Magierstab Zauberspeicher 2') ? 2 : (hatV('Magierstab Zauberspeicher 1') ? 1 : 0);
        if (slots > 0) {
          box.appendChild(infoZeile(`Zauberspeicher: ${slots} ${slots === 1 ? 'Slot' : 'Slots'}`,
            'Anzahl der Zauberspeicher im Magierstab (ueber die Vorteile "Magierstab Zauberspeicher 1" und "2"). Zauber laden und wirken geht im Spiel unter Meine Initiative-Phase.'));
        }
      }
    }
  }
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
