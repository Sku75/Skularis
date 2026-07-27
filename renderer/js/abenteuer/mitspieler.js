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

function mitspielerDetail(m) {
  return menuScreen({
    title: `Mitspieler ${m.name}`,
    subtitle: 'Escape zurück.',
    items: [
      { label: 'Zusatzinformationen vorlesen', detail: zusatzText(m), onSelect: () => sprache.sage(zusatzText(m)) },
      { label: 'Mitspieler entfernen', onSelect: async () => {
        const ja = await jaNeinDialog({ titel: 'Entfernen', frage: `${m.name} wirklich entfernen?` });
        if (!ja) return;
        const a = getAbenteuer();
        a.mitspieler = a.mitspieler.filter(x => x !== m);
        await speichere();
        sprache.sage(`${m.name} entfernt.`);
        screen.pop();
      } },
    ],
  });
}

export function mitspielerScreen() {
  const obj = {
    title: 'Mitspieler',
    build() {
      const a = getAbenteuer();
      const items = a.mitspieler.map((m) => ({
        label: `Mitspieler: ${m.name}`,
        detail: zusatzText(m),
        onSelect: () => screen.push(mitspielerDetail(m)),
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
