/**
 * Skularis — Gesendeten Charakterbogen übernehmen (gemeinsamer Ablauf).
 *
 * Ein Spieler sendet seinen Bogen über die accountlose Box unter einem 4-stelligen
 * Code (siehe screens/meine-charaktere.js → sendeAnMeister). Meister UND Spieler
 * holen ihn hier wieder ab:
 *   1. Code eingeben (klar rückgemeldet).
 *   2. Übersichts-Bildschirm: "Neuer Bogen NAME, X EP gesamt", darunter die Liste
 *      der vorhandenen Bögen (je mit EP) zum Ersetzen (mit Ja/Nein-Rückfrage),
 *      ganz unten "Bogen annehmen und nichts überschreiben".
 *
 * Der Bildschirm ist bewusst ein normaler Menü-Bildschirm (kein Modal), damit
 * jede Zeile mit dem Screenreader erreichbar und vorlesbar ist. Die eigentliche
 * Ablage (Bibliothek bzw. Meistergruppe) liefern die Aufrufer als Rückrufe.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { infoZeile, abschnittTitel, aktionZeile, verbindeDetail } from '../editor/widgets.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { ladeDb } from './db-laden.js';
import { parse, serialisiere } from './sephrasto-xml.js';
import { ensureCharakterId } from './character.js';

const ipc = window.skularis?.ipc;

/** Gesamt-EP eines Bogens (0, wenn nicht vorhanden). */
export function gesamtEP(bogen) {
  return (bogen && bogen.erfahrung && bogen.erfahrung.gesamt) || 0;
}

/**
 * Fragt den 4-stelligen Code, holt und parst den Bogen. Jeder Schritt wird klar
 * angesagt. @returns {Promise<{neuChar, db}|null>}
 */
export async function holeBogenPerCode() {
  const eingabe = await textDialog({ titel: 'Gesendeten Charakterbogen laden', label: 'Vom Spieler genannter 4-stelliger Code' });
  if (eingabe === null) { sprache.sage('Abgebrochen.'); return null; }
  const code = String(eingabe).replace(/[^0-9]/g, '').slice(0, 4);
  if (code.length < 4) { sounds.playError(); sprache.sage('Bitte einen 4-stelligen Code eingeben. Abgebrochen.'); return null; }
  sprache.sage('Hole den Charakterbogen, einen Moment.');
  let r; try { r = await ipc.boxAbholen(code); } catch (e) { r = { ok: false, fehler: String(e) }; }
  if (!r || !r.ok || !r.inhalt) { sounds.playError(); sprache.sage('Unter diesem Code liegt kein Charakter. Stimmt der Code, und hat der Spieler schon gesendet?'); return null; }
  let db, neuChar;
  try { db = await ladeDb(); neuChar = parse(r.inhalt, db); } catch { sounds.playError(); sprache.sage('Der geladene Bogen ist unlesbar. Abgebrochen.'); return null; }
  ensureCharakterId(neuChar);
  return { neuChar, db };
}

/**
 * Übernahme-Bildschirm. `ziele`: Array aus { name, ep, id?, _ref } — die
 * bestehenden Bögen. `onErsetzen(ziel)` und `onNeuAnnehmen()` erledigen die
 * Ablage und dürfen async sein.
 */
export function uebernahmeScreen({ neuChar, ziele, onErsetzen, onNeuAnnehmen }) {
  const name = (neuChar.name || 'Charakter').trim() || 'Charakter';
  const ep = gesamtEP(neuChar);
  // Gleiche Charakter-ID nach oben (bequemer Standard: „das ist derselbe Held").
  const liste = (ziele || []).slice().sort((a, b) => (b.id === neuChar.id ? 1 : 0) - (a.id === neuChar.id ? 1 : 0));
  return {
    title: `Charakterupdate: ${name}`,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(`Neuer Bogen: ${name}, ${ep} EP gesamt`));
      wrap.appendChild(infoZeile(`Neuer Bogen: ${name}, ${ep} Erfahrungspunkte gesamt.`,
        'Der gerade geladene Charakterbogen. Wähle unten, welchen bestehenden Bogen er ersetzen soll, oder nimm ihn ganz unten an, ohne etwas zu überschreiben.'));

      wrap.appendChild(abschnittTitel('Welchen Bogen ersetzen?'));
      if (!liste.length) {
        wrap.appendChild(infoZeile('Keine bestehenden Bögen vorhanden.', 'Es gibt noch nichts zum Ersetzen. Nimm den Bogen unten neu an.'));
      } else {
        for (const z of liste) {
          const gleich = z.id && z.id === neuChar.id;
          wrap.appendChild(aktionZeile(
            `${z.name}, ${z.ep} EP ersetzen${gleich ? ' (gleicher Charakter)' : ''}`,
            async () => {
              if (!await jaNeinDialog({ titel: 'Ersetzen', frage: `Bogen „${z.name}" mit ${z.ep} EP durch „${name}" mit ${ep} EP ersetzen? Der alte Stand wird überschrieben.`, jaLabel: 'Ja, ersetzen', neinLabel: 'Nein, abbrechen' })) return;
              try { await onErsetzen(z); } catch (e) { console.error('Ersetzen:', e); sounds.playError(); sprache.sage('Ersetzen fehlgeschlagen.'); return; }
              sounds.playSpeichern();
              sprache.sage(`${z.name} durch ${name} ersetzt.`);
              screen.pop();
            },
            gleich ? 'derselbe Charakter, empfohlen zum Aktualisieren' : `ersetzt ${z.name} durch den neuen Bogen`));
        }
      }

      wrap.appendChild(abschnittTitel('Oder neu annehmen'));
      wrap.appendChild(aktionZeile('Bogen annehmen und nichts überschreiben', async () => {
        try { await onNeuAnnehmen(); } catch (e) { console.error('Annehmen:', e); sounds.playError(); sprache.sage('Annehmen fehlgeschlagen.'); return; }
        sounds.playSpeichern();
        sprache.sage(`${name} neu angenommen.`);
        screen.pop();
      }, 'übernimmt den Bogen zusätzlich, ohne einen bestehenden zu überschreiben'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() { sprache.sage(`Charakterupdate ${name}, ${ep} EP gesamt. Welchen Bogen ersetzen, oder ganz unten neu annehmen?`); },
  };
}

/**
 * Fertiger Ablauf für die BIBLIOTHEK (Charakterverwaltung → Meine Charaktere):
 * Code holen, dann Ersetzen/Annehmen als .xml im Ordner Charakter-Dateien.
 */
export async function starteBibliotheksUebernahme() {
  const r = await holeBogenPerCode();
  if (!r) return;
  const { neuChar, db } = r;
  const name = (neuChar.name || 'Charakter').trim() || 'Charakter';
  let daten = []; try { daten = await ipc.bibliothekListe(); } catch { daten = []; }
  const ziele = [];
  for (const x of daten) {
    try { const res = await ipc.dateiDirektLaden(x.pfad); const p = parse(res.inhalt, db); ziele.push({ name: x.name, ep: gesamtEP(p), id: p.id, _pfad: x.pfad }); }
    catch { ziele.push({ name: x.name, ep: 0, id: null, _pfad: x.pfad }); }
  }
  const speichereBogen = async () => { await ipc.bibliothekSpeichern({ name, inhalt: serialisiere(neuChar, db) }); };
  screen.push(uebernahmeScreen({
    neuChar, ziele,
    onErsetzen: async (z) => {
      await speichereBogen();
      if (z._pfad && (z.name || '').toLowerCase() !== name.toLowerCase()) { try { await ipc.bibliothekLoeschen(z._pfad); } catch { /* egal */ } }
    },
    onNeuAnnehmen: speichereBogen,
  }));
}
