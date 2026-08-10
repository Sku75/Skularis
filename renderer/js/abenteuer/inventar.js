/**
 * Skularistool — Abenteuer-Bereich: Inventar.
 *
 * Der Charakterbogen ist König: Geldbörse und Gegenstände werden DIREKT am
 * Charakter (a.charakter) gepflegt — Münzbörse über char.geldboerse, Gegenstände
 * über die echte Ausrüstungsliste des Bogens (leseInventar/schreibeInventar).
 * Gegenstände tragen M (am Mann) oder R (Rucksack). Waffen und Rüstungen werden
 * zur Übersicht angezeigt; ihr Tragen läuft über die Waffensets/Rüstungssets des
 * Bogens (nicht Angelegtes gilt als im Rucksack). Beim Speichern/Schließen des
 * Abenteuers werden Geldbörse und Gegenstände in die Charakter-.xml zurück-
 * geschrieben (siehe state.js). Während des Spiels sichert speichere() den Stand
 * im Abenteuer-Datensatz.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { aktionZeile, infoZeile, abschnittTitel, wertZeile } from '../editor/widgets.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { protokolliere } from '../core/abenteuer.js';
import { leseInventar, schreibeInventar, ORT_MANN, ORT_RUCKSACK } from '../core/ausruestung.js';
import { getAbenteuer, speichere } from './state.js';

const FACH = { [ORT_MANN]: 'Am Mann', [ORT_RUCKSACK]: 'Rucksack' };

function char() { return getAbenteuer().charakter || {}; }

function geld() {
  const c = char();
  if (!c.geldboerse) c.geldboerse = { dukaten: 0, silber: 0, kupfer: 0 };
  return c.geldboerse;
}

function gegenstaende() { return leseInventar(char()).gegenstaende || []; }

function speichereGegenstaende(liste) {
  const c = char();
  const inv = leseInventar(c);
  schreibeInventar(c, { gegenstaende: liste, waffenSets: inv.waffenSets, ruestungsSets: inv.ruestungsSets });
}

export function inventarScreen() {
  // Als build()-Screen, damit die Vorschau-Hinweise (Dukaten, Anzahl Gegenstände)
  // bei jedem Aufbau — auch beim Zurückkehren aus Geldbörse/Fach — frisch aus dem
  // Charakterbogen gerechnet werden und nie einen alten Wert zeigen.
  return {
    title: 'Inventar',
    build() {
      const g = geld();
      const gg = gegenstaende();
      const amMann = gg.filter(x => x.ort !== ORT_RUCKSACK).length;
      const imRucksack = gg.filter(x => x.ort === ORT_RUCKSACK).length;
      const c = char();
      return menuScreen({
        title: 'Inventar',
        subtitle: 'Vom Charakterbogen. Escape zurück.',
        items: [
          { label: 'Geldbörse', hint: `${g.dukaten || 0} Dukaten, ${g.silber || 0} Silber, ${g.kupfer || 0} Kupfer`, onSelect: () => screen.push(geldboerseScreen()) },
          { label: 'Am Mann', hint: `${amMann} Gegenstände`, onSelect: () => screen.push(fachScreen(ORT_MANN)) },
          { label: 'Rucksack', hint: `${imRucksack} Gegenstände`, onSelect: () => screen.push(fachScreen(ORT_RUCKSACK)) },
          { label: 'Waffen', hint: `${(c.waffen || []).length} Waffen`, onSelect: () => screen.push(objektScreen('Waffen', (char().waffen || []))) },
          { label: 'Rüstungen', hint: `${(c.ruestungen || []).length} Rüstungen`, onSelect: () => screen.push(objektScreen('Rüstungen', (char().ruestungen || []))) },
        ],
      }).build();
    },
  };
}

function geldboerseScreen() {
  return {
    title: 'Geldbörse',
    build() {
      const g = geld();
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

function fachScreen(ort) {
  return {
    title: FACH[ort],
    build() {
      const a = getAbenteuer();
      const alle = gegenstaende();
      const hier = alle.filter(x => (ort === ORT_RUCKSACK ? x.ort === ORT_RUCKSACK : x.ort !== ORT_RUCKSACK));
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(FACH[ort]));

      wrap.appendChild(aktionZeile('Gegenstand hinzufügen', async () => {
        const t = await textDialog({ titel: 'Gegenstand', label: 'Bezeichnung' });
        if (!t || !t.trim()) return;
        if (!await jaNeinDialog({ titel: 'Hinzufügen', frage: `${t.trim()} wirklich hinzufügen?` })) return;
        const liste = gegenstaende();
        liste.push({ text: t.trim(), ort });
        speichereGegenstaende(liste);
        protokolliere(a, `${t.trim()} in ${FACH[ort]} gelegt.`);
        await speichere();
        screen.refresh();
        sprache.sage(`${t.trim()} hinzugefügt.`);
      }, 'Freier Text'));

      if (hier.length === 0) {
        wrap.appendChild(infoZeile('Noch nichts hier.'));
      } else {
        hier.forEach((g, i) => {
          const andererOrt = ort === ORT_RUCKSACK ? ORT_MANN : ORT_RUCKSACK;
          wrap.appendChild(aktionZeile(`${g.text}`, () => screen.push(gegenstandMenu(g, ort, andererOrt)),
            `nach ${FACH[andererOrt]} verschieben oder entfernen`));
        });
      }
      return wrap;
    },
  };
}

function gegenstandMenu(item, ort, andererOrt) {
  return menuScreen({
    title: item.text,
    subtitle: 'Escape zurück.',
    items: [
      {
        label: `Nach ${FACH[andererOrt]} verschieben`,
        onSelect: async () => {
          const a = getAbenteuer();
          const liste = gegenstaende();
          const treffer = liste.find(x => x.text === item.text && x.ort === ort);
          if (treffer) treffer.ort = andererOrt;
          speichereGegenstaende(liste);
          protokolliere(a, `${item.text} nach ${FACH[andererOrt]} verschoben.`);
          await speichere();
          screen.pop();
          screen.refresh();
          sprache.sage(`${item.text} nach ${FACH[andererOrt]} verschoben.`);
        },
      },
      {
        label: 'Entfernen',
        onSelect: async () => {
          if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${item.text} wirklich entfernen?` })) return;
          const a = getAbenteuer();
          let entfernt = false;
          const liste = gegenstaende().filter(x => {
            if (!entfernt && x.text === item.text && x.ort === ort) { entfernt = true; return false; }
            return true;
          });
          speichereGegenstaende(liste);
          protokolliere(a, `${item.text} entfernt.`);
          await speichere();
          screen.pop();
          screen.refresh();
          sprache.sage(`${item.text} entfernt.`);
        },
      },
    ],
  });
}

/** Reine Übersicht (Waffen/Rüstungen) — Tragen läuft über die Sets im Editor. */
function objektScreen(titel, liste) {
  return {
    title: titel,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(titel));
      if (!liste.length) {
        wrap.appendChild(infoZeile('Nichts vorhanden.', 'Waffen und Rüstungen legst du im Editor an; getragen wird über die Sets.'));
      } else {
        for (const o of liste) wrap.appendChild(infoZeile(o.name || String(o), 'Aus dem Charakterbogen. Tragen über die Sets im Editor.'));
      }
      return wrap;
    },
  };
}
