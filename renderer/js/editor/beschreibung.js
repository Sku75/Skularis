/**
 * Skularistool — Editor-Bereich: Beschreibung
 * Name, Heimat, Finanzen, Spezies. Jede Zeile öffnet einen Dialog.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { aktionZeile, abschnittTitel } from './widgets.js';
import { textDialog, auswahlDialog } from '../ui/dialog.js';

function liste(db, key) {
  return String(db.einstellungen[key] || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function beschreibungScreen() {
  return {
    title: 'Beschreibung',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Beschreibung'));

      const finanzen = liste(db, 'Finanzen');   // 0 Sehr Reich .. 4 Sehr Arm
      const heimaten = liste(db, 'Heimaten');

      wrap.appendChild(aktionZeile(`Name: ${char.name || 'ohne'}`, async () => {
        const v = await textDialog({ titel: 'Name', label: 'Name des Charakters', wert: char.name });
        if (v !== null) { char.name = v.trim(); screen.refresh(); }
      }, 'Namen ändern'));

      wrap.appendChild(aktionZeile(`Heimat: ${char.heimat || 'keine'}`, async () => {
        const v = await auswahlDialog({ titel: 'Heimat wählen', eintraege: heimaten.map(h => ({ label: h, wert: h })) });
        if (v !== null) { char.heimat = v; screen.refresh(); }
      }, 'Heimat wählen'));

      wrap.appendChild(aktionZeile(`Finanzen: ${finanzen[char.finanzen] || 'Normal'}`, async () => {
        const v = await auswahlDialog({ titel: 'Finanzen wählen', eintraege: finanzen.map((f, i) => ({ label: f, wert: i })) });
        if (v !== null) { char.finanzen = v; editor.aktualisiere(); screen.refresh(); sprache.sage(`Finanzen ${finanzen[v]}.`); }
      }, 'Finanzen wählen, beeinflussen Schicksalspunkte'));

      wrap.appendChild(aktionZeile(`Spezies: ${char.spezies || 'keine'}`, async () => {
        const v = await textDialog({ titel: 'Spezies', label: 'Spezies, zum Beispiel Mensch, Elf oder Zwerg', wert: char.spezies });
        if (v !== null) { char.spezies = v.trim(); screen.refresh(); }
      }, 'Spezies eintragen'));

      return wrap;
    },
  };
}
