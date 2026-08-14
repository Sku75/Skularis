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
  const kandidaten = liste.filter(c => !haben.has(c.pfad));
  if (!kandidaten.length) { sprache.sage('Alle vorhandenen Charaktere sind schon in der Gruppe.'); return; }
  // Hinter jeden Namen die Gesamt-EP (jede Datei kurz einlesen).
  let db2 = null; try { db2 = await ladeDb(); } catch { db2 = null; }
  const eintraege = [];
  for (const c of kandidaten) {
    let ep2 = 0;
    if (db2) { try { const res = await ipc.dateiDirektLaden(c.pfad); const p = parse(res.inhalt, db2); ep2 = ep(p); } catch { /* Name ohne EP */ } }
    eintraege.push({ label: `${c.name}, ${ep2} EP`, wert: c.pfad, detail: 'Diesen Helden zur Gruppe hinzufuegen.' });
  }

  // Nach der Wahl EINE Ebene zurueck in die Gruppenliste (Nutzerwunsch): so sieht
  // man sofort, wer dabei ist. Fuer einen weiteren Helden neu hineingehen. Darum
  // hier KEIN bleibt:true; der Auswahl-Bildschirm schliesst sich nach der Wahl.
  auswahlScreen({
    titel: 'Held zur Gruppe hinzufuegen',
    eintraege,
    onWahl: async (pfad) => {
      try {
        const db = await ladeDb();
        const res = await ipc.dateiDirektLaden(pfad);
        const bogen = parse(res.inhalt, db);
        const name = bogen.name || String(pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
        a.charaktere.push({ name, pfad, bogen });
        protokolliere(a, `Held ${name} zur Gruppe hinzugefuegt.`);
        await speichere();
        sounds.playSpeichern(); // wie beim Charakter-Speichern, nicht der schrille Öffnen-Ton
        // Auswahl-Bildschirm ist bereits geschlossen; jetzt die Gruppenliste frisch
        // zeichnen, damit der neue Held direkt in der Liste steht.
        screen.refresh();
        sprache.sage(`${name} ist jetzt in der Gruppe. ${a.charaktere.length} Helden.`);
      } catch (e) {
        console.error('Charakter laden:', e);
        sprache.sage('Charakter konnte nicht geladen werden.');
      }
    },
  });
}

/** Gesamt-EP eines Bogens (0, wenn nicht vorhanden). */
function ep(bogen) { return (bogen && bogen.erfahrung && bogen.erfahrung.gesamt) || 0; }

/** Gruppenzusammenstellung: Reiter je Charakter (mit EP), unten Charakter hinzufuegen
 *  und „Nach Charakterupdate suchen" (gesendeten Bogen laden, ersetzen/annehmen). */
export function gruppenzusammenstellungScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Gruppenzusammenstellung, ${a.charaktere.length} Helden`;
      const items = a.charaktere.map((c, i) => ({
        id: `held-${i}`,
        label: `${c.name}, ${ep(c.bogen)} EP`,
        hint: 'oeffnen: Bogen ansehen oder entfernen',
        onSelect: () => screen.push(heldScreen(i)),
      }));
      items.push({
        label: 'Charakter hinzufuegen',
        hint: 'Spielerbogen aus der Bibliothek laden',
        onSelect: () => charakterHinzufuegen(),
      });
      items.push({
        label: 'Nach Charakterupdate suchen',
        hint: 'Den vom Spieler genannten 4-stelligen Code eingeben; danach waehlst du, welchen Bogen er ersetzt, oder nimmst ihn neu auf',
        onSelect: () => import('./spielerinfos.js')
          .then(m => m.starteGruppenUpdate())
          .catch((e) => { console.error('Update-Modul:', e); sprache.sage('Konnte nicht geladen werden.'); }),
      });
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet einen Helden. Charakter hinzufuegen laedt einen Bogen, Nach Charakterupdate suchen laedt einen gesendeten Bogen. Escape zurueck.',
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
        label: `${c.name}, ${ep(c.bogen)} EP`,
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
