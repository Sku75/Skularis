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
import { textDialog, zahlDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { parse, serialisiere } from '../core/sephrasto-xml.js';
import { createAbenteuer, parseAbenteuer, protokolliere, uebernehmeAbenteuerdaten } from '../core/abenteuer.js';
import { getAbenteuer, setAbenteuer, speichere } from '../abenteuer/state.js';
import * as reiterHub from '../ui/reiter-hub.js';
import { liveSpielScreen, charakterstatusScreen } from '../abenteuer/live-spiel.js';
import { charakterbogenScreen } from '../abenteuer/charakterbogen.js';
import { inventarScreen } from '../abenteuer/inventar.js';
import { notizenScreen } from '../abenteuer/notizen.js';
import { mitspielerScreen } from '../abenteuer/mitspieler.js';
import { regelnScreen } from './regeln.js';
import { regelnMenuScreen } from './regeln-menu.js';
import { neuberechne, verfuegbareEP } from '../core/character.js';
import { zeigeEP, versteckeEP } from '../ui/ep-anzeige.js';

const ipc = window.skularis?.ipc;

// Einstiegs-Bildschirm; beim Verlassen des Hubs kehrt der Fokus hierher zurück.
let _einstieg = null;

export function oeffne() {
  _einstieg = einstiegScreen();
  screen.push(_einstieg);
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
        oeffneHubSpieler('bearbeiten');
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
  screen.push(abenteuerListeScreen(modus, liste));
}

/** Liste der Abenteuer; Enter oeffnet ein Untermenue (oeffnen/loeschen). */
function abenteuerListeScreen(modus, liste) {
  return {
    title: modus === 'spielen' ? 'Abenteuer zum Spielen' : 'Abenteuer zum Bearbeiten',
    build() {
      const items = liste.map(a => ({
        label: a.name,
        hint: 'Enter: oeffnen oder loeschen',
        onSelect: () => screen.push(abenteuerEintragScreen(modus, a, liste)),
      }));
      return menuScreen({ title: this.title, subtitle: 'Escape zurück.', items, leer: 'Noch keine Abenteuer.' }).build();
    },
  };
}

function abenteuerEintragScreen(modus, eintrag, liste) {
  const oeffnenLabel = modus === 'spielen' ? 'Zum Spielen öffnen' : 'Zum Bearbeiten öffnen';
  return {
    title: eintrag.name,
    build() {
      return menuScreen({
        title: eintrag.name,
        subtitle: 'Escape zurück.',
        items: [
          {
            label: oeffnenLabel,
            onSelect: async () => {
              try {
                await ladeDb(); // für Basiswerte im Charakterbogen
                const r = await ipc.abenteuerLaden(eintrag.pfad);
                const a = parseAbenteuer(r.inhalt);
                a._pfad = eintrag.pfad;
                setAbenteuer(a);
                sounds.playOeffnen();
                oeffneHubSpieler(modus);
              } catch (e) {
                console.error('Abenteuer laden:', e);
                sprache.sage('Abenteuer konnte nicht geladen werden.');
              }
            },
          },
          {
            label: 'Löschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Löschen', frage: `Abenteuer ${eintrag.name} wirklich löschen?` })) return;
              try { await ipc.abenteuerLoeschen(eintrag.pfad); } catch (e) { console.error('löschen:', e); }
              const i = liste.indexOf(eintrag);
              if (i >= 0) liste.splice(i, 1);
              screen.pop();
              screen.refresh();
              sprache.sage(`${eintrag.name} gelöscht.`);
            },
          },
        ],
      }).build();
    },
  };
}

// --- Hub (modusabhängig) ---

function oeffneHubSpieler(modus) {
  const a = getAbenteuer();
  const titel = `${a.name}, Spieltag ${a.spieltag}${modus === 'bearbeiten' ? ', Bearbeiten' : ''}`;

  // Feste EP-Anzeige unten mittig einblenden (ein Charakter geladen).
  const cha = a.charakter;
  if (cha && cha.erfahrung) {
    let frei = 0;
    try { const db = getDb(); if (db) { neuberechne(cha, db); frei = verfuegbareEP(cha); } } catch { /* Anzeige ist nur optisch */ }
    zeigeEP(frei, cha.erfahrung.gesamt || 0);
  }

  let hub;
  // F-Tasten bekommen NUR die Bildschirm-Punkte (factory). Die Aktionen unten
  // (Zwischenspeichern, Abenteuertag abschließen) haben KEINE F-Taste — die
  // F-Tasten dienen nur dem Bildschirmwechsel. "Spielfeld" ist die letzte
  // F-Bindung, deshalb steht es als letzter Bildschirm-Punkt.
  const punkte = [
    { label: 'Meine Initiative-Phase', hint: 'Würfeln, Aktionen, Kämpfen, Manöver und Zauber', factory: () => liveSpielScreen() },
    { label: 'Charakterstatus', hint: 'Wunden, Energien, Werte zum Lesen', factory: () => charakterstatusScreen() },
    { label: 'Charakterbogen', hint: 'Werte ansehen, Schnellauskunft', factory: () => charakterbogenScreen() },
    { label: 'Inventar', hint: 'Geldbörse, Rucksack, am Gürtel', factory: () => inventarScreen() },
    { label: 'Notizen und Tagebuch', factory: () => notizenScreen() },
    { label: 'Mitspieler', factory: () => mitspielerScreen() },
    { label: 'Protokoll', hint: 'Was im Abenteuer passiert ist', factory: () => protokollScreenSpieler() },
    {
      label: 'Regeln',
      hint: 'Kurzregelfilter und das ganze Ilaris-Regelwerk',
      factory: () => regelnMenuScreen({ db: getDb(), charakter: getAbenteuer()?.charakter || null }),
    },
    { label: 'Spielfeld', hint: 'kommt in einer späteren Version', factory: () => spielfeldScreen() },
    // Aktionen ohne F-Taste (nur per Eingabetaste):
    { label: 'Zwischenspeichern', hint: 'Spielstand sichern', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Zwischengespeichert.'); } },
  ];

  if (modus === 'spielen') {
    punkte.push({ label: 'Abenteuertag abschließen und EP erhalten', hint: 'EP eintragen, an den Charakter gutschreiben, dann Hauptmenü', aktion: () => spieltagAbschliessen() });
  } else {
    punkte.push({ label: 'Abenteuer speichern und zurück', aktion: () => speichernUndZurueck(hub) });
  }

  hub = reiterHub.oeffneHub({
    titel, subtitle: 'Mit F1 bis F12 direkt zum Menü. Escape verlässt das Abenteuer.', punkte,
    zurueckAuf: _einstieg,
    beimVerlassen: async () => {
      const w = await knopfDialog({
        titel: 'Abenteuer verlassen',
        knoepfe: [
          { label: 'Speichern und schließen', wert: 'ja' },
          { label: 'Schließen ohne Speichern', wert: 'nein' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (w === 'ja') { await speichere(); sounds.playSpeichern(); }
      if (w === 'ja' || w === 'nein') versteckeEP(); // Charakter nicht mehr geladen
      return w || 'abbrechen';
    },
  });
}

function spielfeldScreen() {
  return menuScreen({
    title: 'Spielfeld',
    subtitle: 'Escape zurück.',
    items: [
      { label: 'Spielfeld', hint: 'kommt in einer späteren Version', detail: 'Das Spielfeld für den Abenteuertisch ist noch in Arbeit.', onSelect: () => sprache.sage('Spielfeld, kommt in einer späteren Version.') },
    ],
  });
}

function protokollScreenSpieler() {
  return {
    title: 'Protokoll',
    build() {
      const a = getAbenteuer();
      // Laufende Nummer zur Orientierung: neueste oben trägt die höchste Nummer.
      const items = a.protokoll.map((p, i) => ({ label: `${a.protokoll.length - i}. Spieltag ${p.spieltag}: ${p.text}`, detail: p.zeit || '', onSelect: () => {} }));
      return menuScreen({ title: 'Protokoll', subtitle: 'Neueste oben. Escape zurück.', items, leer: 'Noch keine Einträge.' }).build();
    },
  };
}

async function speichernUndZurueck(hub) {
  await speichere();
  sounds.playSpeichern();
  sprache.sage('Abenteuer gespeichert.');
  if (hub) hub.verlasse(); else screen.pop();
}

async function spieltagAbschliessen() {
  const a = getAbenteuer();
  const ap = await zahlDialog({ titel: 'Abenteuertag abschließen', label: 'Erhaltene Erfahrungspunkte (EP)', wert: 0, min: 0, max: 100000 });
  if (ap === null) return;

  // Beim Abschluss den Charakterbogen aktualisieren: Abenteuerpunkte,
  // Münzbörse und Spielinventar. Der Bogen wird frisch von der Platte geladen,
  // damit zwischenzeitliche Editor-Änderungen (Steigern) nicht verloren gehen.
  let charOk = true;
  if (a.charakterName) {
    try {
      const db = await ladeDb();
      let c;
      if (a.charakterPfad) {
        const r = await ipc.dateiDirektLaden(a.charakterPfad);
        c = parse(r.inhalt, db);
      } else {
        c = a.charakter;
      }
      if (ap > 0) c.erfahrung.gesamt = (c.erfahrung.gesamt || 0) + ap;
      uebernehmeAbenteuerdaten(c, a);
      await ipc.bibliothekSpeichern({ name: a.charakterName, inhalt: serialisiere(c, db) });
    } catch (e) {
      console.error('Charakter aktualisieren:', e);
      charOk = false;
    }
  }

  a.apGesamt += ap;
  protokolliere(a, `Spieltag ${a.spieltag} abgeschlossen. ${ap} Abenteuerpunkte, Finanzen und Inventar an ${a.charakterName} übertragen.`);
  a.spieltag += 1;
  await speichere();
  sounds.playSpeichern();

  // Zurück zum Hauptmenü, dann die Bestätigung ansagen (überschreibt die Menü-Ansage).
  screen.zuWurzel();
  const apText = ap > 0 ? `${ap} Abenteuerpunkte, ` : '';
  const meldung = charOk
    ? `Charakterbogen aktualisiert: ${apText}Finanzen und Inventar gespeichert. Abenteuer gespeichert, nächster Spieltag ist ${a.spieltag}. Zurück im Hauptmenü.`
    : `Abenteuer gespeichert. Achtung, der Charakterbogen konnte nicht aktualisiert werden. Zurück im Hauptmenü.`;
  setTimeout(() => sprache.sage(meldung), 150);
}
