/**
 * Skularistool — Abenteuer-Bereich: Inventar.
 * Geldbörse (Dukaten, Silber, Kupfer, verstellbar), Rucksack und am Gürtel
 * (Gegenstände als Text). Alles wird im Abenteuer gepflegt und autogespeichert.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { wertZeile, aktionZeile, infoZeile, abschnittTitel } from '../editor/widgets.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';

const FACH_NAME = { rucksack: 'Rucksack', guertel: 'am Gürtel' };

export function inventarScreen() {
  const a = getAbenteuer();
  const g = (a.inventar && a.inventar.geldboerse) || { dukaten: 0, silber: 0, kupfer: 0 };
  const inv = a.inventar || { rucksack: [], guertel: [] };
  return menuScreen({
    title: 'Inventar',
    subtitle: 'Escape zurück.',
    items: [
      // Der Geldbörse-Menüpunkt zeigt den Inhalt schon optisch: die Münzzahlen zu den Begriffen.
      { label: 'Geldbörse', hint: `${g.dukaten || 0} Dukaten, ${g.silber || 0} Silber, ${g.kupfer || 0} Kupfer`, onSelect: () => screen.push(geldboerseScreen()) },
      { label: 'Rucksack', hint: `${(inv.rucksack || []).length} Gegenstände`, onSelect: () => screen.push(fachScreen('rucksack')) },
      { label: 'Am Gürtel', hint: `${(inv.guertel || []).length} Gegenstände`, onSelect: () => screen.push(fachScreen('guertel')) },
    ],
  });
}

function geldboerseScreen() {
  return {
    title: 'Geldbörse',
    build() {
      const a = getAbenteuer();
      const g = a.inventar.geldboerse;
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Geldbörse'));
      const muenze = (key, name) => wertZeile({
        label: name,
        get: () => g[key] || 0,
        set: (v) => { g[key] = v; },
        min: 0, max: 100000,
        onChange: () => { speichere(); return ''; },
      });
      wrap.appendChild(muenze('dukaten', 'Dukaten'));
      wrap.appendChild(muenze('silber', 'Silber'));
      wrap.appendChild(muenze('kupfer', 'Kupfer'));
      return wrap;
    },
  };
}

function fachScreen(fach) {
  return {
    title: FACH_NAME[fach],
    build() {
      const a = getAbenteuer();
      const liste = a.inventar[fach];
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(FACH_NAME[fach]));

      wrap.appendChild(aktionZeile('Gegenstand hinzufügen', async () => {
        const t = await textDialog({ titel: 'Gegenstand', label: 'Bezeichnung' });
        if (!t || !t.trim()) return;
        if (!await jaNeinDialog({ titel: 'Hinzufügen', frage: `${t.trim()} wirklich hinzufügen?` })) return;
        liste.push(t.trim());
        protokolliere(a, `${t.trim()} in ${FACH_NAME[fach]} gelegt.`);
        await speichere();
        screen.refresh();
        sprache.sage(`${t.trim()} hinzugefügt.`);
      }, 'Freier Text'));

      if (liste.length === 0) {
        wrap.appendChild(infoZeile('Noch nichts hier.'));
      } else {
        for (const g of [...liste]) {
          wrap.appendChild(aktionZeile(`${g}, entfernen`, async () => {
            if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${g} wirklich entfernen?` })) return;
            a.inventar[fach] = liste.filter(x => x !== g);
            protokolliere(a, `${g} aus ${FACH_NAME[fach]} entfernt.`);
            await speichere();
            screen.refresh();
            sprache.sage(`${g} entfernt.`);
          }, 'Entfernen'));
        }
      }
      return wrap;
    },
  };
}
