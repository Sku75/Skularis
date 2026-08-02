/**
 * Skularistool — Meistertisch: Zufalls-Namensgenerator.
 *
 * Ablauf: "Neu erwürfeln" fragt Spezies, Kultur und Geschlecht ab (die zuletzt
 * gewählte Option steht jeweils oben, sodass man mit Enter durchbestätigen und
 * schnell einen neuen Namen erhalten kann). Das Ergebnis wird oben in die Liste
 * gestellt, der Fokus landet darauf; nach oben kommt man wieder auf
 * "Neu erwürfeln". Auf einem Ergebnis öffnet Enter ein Menü: NPC-Karte erstellen,
 * Notiz erstellen, löschen.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog, jaNeinDialog, textDialog } from '../ui/dialog.js';
import { getMeister, speichere } from './state.js';
import { leererStatblock, protokolliere } from '../core/meister-abenteuer.js';
import { SPEZIES, KULTUREN, wuerfleName } from '../daten/namen-daten.js';

// Zuletzt gewählte Optionen merken — so kann man beim nächsten Start mit Enter
// durchbestätigen und bekommt sofort einen neuen Namen derselben Herkunft.
const zuletzt = { spezies: 'Mensch', kultur: 'Mittelreich', geschlecht: 'maennlich' };

function ergebnisse(a) { return a.namensErgebnisse || (a.namensErgebnisse = []); }

/** Eine Liste zu Auswahl-Einträgen machen, mit dem zuletzt Gewählten zuoberst. */
function ordne(liste, zuerst) {
  const rest = liste.filter(x => x !== zuerst);
  const geordnet = liste.includes(zuerst) ? [zuerst, ...rest] : liste.slice();
  return geordnet.map(x => ({ label: x, wert: x }));
}

async function neuErwuerfeln() {
  // Reine Schaltflächen-Auswahl (kein Tippfilter, kein Abbrechen-Knopf) — Escape
  // bricht ab. Zuletzt Gewähltes steht oben, damit man mit Enter durchkommt.
  const spezies = await knopfDialog({ titel: 'Spezies wählen', knoepfe: ordne(SPEZIES, zuletzt.spezies) });
  if (spezies === null) return null;
  zuletzt.spezies = spezies;
  const kultur = await knopfDialog({ titel: 'Kultur wählen', knoepfe: ordne(KULTUREN, zuletzt.kultur) });
  if (kultur === null) return null;
  zuletzt.kultur = kultur;
  const geschEintraege = [
    { label: 'männlich', wert: 'maennlich' },
    { label: 'weiblich', wert: 'weiblich' },
  ];
  if (zuletzt.geschlecht === 'weiblich') geschEintraege.reverse();
  const geschlecht = await knopfDialog({ titel: 'Geschlecht wählen', knoepfe: geschEintraege });
  if (geschlecht === null) return null;
  zuletzt.geschlecht = geschlecht;
  sounds.playWuerfel();
  return { name: wuerfleName(spezies, kultur, geschlecht), spezies, kultur, geschlecht };
}

export function namensgeneratorScreen() {
  return {
    title: 'Name erwürfeln',
    build() {
      const a = getMeister();
      const liste = ergebnisse(a);
      this.title = `Name erwürfeln, ${liste.length} Ergebnisse`;
      const items = [];
      items.push({
        label: 'Neu erwürfeln',
        hint: 'Spezies, Kultur und Geschlecht wählen, dann kommt ein Name',
        onSelect: async () => {
          const r = await neuErwuerfeln();
          if (!r) return;
          liste.unshift(r);
          await speichere();
          // Fokus auf das neue, oberste Ergebnis; Pfeil hoch führt auf "Neu erwürfeln".
          screen.refresh('#namensergebnis-0');
          sprache.sage(r.name);
        },
      });
      liste.forEach((r, i) => {
        items.push({
          id: `namensergebnis-${i}`,
          label: r.name,
          hint: `${r.spezies}, ${r.kultur}, ${r.geschlecht === 'weiblich' ? 'weiblich' : 'männlich'}`,
          onSelect: () => screen.push(ergebnisMenuScreen(i)),
        });
      });
      return menuScreen({
        title: this.title,
        subtitle: 'Neu erwürfeln oben, darunter die bisherigen Namen. Enter auf einem Namen öffnet das Menü. Escape zurück.',
        items,
        leer: 'Noch keine Namen erwürfelt. Oben Neu erwürfeln wählen.',
      }).build();
    },
    onShow() { sprache.sage('Name erwürfeln. Enter auf Neu erwürfeln startet die Auswahl.'); },
  };
}

function ergebnisMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const r = ergebnisse(a)[index];
      if (!r) { screen.pop(); return document.createElement('div'); }
      this.title = r.name;
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück.',
        items: [
          {
            label: 'NPC-Karte erstellen',
            hint: 'legt einen freundlichen NPC mit diesem Namen an',
            onSelect: async () => {
              const sb = leererStatblock(a);
              sb.name = r.name;
              (a.freundlicheNsc || (a.freundlicheNsc = [])).push(sb);
              protokolliere(a, `NPC ${sb.name} aus dem Namensgenerator angelegt.`);
              await speichere();
              sounds.playOeffnen();
              sprache.sage(`NPC ${sb.name} angelegt. Du findest ihn unter Freundliche NPC.`);
            },
          },
          {
            label: 'Notiz erstellen',
            hint: 'legt eine Meister-Notiz mit diesem Namen an',
            onSelect: async () => {
              const text = await textDialog({ titel: 'Notiz', label: `Notiz zu ${r.name}`, wert: r.name });
              if (text === null) return;
              (a.meisterNotizen || (a.meisterNotizen = [])).push({ titel: r.name, inhalt: text.trim(), spieltag: a.spieltag });
              await speichere();
              sprache.sage('Notiz gespeichert.');
            },
          },
          {
            label: 'Löschen',
            hint: 'entfernt diesen Namen aus der Liste',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Löschen', frage: `Name ${r.name} löschen?` })) return;
              ergebnisse(a).splice(index, 1);
              await speichere();
              screen.pop();
              sprache.sage('Geloescht.');
            },
          },
        ],
      }).build();
    },
  };
}
