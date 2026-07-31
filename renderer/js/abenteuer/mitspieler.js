/**
 * Skularistool — Abenteuer-Bereich: Mitspieler.
 * Mitspielerkarten mit Name und Zusatzinformationen. Die Zusatzinfo erscheint
 * bei Shift und Pfeil-runter (und für Sehende im Detailbereich). Ganz oben
 * "Mitspieler hinzufügen". Autospeichern.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';

function zusatzText(m) {
  return m.zusatz || [m.notizenSpieler, m.notizenCharakter].filter(Boolean).join('. ') || 'keine';
}

async function hinzufuegen() {
  const a = getAbenteuer();
  const name = await textDialog({ titel: 'Mitspieler hinzufügen', label: 'Name der Mitspielerkarte' });
  if (name === null || !name.trim()) return;
  const zusatz = (await textDialog({ titel: 'Zusatzinformationen', label: 'Zusatzinformationen, freiwillig' })) || '';
  a.mitspieler.push({ name: name.trim(), zusatz: zusatz.trim() });
  await speichere();
  screen.refresh();
  sprache.sage(`Mitspieler ${name.trim()} hinzugefügt.`);
}

function verschiebe(a, index, richtung) {
  const ziel = index + richtung;
  if (ziel < 0 || ziel >= a.mitspieler.length) return false;
  const tmp = a.mitspieler[index];
  a.mitspieler[index] = a.mitspieler[ziel];
  a.mitspieler[ziel] = tmp;
  return true;
}

function mitspielerDetail(index) {
  return {
    title: '',
    build() {
      const a = getAbenteuer();
      const m = a.mitspieler[index];
      if (!m) { screen.pop(); return document.createElement('div'); }
      this.title = `Mitspieler ${m.name}`;
      const items = [
        { label: 'Zusatzinformationen vorlesen', detail: zusatzText(m), onSelect: () => sprache.sage(zusatzText(m)) },
        {
          label: 'Bearbeiten', hint: 'Name und Zusatzinformationen ändern',
          onSelect: async () => {
            const name = await textDialog({ titel: 'Mitspieler', label: 'Name', wert: m.name }); if (name === null || !name.trim()) return;
            const zusatz = await textDialog({ titel: 'Zusatzinformationen', label: 'Zusatzinformationen', wert: m.zusatz || '' }); if (zusatz === null) return;
            m.name = name.trim(); m.zusatz = zusatz.trim();
            await speichere(); screen.refresh(); sprache.sage('Gespeichert.');
          },
        },
        { label: 'Nach oben verschieben', onSelect: async () => { if (verschiebe(a, index, -1)) { await speichere(); screen.pop(); sprache.sage('Nach oben verschoben.'); } else sprache.sage('Schon ganz oben.'); } },
        { label: 'Nach unten verschieben', onSelect: async () => { if (verschiebe(a, index, 1)) { await speichere(); screen.pop(); sprache.sage('Nach unten verschoben.'); } else sprache.sage('Schon ganz unten.'); } },
        {
          label: 'Mitspieler entfernen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${m.name} wirklich entfernen?` })) return;
            a.mitspieler.splice(index, 1);
            await speichere(); screen.pop(); sprache.sage(`${m.name} entfernt.`);
          },
        },
      ];
      return menuScreen({ title: this.title, subtitle: 'Escape zurück.', items }).build();
    },
  };
}

export function mitspielerScreen() {
  const obj = {
    title: 'Mitspieler',
    build() {
      const a = getAbenteuer();
      const items = a.mitspieler.map((m, i) => ({
        label: `Mitspieler: ${m.name}`,
        // Zweite Zeile NUR fuer Sehende (hint ist aria-hidden, kein Fokus): der
        // Inhalt des zweiten Feldes. Der Screenreader liest ihn weiter auf Abruf.
        hint: zusatzText(m),
        detail: zusatzText(m),
        onSelect: () => screen.push(mitspielerDetail(i)),
      }));
      items.push({ label: 'Mitspieler hinzufügen', hint: 'Name und Zusatzinformationen', onSelect: hinzufuegen });
      return menuScreen({
        title: obj.title,
        subtitle: 'Shift und Pfeil-runter liest die Zusatzinformationen. Escape zurück.',
        items,
      }).build();
    },
  };
  return obj;
}
