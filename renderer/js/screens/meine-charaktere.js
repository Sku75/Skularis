/**
 * Skularistool — Meine Charaktere (Bibliothek)
 * Auflisten, öffnen, Erfahrungspunkte hinzufügen, als HTML exportieren, löschen.
 * Import einer externen Sephrasto-XML. Alle Charaktere liegen als .xml im
 * Ordner Charakter-Dateien.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import * as editor from '../editor/editor.js';
import { aktionZeile, infoZeile, abschnittTitel } from '../editor/widgets.js';
import { auswahlDialog, zahlDialog, jaNeinDialog, textDialog } from '../ui/dialog.js';
import { ladeDb } from '../core/db-laden.js';
import { parse, serialisiere } from '../core/sephrasto-xml.js';
import { exportHtml } from '../core/export-html.js';

const ipc = window.skularis?.ipc;

async function ladeChar(c) {
  const db = await ladeDb();
  const res = await ipc.dateiDirektLaden(c.pfad);
  const parsed = parse(res.inhalt, db);
  parsed.dateiname = c.pfad;
  return { db, parsed };
}

// --- Liste (dynamisch über onShow, damit sie nach Löschen/Import aktuell ist) ---

export async function oeffne() {
  screen.push(listeScreen());
}

function listeScreen() {
  return {
    title: 'Meine Charaktere',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Meine Charaktere'));
      wrap.appendChild(aktionZeile('Neuen Charakter erstellen', () => editor.starteNeu(), 'Öffnet das Erstellungs-Tool'));
      const liste = document.createElement('div');
      liste.className = 'db-menu__list';
      liste.id = 'mc-liste';
      wrap.appendChild(liste);
      return wrap;
    },
    async onShow(el) {
      const liste = el.querySelector('#mc-liste');
      liste.innerHTML = '';
      let daten = [];
      try { daten = await ipc.bibliothekListe(); } catch { daten = []; }
      if (!daten.length) {
        liste.appendChild(infoZeile('Noch keine Charaktere gespeichert.'));
        return;
      }
      for (const c of daten) {
        liste.appendChild(aktionZeile(c.name, () => screen.push(charakterMenu(c)), 'Öffnen, Umbenennen, Erfahrungspunkte, Löschen'));
      }
    },
  };
}

// --- Untermenü pro Charakter ---

function charakterMenu(c) {
  return menuScreen({
    title: c.name,
    subtitle: 'Escape zurück zur Liste.',
    items: [
      { label: 'Charakter öffnen', hint: 'Im Editor bearbeiten', onSelect: async () => {
        const { parsed } = await ladeChar(c);
        sounds.playOeffnen();
        editor.bearbeite(parsed);
      } },
      { label: 'Charakter umbenennen', hint: 'Benennt den Charakterbogen um und speichert ihn unter dem neuen Namen', onSelect: async () => {
        const eingabe = await textDialog({ titel: 'Charakter umbenennen', label: 'Neuer Name', wert: c.name });
        if (eingabe === null) return;
        const name = eingabe.trim();
        if (!name || name === c.name) return;
        let daten = [];
        try { daten = await ipc.bibliothekListe(); } catch { daten = []; }
        if (daten.some(x => (x.name || '').toLowerCase() === name.toLowerCase() && x.pfad !== c.pfad)) {
          sounds.playError();
          sprache.sage('Es gibt schon einen Charakter mit diesem Namen. Bitte einen anderen wählen.');
          return;
        }
        const { db, parsed } = await ladeChar(c);
        parsed.name = name;
        await ipc.bibliothekSpeichern({ name, inhalt: serialisiere(parsed, db) });
        await ipc.bibliothekLoeschen(c.pfad); // alte Datei mit dem alten Namen entfernen
        sounds.playSpeichern();
        sprache.sage(`Charakter heißt jetzt ${name}.`);
        screen.pop();
      } },
      { label: 'Erfahrungspunkte hinzufügen', hint: 'Erhöht die Gesamt-EP', onSelect: async () => {
        const menge = await zahlDialog({ titel: 'Erfahrungspunkte hinzufügen', label: 'EP hinzufügen', wert: 0, min: -100000, max: 100000 });
        if (!menge) return;
        const { db, parsed } = await ladeChar(c);
        parsed.erfahrung.gesamt = (parsed.erfahrung.gesamt || 0) + menge;
        await ipc.bibliothekSpeichern({ name: c.name, inhalt: serialisiere(parsed, db) });
        sounds.play('ep_hinzu'); // Erfolgs-Ton fuer EP hinzugefuegt (nicht der Speicher-Ton)
        sprache.sage(`${menge} EP hinzugefügt. ${c.name} hat jetzt ${parsed.erfahrung.gesamt} EP gesamt.`);
      } },
      { label: 'Als HTML exportieren', hint: 'Lesbares Charakterblatt in Charakter-Dateien', onSelect: async () => {
        const { db, parsed } = await ladeChar(c);
        await ipc.bibliothekSchreiben({ dateiname: `${c.name}.html`, inhalt: exportHtml(parsed, db) });
        sounds.playSpeichern();
        sprache.sage(`${c.name} als HTML im Ordner Charakter-Dateien gespeichert.`);
      } },
      { label: 'Charakter löschen', hint: 'Entfernt die Datei', onSelect: async () => {
        const ja = await jaNeinDialog({ titel: 'Charakter löschen', frage: `${c.name} wirklich löschen?`, jaLabel: 'Ja, löschen', neinLabel: 'Nein, behalten' });
        if (!ja) return;
        await ipc.bibliothekLoeschen(c.pfad);
        sounds.playLoeschen();
        sprache.sage(`${c.name} gelöscht.`);
        screen.pop();
      } },
    ],
  });
}

// --- Import / Export (aus dem Charakterverwaltungs-Menü) ---

export async function importieren() {
  let res;
  try { res = await ipc.dateiOeffnen(); } catch { res = null; }
  if (!res) return;
  try {
    const db = await ladeDb();
    const parsed = parse(res.inhalt, db);
    const name = parsed.name || String(res.pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
    await ipc.bibliothekSpeichern({ name, inhalt: serialisiere(parsed, db) });
    sounds.playOeffnen();
    sprache.sage(`${name} importiert und in Meine Charaktere übernommen.`);
  } catch (e) {
    console.error('Import fehlgeschlagen:', e);
    sounds.playError();
    sprache.sage('Import fehlgeschlagen. Keine gültige Ilaris-Charakterdatei.');
  }
}

export async function exportieren() {
  sprache.sage('Export erfolgt pro Charakter. Wähle in Meine Charaktere einen Charakter und dort Als HTML exportieren. Die Charakterdatei liegt bereits im Ordner Charakter-Dateien.');
  await oeffne();
}
