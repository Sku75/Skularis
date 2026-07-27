/**
 * Skularistool — Abenteuer-Tisch (zweiter Hauptbereich).
 *
 * Einstiegsmenü mit drei Wegen:
 *   1. Abenteuer erstellen (Name + Charakter wählen)
 *   2. Abenteuer öffnen und bearbeiten (offline betrachten/pflegen)
 *   3. Abenteuer spielen, Spieltag öffnen (Spieltag-Kreislauf)
 *
 * Der Hub kennt zwei Modi: "bearbeiten" (Speichern und zurück) und "spielen"
 * (Spieltag abschließen: Abenteuerpunkte an den Charakter, dann Hauptmenü).
 * Der aktive Spielstand liegt in abenteuer/state.js, gespeichert wird atomar.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { textDialog, zahlDialog } from '../ui/dialog.js';
import { ladeDb } from '../core/db-laden.js';
import { parse, serialisiere } from '../core/sephrasto-xml.js';
import { createAbenteuer, parseAbenteuer, protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, setAbenteuer, speichere } from '../abenteuer/state.js';

const ipc = window.skularis?.ipc;

export function oeffne() {
  screen.push(einstiegScreen());
}

function einstiegScreen() {
  return menuScreen({
    title: 'Abenteuer-Tisch',
    subtitle: 'Escape kehrt zum Hauptmenü zurück.',
    items: [
      { label: 'Abenteuer erstellen', hint: 'Name und Charakter wählen', onSelect: erstellen },
      { label: 'Abenteuer öffnen und bearbeiten', hint: 'Betrachten und pflegen, ohne zu spielen', onSelect: () => oeffnen('bearbeiten') },
      { label: 'Abenteuer spielen, Spieltag öffnen', hint: 'In den Spieltag-Kreislauf', onSelect: () => oeffnen('spielen') },
    ],
  });
}

/** Regelnachschlagewerk, mit dem Charakter des offenen Abenteuers als Bezug. */
export async function regelnOeffnen() {
  const db = await ladeDb();
  const a = getAbenteuer();
  const m = await import('./regeln.js');
  screen.push(m.regelnScreen({
    db,
    charakter: a && a.charakter ? a.charakter : null,
    titel: a && a.charakter ? `Regeln, Bezug ${a.charakter.name || 'Charakter'}` : 'Regeln',
  }));
}

async function erstellen() {
  const name = await textDialog({ titel: 'Neues Abenteuer', label: 'Name des Abenteuers' });
  if (name === null || !name.trim()) return;

  let liste = [];
  try { liste = await ipc.bibliothekListe(); } catch { liste = []; }
  if (!liste.length) { sprache.sage('Keine Charaktere vorhanden. Erst in der Charakterverwaltung einen Charakter erstellen.'); return; }

  const eintraege = liste.map(c => ({ label: c.name, wert: c.pfad, detail: 'Dieser Charakter nimmt am Abenteuer teil.' }));
  auswahlScreen({
    titel: 'Charakter für das Abenteuer wählen',
    eintraege,
    onWahl: async (pfad) => {
      try {
        const db = await ladeDb();
        const res = await ipc.dateiDirektLaden(pfad);
        const char = parse(res.inhalt, db);
        const charName = String(pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
        const a = createAbenteuer(char, name.trim(), charName, pfad);
        protokolliere(a, `Abenteuer erstellt mit Charakter ${char.name || charName}.`);
        setAbenteuer(a);
        await speichere();
        sounds.playOeffnen();
        screen.push(hubScreen('bearbeiten'));
        sprache.sage(`Abenteuer ${a.name} erstellt.`);
      } catch (e) {
        console.error('Abenteuer erstellen:', e);
        sprache.sage('Charakter konnte nicht geladen werden.');
      }
    },
  });
}

async function oeffnen(modus) {
  let liste = [];
  try { liste = await ipc.abenteuerListe(); } catch { liste = []; }
  if (!liste.length) { sprache.sage('Noch keine gespeicherten Abenteuer.'); return; }

  const eintraege = liste.map(a => ({ label: a.name, wert: a.pfad }));
  auswahlScreen({
    titel: modus === 'spielen' ? 'Abenteuer zum Spielen wählen' : 'Abenteuer zum Bearbeiten wählen',
    eintraege,
    onWahl: async (pfad) => {
      try {
        await ladeDb(); // für Basiswerte im Charakterbogen
        const r = await ipc.abenteuerLaden(pfad);
        const a = parseAbenteuer(r.inhalt);
        a._pfad = pfad;
        setAbenteuer(a);
        sounds.playOeffnen();
        screen.push(hubScreen(modus));
      } catch (e) {
        console.error('Abenteuer laden:', e);
        sprache.sage('Abenteuer konnte nicht geladen werden.');
      }
    },
  });
}

// --- Hub (modusabhängig) ---

function hubScreen(modus) {
  const obj = {
    title: '',
    build() {
      const a = getAbenteuer();
      obj.title = `${a.name}, Spieltag ${a.spieltag}${modus === 'bearbeiten' ? ', Bearbeiten' : ''}`;

      const push = (modul, fn) => import(`../abenteuer/${modul}.js`).then(m => screen.push(m[fn]()))
        .catch((e) => { console.error(e); sprache.sage('Bereich wird gerade gebaut.'); });

      const items = [
        { label: 'Live-Spiel', hint: 'Würfeln und Kampfwerte', onSelect: () => push('live-spiel', 'liveSpielScreen') },
        { label: 'Charakterstatus', hint: 'Wunden, Energien, Werte zum Lesen', onSelect: () => push('live-spiel', 'charakterstatusScreen') },
        { label: 'Charakterbogen', hint: 'Werte ansehen, Schnellauskunft', onSelect: () => push('charakterbogen', 'charakterbogenScreen') },
        { label: 'Inventar', hint: 'Geldbörse, Rucksack, am Gürtel', onSelect: () => push('inventar', 'inventarScreen') },
        { label: 'Notizen und Tagebuch', onSelect: () => push('notizen', 'notizenScreen') },
        { label: 'Mitspieler', onSelect: () => push('mitspieler', 'mitspielerScreen') },
        { label: 'Spielfeld', hint: 'Platzhalter für spätere Versionen', onSelect: () => sprache.sage('Spielfeld, Platzhalter für später.') },
        { label: 'Protokoll', hint: 'Was im Abenteuer passiert ist', onSelect: () => zeigeProtokoll() },
        {
          label: 'Regelnachschlagewerk',
          hint: 'Alle Regeln alphabetisch, verfügbare vorn gekennzeichnet',
          detail: 'Die vollständige Regelliste, auch Manöver, die du noch nicht gekauft hast. '
            + 'Regeln, die dein Charakter hat, stehen vorn mit "Verfügbar".',
          onSelect: () => regelnOeffnen(),
        },
      ];

      if (modus === 'spielen') {
        items.push({ label: 'Abenteuer speichern und Spieltag abschließen', hint: 'Abenteuerpunkte an den Charakter, dann Hauptmenü', onSelect: () => spieltagAbschliessen() });
      } else {
        items.push({ label: 'Abenteuer speichern und zurück', onSelect: () => speichernUndZurueck() });
      }

      return menuScreen({ title: obj.title, subtitle: 'Escape kehrt zurück.', items }).build();
    },
  };
  return obj;
}

function zeigeProtokoll() {
  const a = getAbenteuer();
  const items = a.protokoll.map(p => ({ label: `Spieltag ${p.spieltag}: ${p.text}`, detail: p.zeit || '', onSelect: () => {} }));
  screen.push(menuScreen({ title: 'Protokoll', subtitle: 'Neueste oben. Escape zurück.', items, leer: 'Noch keine Einträge.' }));
}

async function speichernUndZurueck() {
  await speichere();
  sounds.playSpeichern();
  sprache.sage('Abenteuer gespeichert.');
  screen.pop();
}

async function spieltagAbschliessen() {
  const a = getAbenteuer();
  const ap = await zahlDialog({ titel: 'Spieltag abschließen', label: 'Erhaltene Abenteuerpunkte', wert: 0, min: 0, max: 100000 });
  if (ap === null) return;

  let charOk = true;
  if (ap > 0 && a.charakterName) {
    try {
      const db = await ladeDb();
      let c;
      if (a.charakterPfad) {
        const r = await ipc.dateiDirektLaden(a.charakterPfad);
        c = parse(r.inhalt, db);
      } else {
        c = a.charakter;
      }
      c.erfahrung.gesamt = (c.erfahrung.gesamt || 0) + ap;
      await ipc.bibliothekSpeichern({ name: a.charakterName, inhalt: serialisiere(c, db) });
    } catch (e) {
      console.error('AP an Charakter schreiben:', e);
      charOk = false;
    }
  }

  a.apGesamt += ap;
  protokolliere(a, `Spieltag ${a.spieltag} abgeschlossen, ${ap} Abenteuerpunkte an ${a.charakterName} übertragen.`);
  a.spieltag += 1;
  await speichere();
  sounds.playSpeichern();

  // Zurück zum Hauptmenü, dann die Bestätigung ansagen (überschreibt die Menü-Ansage).
  screen.zuWurzel();
  const meldung = charOk
    ? `${ap} Abenteuerpunkte an ${a.charakterName} gespeichert. Abenteuer gespeichert, nächster Spieltag ist ${a.spieltag}. Zurück im Hauptmenü.`
    : `Abenteuer gespeichert. Achtung, die Abenteuerpunkte konnten nicht am Charakter gespeichert werden. Zurück im Hauptmenü.`;
  setTimeout(() => sprache.sage(meldung), 150);
}
