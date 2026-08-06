/**
 * Skularistool — Meistertisch: Meister-Notizen (geheim) und Vorlesetexte.
 *
 * Meister-Notizen sind nur fuer den Spielleiter. Vorlesetexte sind zum Vorlesen
 * gedacht und haben eine eigene Vorlesen-Schaltflaeche, damit beides nie
 * durcheinandergeraet.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getMeister, speichere } from './state.js';
import { zufallstabellenScreen } from './zufallstabellen.js';
import { namensgeneratorScreen } from './namensgenerator.js';
import { texteScreen } from './texte.js';

/**
 * Meister-Notizen und Werkzeuge. Als F7/F8 zweimal im Hub (slot 1 und 2), damit
 * man zwei unabhaengige Arbeitsflaechen hat. Ganz oben steckt der Abenteuertexte-
 * Leser drin — mit slot-eigenem Ordner, sodass F7 und F8 verschiedene Ordner
 * gleichzeitig offen haben koennen. Das spart einen Punkt im Hauptmenue.
 */
export function meisterNotizenScreen(slot = 1) {
  return {
    title: slot === 2 ? 'Meistertexte 2' : 'Meistertexte 1',
    build() {
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Abenteuertexte', hint: 'txt-Dokumente aus einem Ordner lesen (eigener Ordner je Menue)', onSelect: () => screen.push(texteScreen(slot)) },
          { label: 'Zufallstabellen', hint: 'Namen, Geruechte, Wetter, Beute wuerfeln', onSelect: () => screen.push(zufallstabellenScreen()) },
          { label: 'Name erwuerfeln', hint: 'Vor- und Nachnamen nach Spezies, Kultur, Geschlecht', onSelect: () => screen.push(namensgeneratorScreen()) },
        ],
      }).build();
    },
  };
}

function listeScreen(feld, einzeln, vorlesen) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const arr = a[feld] || (a[feld] = []);
      this.title = `${einzeln}e, ${arr.length}`;
      const items = [];
      // Das Hinzufuegen-Feld bleibt oben; die Eintraege stehen durchnummeriert
      // darunter, neueste zuerst, so wie im Tagebuch.
      items.push({
        label: `${einzeln} hinzufuegen`,
        onSelect: async () => {
          const titel = await textDialog({ titel: einzeln, label: 'Titel' });
          if (titel === null || !titel.trim()) return;
          const inhalt = await textDialog({ titel: einzeln, label: 'Text' });
          if (inhalt === null) return;
          arr.push({ titel: titel.trim(), inhalt: inhalt.trim(), spieltag: a.spieltag });
          await speichere(); screen.refresh(); sprache.sage(`${einzeln} ${titel.trim()} gespeichert.`);
        },
      });
      for (let i = arr.length - 1; i >= 0; i--) {
        const n = arr[i];
        items.push({
          label: `${einzeln} ${i + 1}: ${n.titel || '(ohne Titel)'}`,
          hint: 'oeffnen',
          detail: n.inhalt || '',
          onSelect: () => screen.push(eintragScreen(feld, i, einzeln, vorlesen)),
        });
      }
      return menuScreen({ title: this.title, subtitle: 'Hinzufuegen oben, Eintraege nummeriert darunter. Escape zurueck.', items, leer: `Noch keine ${einzeln}e.` }).build();
    },
  };
}

function eintragScreen(feld, index, einzeln, vorlesen) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const n = (a[feld] || [])[index];
      if (!n) { screen.pop(); return document.createElement('div'); }
      this.title = n.titel || einzeln;
      const items = [];
      if (vorlesen) items.push({ label: 'Vorlesen', hint: 'liest den Text vor', onSelect: () => sprache.sage(n.inhalt || '') });
      items.push({ label: `Text: ${n.inhalt || '(leer)'}`, onSelect: () => sprache.sage(n.inhalt || 'Leer.') });
      items.push({
        label: 'Bearbeiten',
        onSelect: async () => {
          const titel = await textDialog({ titel: einzeln, label: 'Titel', wert: n.titel });
          if (titel === null) return;
          const inhalt = await textDialog({ titel: einzeln, label: 'Text', wert: n.inhalt });
          if (inhalt === null) return;
          n.titel = titel.trim(); n.inhalt = inhalt.trim();
          await speichere(); screen.refresh(); sprache.sage('Gespeichert.');
        },
      });
      items.push({
        label: 'Loeschen',
        onSelect: async () => {
          if (!await jaNeinDialog({ titel: 'Loeschen', frage: `${n.titel || einzeln} loeschen?` })) return;
          a[feld].splice(index, 1); await speichere(); screen.pop(); sprache.sage('Geloescht.');
        },
      });
      return menuScreen({ title: this.title, subtitle: 'Escape zurueck.', items }).build();
    },
  };
}
