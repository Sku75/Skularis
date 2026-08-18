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
import { zahlDialog, jaNeinDialog, textDialog, codeAnzeigeDialog } from '../ui/dialog.js';
import { ladeDb } from '../core/db-laden.js';
import { parse, serialisiere } from '../core/sephrasto-xml.js';
import { ensureCharakterId } from '../core/character.js';
import { exportHtml } from '../core/export-html.js';
import { starteBibliotheksUebernahme } from '../core/bogen-uebernahme.js';

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
      // Gesendete Bögen lädt man zentral in der Charakterverwaltung
      // („Gesendeten Charakterbogen laden").
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
      // Hinter jeden Namen die Gesamt-EP des Bogens (jede Datei kurz einlesen).
      let db = null; try { db = await ladeDb(); } catch { db = null; }
      for (const c of daten) {
        let label = c.name;
        if (db) { try { const res = await ipc.dateiDirektLaden(c.pfad); const p = parse(res.inhalt, db); label = `${c.name}, ${(p.erfahrung && p.erfahrung.gesamt) || 0} EP`; } catch { /* Name ohne EP */ } }
        liste.appendChild(aktionZeile(label, () => screen.push(charakterMenu(c)), 'Öffnen, Umbenennen, Erfahrungspunkte, Löschen'));
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
      { label: 'Charakterbogen versenden', hint: 'Lädt den Bogen in ein Zimmer; du nennst dem Meister ODER einem Mitspieler den 4-stelligen Code', onSelect: () => sendeAnMeister(c) },
      { label: 'Charakterbogen empfangen', hint: 'Einen per Code gesendeten Bogen laden; danach ersetzen oder neu annehmen', onSelect: () => starteBibliotheksUebernahme() },
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

// --- Charakter-Transfer über die accountlose Box (Code = Zimmer) ---

/** Spieler: den Charakter unter einem 4-stelligen Code hochladen; den Code nennt er dem Meister. */
async function sendeAnMeister(c) {
  const { db, parsed } = await ladeChar(c);
  const neu = ensureCharakterId(parsed); // alter/importierter Bogen bekommt jetzt eine feste ID
  const xml = serialisiere(parsed, db);
  if (neu) { try { await ipc.bibliothekSpeichern({ name: c.name, inhalt: xml }); } catch { /* ID lokal persistieren; egal wenn es klemmt */ } }
  const code = String(Math.floor(1000 + Math.random() * 9000)); // 4-stellig
  sprache.sage('Lade hoch, einen Moment.');
  let r; try { r = await ipc.boxHochladen(code, xml); } catch (e) { r = { ok: false, fehler: String(e) }; }
  if (r && r.ok) {
    sounds.playSpeichern();
    const gesprochen = code.split('').join(' ');
    await codeAnzeigeDialog({ titel: 'Charakterbogen gesendet', code, hinweis: 'Nenne diesen Code dem Meister oder einem Mitspieler. Er gilt etwa 3 Stunden, danach ist der Bogen automatisch weg.' });
    sprache.sage(`Gesendet. Code ${gesprochen}.`);
  } else {
    sounds.playError();
    sprache.sage('Hochladen fehlgeschlagen. Bist du online?');
  }
}

/** Meister: Charakter per Code abholen und über die stabile ID den alten Bogen ersetzen (keine Dubletten).
 *  Gibt bei Erfolg { ok:true, id, name } zurück (für den Meistertisch-Aufruf), sonst nichts. */
export async function charakterAbrufen() {
  const eingabe = await textDialog({ titel: 'Charakterupdate durchführen', label: 'Vom Spieler genannter 4-stelliger Code' });
  if (eingabe === null) return;
  const code = String(eingabe).replace(/[^0-9]/g, '').slice(0, 4);
  if (code.length < 4) { sprache.sage('Bitte einen 4-stelligen Code eingeben.'); return; }
  sprache.sage('Hole den Charakter, einen Moment.');
  let r; try { r = await ipc.boxAbholen(code); } catch (e) { r = { ok: false, fehler: String(e) }; }
  if (!r || !r.ok || !r.inhalt) { sounds.playError(); sprache.sage('Unter diesem Code liegt kein Charakter. Stimmt der Code, und hat der Spieler schon hochgeladen?'); return; }
  let db, neuChar;
  try { db = await ladeDb(); neuChar = parse(r.inhalt, db); } catch { sounds.playError(); sprache.sage('Der abgeholte Bogen ist unlesbar.'); return; }
  ensureCharakterId(neuChar);
  const name = (neuChar.name || 'Charakter').trim() || 'Charakter';
  // Bestehenden Bogen mit DERSELBEN ID suchen (egal, wie er aktuell heißt).
  let daten = []; try { daten = await ipc.bibliothekListe(); } catch { daten = []; }
  let alt = null;
  for (const x of daten) {
    try { const res = await ipc.dateiDirektLaden(x.pfad); const p = parse(res.inhalt, db); if (p.id && p.id === neuChar.id) { alt = x; break; } }
    catch { /* diese Datei überspringen */ }
  }
  const frage = alt
    ? `Charakter ${name} gefunden (bisher als „${alt.name}"). Jetzt aktualisieren und den alten Bogen ersetzen?`
    : `Neuer Charakter ${name}. In Meine Charaktere übernehmen?`;
  if (!await jaNeinDialog({ titel: 'Charakterupdate', frage, jaLabel: 'Ja', neinLabel: 'Abbrechen' })) return;
  const xml = serialisiere(neuChar, db);
  await ipc.bibliothekSpeichern({ name, inhalt: xml }); // schreibt <name>.xml (überschreibt bei gleichem Namen)
  // Den alten Bogen nur löschen, wenn er einen ANDEREN Namen (andere Datei) hatte —
  // sonst würde man die gerade geschriebene Datei wieder entfernen.
  if (alt && (alt.name || '').toLowerCase() !== name.toLowerCase()) {
    try { await ipc.bibliothekLoeschen(alt.pfad); } catch { /* egal */ }
  }
  sounds.playSpeichern();
  sprache.sage(alt ? `${name} aktualisiert. Der alte Bogen wurde ersetzt.` : `${name} neu übernommen.`);
  screen.refresh();
  return { ok: true, id: neuChar.id, name };
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
