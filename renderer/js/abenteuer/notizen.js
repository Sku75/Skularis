/**
 * Skularistool — Abenteuer-Bereich: Notizen und Tagebuch (ein gemeinsamer Strom).
 *
 * Notizen und Tagebuch-Einträge liegen in einer chronologischen Liste (a.journal)
 * und haben dasselbe Format: Titel + Inhalt. Angezeigt wird "Notiz: Titel" bzw.
 * "Tagebucheintrag N: Titel"; der Inhalt kommt per Shift und Pfeil-runter (und für
 * Sehende im Detailbereich). Tagebuch-Einträge sind fortlaufend nummeriert, damit
 * man das Tagebuch am Ende in Reihenfolge "binden" kann. Neueste stehen oben.
 * Autospeichern.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';
import { meisterpostScreen } from './meisterpost.js';

async function neuerEintrag(typ) {
  const a = getAbenteuer();
  const wort = typ === 'tagebuch' ? 'Tagebuch-Eintrag' : 'Notiz';
  const titel = await textDialog({ titel: wort, label: 'Titel' });
  if (titel === null || !titel.trim()) return;
  const inhalt = await textDialog({ titel: `${wort}: ${titel.trim()}`, label: 'Inhalt', mehrzeilig: true });
  if (inhalt === null) return;
  a.journal.push({ typ, titel: titel.trim(), inhalt: inhalt.trim(), spieltag: a.spieltag });
  await speichere();
  screen.refresh();
  sprache.sage(`${wort} hinzugefügt.`);
}

/**
 * Einen Eintrag in der Liste verschieben. richtung +1 = in der ANZEIGE nach oben
 * (das ist im Array ein höherer Index, weil die Anzeige umgekehrt ist), -1 = nach
 * unten. Gibt true zurück, wenn verschoben wurde.
 */
function verschiebe(a, index, richtung) {
  const ziel = index + richtung;
  if (ziel < 0 || ziel >= a.journal.length) return false;
  const tmp = a.journal[index];
  a.journal[index] = a.journal[ziel];
  a.journal[ziel] = tmp;
  return true;
}

/** Untermenü eines Eintrags: Vorlesen, Bearbeiten, Verschieben, Löschen. */
function eintragMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getAbenteuer();
      const e = a.journal[index];
      if (!e) { screen.pop(); return document.createElement('div'); }
      const wort = e.typ === 'tagebuch' ? 'Tagebucheintrag' : 'Notiz';
      this.title = `${wort}: ${e.titel}`;
      const items = [
        { label: 'Vorlesen', onSelect: () => sprache.sage(`${e.titel}. ${e.inhalt || 'Kein Inhalt.'}`) },
        {
          label: 'Bearbeiten', hint: 'Titel und Inhalt ändern',
          onSelect: async () => {
            const t = await textDialog({ titel: wort, label: 'Titel', wert: e.titel }); if (t === null) return;
            const inh = await textDialog({ titel: wort, label: 'Inhalt', wert: e.inhalt, mehrzeilig: true }); if (inh === null) return;
            e.titel = t.trim(); e.inhalt = inh.trim();
            await speichere(); screen.refresh(); sprache.sage('Gespeichert.');
          },
        },
        {
          label: 'Nach oben verschieben', hint: 'in der Liste eins nach oben',
          onSelect: async () => {
            if (verschiebe(a, index, 1)) { await speichere(); screen.pop(); sprache.sage('Nach oben verschoben.'); }
            else sprache.sage('Schon ganz oben.');
          },
        },
        {
          label: 'Nach unten verschieben', hint: 'in der Liste eins nach unten',
          onSelect: async () => {
            if (verschiebe(a, index, -1)) { await speichere(); screen.pop(); sprache.sage('Nach unten verschoben.'); }
            else sprache.sage('Schon ganz unten.');
          },
        },
        {
          label: 'Löschen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Löschen', frage: `${wort} ${e.titel} löschen?` })) return;
            a.journal.splice(index, 1);
            await speichere(); screen.pop(); sprache.sage('Gelöscht.');
          },
        },
      ];
      return menuScreen({ title: this.title, subtitle: 'Escape zurück.', items }).build();
    },
  };
}

export function notizenScreen() {
  const obj = {
    title: 'Notizen und Tagebuch',
    build() {
      const a = getAbenteuer();
      const items = [];

      // Ganz oben: Meisterpost (über dem Tagebuch).
      const postZahl = (a.posteingang || []).length;
      items.push({
        label: postZahl ? `Meisterpost, ${postZahl} im Posteingang` : 'Meisterpost',
        hint: 'Post versenden und Posteingang',
        onSelect: () => screen.push(meisterpostScreen()),
      });

      items.push({
        label: `Tagebuch-Eintrag hinzufügen, Spieltag ${a.spieltag}`,
        hint: 'Erst Titel, dann Inhalt', onSelect: () => neuerEintrag('tagebuch'),
      });
      items.push({
        label: 'Notiz hinzufügen',
        hint: 'Erst Titel, dann Inhalt', onSelect: () => neuerEintrag('notiz'),
      });

      // Tagebuch-Einträge in Erstell-Reihenfolge durchnummerieren; i = echter Index.
      let tb = 0;
      const nummeriert = a.journal.map((e, i) => {
        const nr = e.typ === 'tagebuch' ? ++tb : null;
        return { e, nr, i };
      });

      // Anzeige neueste zuerst; älteste rutschen nach unten.
      for (const { e, nr, i } of nummeriert.slice().reverse()) {
        const kopf = e.typ === 'tagebuch' ? `Tagebucheintrag ${nr}` : 'Notiz';
        const label = `${kopf}: ${e.titel}`;
        const detail = e.inhalt || 'Kein Inhalt.';
        items.push({ label, detail, hint: 'öffnen: vorlesen, bearbeiten, verschieben, löschen', onSelect: () => screen.push(eintragMenuScreen(i)) });
      }

      return menuScreen({
        title: obj.title,
        subtitle: 'Neueste oben. Shift und Pfeil-runter liest den Inhalt, Eingabetaste liest vor. Escape zurück.',
        items,
        leer: 'Noch keine Einträge.',
      }).build();
    },
  };
  return obj;
}
