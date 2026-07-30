/**
 * Skularistool — Meistertisch: Gruppenzusammenstellung und Gruppenboegen.
 *
 * Die Gruppe sind die Charakterboegen der Spieler, die am Meisterabenteuer
 * teilnehmen. Sie werden als Reiter gefuehrt; Charakter hinzufuegen laedt einen
 * Spielerbogen aus der Bibliothek, entfernen nimmt ihn wieder heraus. Die
 * Gruppenboegen zeigen jeden Bogen zum Ansehen (wiederverwendeter Charakterbogen).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { baueCharakterbogen } from '../abenteuer/charakterbogen.js';
import { protokolliere } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';

const ipc = window.skularis?.ipc;

/** Einen Spielerbogen aus der Bibliothek laden und der Gruppe hinzufuegen. */
export async function charakterHinzufuegen() {
  const a = getMeister();
  let liste = [];
  try { liste = await ipc.bibliothekListe(); } catch { liste = []; }
  if (!liste.length) { sprache.sage('Keine Charaktere vorhanden. Erst in der Charakterverwaltung einen Charakter erstellen.'); return; }

  const haben = new Set((a.charaktere || []).map(c => c.pfad));
  const eintraege = liste
    .filter(c => !haben.has(c.pfad))
    .map(c => ({ label: c.name, wert: c.pfad, detail: 'Diesen Helden zur Gruppe hinzufuegen.' }));
  if (!eintraege.length) { sprache.sage('Alle vorhandenen Charaktere sind schon in der Gruppe.'); return; }

  auswahlScreen({
    titel: 'Held zur Gruppe hinzufuegen',
    eintraege,
    bleibt: true,
    onWahl: async (pfad) => {
      try {
        const db = await ladeDb();
        const res = await ipc.dateiDirektLaden(pfad);
        const bogen = parse(res.inhalt, db);
        const name = bogen.name || String(pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
        a.charaktere.push({ name, pfad, bogen });
        protokolliere(a, `Held ${name} zur Gruppe hinzugefuegt.`);
        await speichere();
        sounds.playOeffnen();
        sprache.sage(`${name} ist jetzt in der Gruppe. ${a.charaktere.length} Helden.`);
      } catch (e) {
        console.error('Charakter laden:', e);
        sprache.sage('Charakter konnte nicht geladen werden.');
      }
    },
  });
}

/** Gruppenzusammenstellung: Reiter je Charakter, unten Charakter hinzufuegen. */
export function gruppenzusammenstellungScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Gruppenzusammenstellung, ${a.charaktere.length} Helden`;
      const items = a.charaktere.map((c, i) => ({
        id: `held-${i}`,
        label: c.name,
        hint: 'oeffnen: Bogen ansehen oder entfernen',
        onSelect: () => screen.push(heldScreen(i)),
      }));
      items.push({
        label: 'Charakter hinzufuegen',
        hint: 'Spielerbogen aus der Bibliothek laden',
        onSelect: () => charakterHinzufuegen(),
      });
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet einen Helden. Charakter hinzufuegen laedt einen Bogen. Escape zurueck.',
        items,
        leer: 'Noch keine Helden in der Gruppe.',
      }).build();
    },
  };
}

function heldScreen(index) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const c = a.charaktere[index];
      if (!c) { screen.pop(); return document.createElement('div'); }
      this.title = c.name;
      return menuScreen({
        title: c.name,
        subtitle: 'Escape zurueck zur Gruppe.',
        items: [
          { label: 'Charakterbogen ansehen', onSelect: () => screen.push(baueCharakterbogen(c.bogen, getDb(), `Charakterbogen ${c.name}`)) },
          {
            label: 'Aus der Gruppe entfernen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${c.name} wirklich aus der Gruppe nehmen?` })) return;
              a.charaktere.splice(index, 1);
              protokolliere(a, `Held ${c.name} aus der Gruppe entfernt.`);
              await speichere();
              screen.pop();
              sprache.sage(`${c.name} entfernt.`);
            },
          },
        ],
      }).build();
    },
  };
}

/** Gruppenboegen: jeden Charakterbogen der Gruppe ansehen. */
export function gruppenboegenScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Charakterboegen der Gruppe, ${a.charaktere.length}`;
      const items = a.charaktere.map(c => ({
        label: c.name,
        hint: 'Bogen ansehen',
        onSelect: () => screen.push(baueCharakterbogen(c.bogen, getDb(), `Charakterbogen ${c.name}`)),
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet den Bogen. Escape zurueck.',
        items,
        leer: 'Noch keine Helden in der Gruppe. Erst unter Gruppenzusammenstellung hinzufuegen.',
      }).build();
    },
  };
}
