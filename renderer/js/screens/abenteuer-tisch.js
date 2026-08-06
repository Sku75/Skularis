/**
 * Skularistool — Abenteuer-Tisch (zweiter Hauptbereich).
 *
 * Aufbau: Der Charakterbogen (.xml) ist König. Beim ÖFFNEN eines Abenteuers wird
 * der Bogen frisch von der Platte geladen und ersetzt die eingebettete Kopie
 * (gesteigerte Werte, neue Waffensets, neue Gegenstände erscheinen sofort). Die
 * Session-Daten (Zähler, Tagebuch, Notizen, Mitspieler, Protokoll) kommen aus dem
 * Abenteuer-Datensatz. Beim SPEICHERN/Schließen werden Gold und Inventar zurück in
 * den Bogen geschrieben; die Zähler bleiben im Abenteuer.
 *
 * Menü: eine Ebene — oben "Abenteuer erstellen", darunter direkt alle Abenteuer;
 * je Abenteuer ein Untermenü mit "Öffnen" und "Löschen". Erfahrungspunkte trägt
 * man manuell über den Charaktereditor ein (kein Spieltag-/EP-Abschluss mehr).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { textDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { createAbenteuer, parseAbenteuer, protokolliere, mergeRessourcen } from '../core/abenteuer.js';
import { ladeBogenFrisch, waehleCharakterBogen } from '../core/bogen-laden.js';
import { getAbenteuer, setAbenteuer, setDb, speichere, speichereMitBogen } from '../abenteuer/state.js';
import * as reiterHub from '../ui/reiter-hub.js';
import { liveSpielScreen, charakterstatusScreen } from '../abenteuer/live-spiel.js';
import { charakterbogenScreen } from '../abenteuer/charakterbogen.js';
import { inventarScreen } from '../abenteuer/inventar.js';
import { notizenScreen } from '../abenteuer/notizen.js';
import { mitspielerScreen } from '../abenteuer/mitspieler.js';
import { regelnMenuScreen } from './regeln-menu.js';
import { neuberechne, verfuegbareEP, createCharakter } from '../core/character.js';
import { zeigeEP, versteckeEP } from '../ui/ep-anzeige.js';
import { audioBereichScreen } from '../meister/audio-bereich.js';

const ipc = window.skularis?.ipc;

// Einstiegs-Bildschirm; beim Verlassen des Hubs kehrt der Fokus hierher zurück.
let _einstieg = null;

export function oeffne() {
  _einstieg = einstiegScreen();
  screen.push(_einstieg);
}

/** Einstieg: "Abenteuer erstellen" oben, darunter direkt alle Abenteuer. */
function einstiegScreen() {
  const scr = {
    title: 'Abenteuer-Tisch',
    _liste: null,
    async ladeListe() {
      try { scr._liste = await ipc.abenteuerListe(); } catch { scr._liste = []; }
      screen.refresh();
    },
    build() {
      const items = [{ label: 'Abenteuer erstellen', hint: 'Name und Charakter wählen', onSelect: erstellen }];
      for (const a of (scr._liste || [])) {
        items.push({ label: a.name, hint: 'Öffnen oder löschen', onSelect: () => screen.push(abenteuerEintragScreen(a)) });
      }
      return menuScreen({
        title: 'Abenteuer-Tisch',
        subtitle: 'Oben erstellen, darunter deine Abenteuer. Escape kehrt zum Hauptmenü zurück.',
        items,
        leer: 'Noch keine Abenteuer. Oben eines erstellen.',
      }).build();
    },
    onShow() {
      // NUR beim ersten Anzeigen laden. ladeListe() ruft screen.refresh(), was
      // erneut onShow auslöst — ohne diese Bedingung entstünde eine Endlosschleife
      // und der Fokus käme nie auf einem Menüpunkt an (er fiele in die
      // Barrierefreiheits-Box). Nach Änderungen wird _liste extern auf null
      // gesetzt (erstellen/löschen/Rückkehr aus dem Hub), dann lädt es hier neu.
      if (scr._liste === null) scr.ladeListe();
      sprache.sage('Abenteuer-Tisch.');
    },
  };
  return scr;
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
        setDb(db);
        const res = await ipc.dateiDirektLaden(pfad);
        const char = parse(res.inhalt, db);
        char.dateiname = pfad;
        const charName = String(pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
        const a = createAbenteuer(char, name.trim(), charName, pfad);
        protokolliere(a, `Abenteuer erstellt mit Charakter ${char.name || charName}.`);
        setAbenteuer(a);
        await speichere();
        sounds.playSpeichern(); // wie beim Charakter-Speichern, nicht der schrille Öffnen-Ton
        oeffneHub();
        sprache.sage(`Abenteuer ${a.name} erstellt.`);
      } catch (e) {
        console.error('Abenteuer erstellen:', e);
        sprache.sage('Charakter konnte nicht geladen werden.');
      }
    },
  });
}

/** Ein Abenteuer öffnen: Bogen frisch laden (König), Zähler mischen, Hub öffnen. */
async function oeffneAbenteuer(eintrag) {
  try {
    const db = await ladeDb();
    setDb(db);
    const r = await ipc.abenteuerLaden(eintrag.pfad);
    const a = parseAbenteuer(r.inhalt);
    a._pfad = eintrag.pfad;

    if (a.charakterPfad) {
      const res = await ladeBogenFrisch(a.charakterPfad, db);
      if (res.ok) {
        a.charakter = res.bogen;                          // Bogen ist König
        a.ressourcen = mergeRessourcen(a.ressourcen, res.bogen); // Maxima neu, aktuell behalten
      } else {
        const w = await knopfDialog({
          titel: 'Charakterbogen fehlt',
          frage: `Der Charakterbogen zu ${a.charakterName || (a.charakter && a.charakter.name) || 'diesem Abenteuer'} wurde am gespeicherten Ort nicht gefunden.`,
          knoepfe: [
            { label: 'Alten Stand laden', wert: 'alt' },
            { label: 'Neuen Charakter laden', wert: 'neu' },
            { label: 'Ohne Charakter laden', wert: 'ohne' },
            { label: 'Abbrechen', wert: 'ab' },
          ],
        });
        if (w === 'neu') {
          const neu = await waehleCharakterBogen(db);
          if (!neu) return; // Auswahl abgebrochen
          a.charakterPfad = neu.pfad;
          a.charakterName = neu.name;
          a.charakter = neu.bogen;
          a.ressourcen = mergeRessourcen(a.ressourcen, neu.bogen);
        } else if (w === 'ohne') {
          // Ohne Charakter öffnen: leerer Bogen, keine Verknüpfung (kein Rückschreiben).
          a.charakter = createCharakter(db, { name: 'Ohne Charakter', gesamtEP: 0 });
          a.charakterPfad = '';
          a.charakterName = 'Ohne Charakter';
          a.ressourcen = mergeRessourcen(a.ressourcen, a.charakter);
        } else if (w !== 'alt') {
          return; // Abbrechen
        }
        // 'alt' → weiter mit dem eingebetteten Snapshot; Zähler unverändert.
      }
    }

    setAbenteuer(a);
    sounds.play('oeffnen', 0.7);     // 30 Prozent leiser beim Oeffnen eines Abenteuers
    oeffneHub();
  } catch (e) {
    console.error('Abenteuer laden:', e);
    sprache.sage('Abenteuer konnte nicht geladen werden.');
  }
}

/** Untermenü eines Abenteuers: Öffnen, Löschen. */
function abenteuerEintragScreen(eintrag) {
  return {
    title: eintrag.name,
    build() {
      return menuScreen({
        title: eintrag.name,
        subtitle: 'Escape zurück.',
        items: [
          { label: 'Öffnen', hint: 'Abenteuer öffnen zum Bearbeiten oder Spielen', onSelect: () => oeffneAbenteuer(eintrag) },
          {
            label: 'Umbenennen',
            onSelect: async () => {
              const neu = await textDialog({ titel: 'Umbenennen', label: 'Neuer Name', wert: eintrag.name });
              if (neu === null || !neu.trim() || neu.trim() === eintrag.name) return;
              try {
                const r = await ipc.abenteuerLaden(eintrag.pfad);
                const a = parseAbenteuer(r.inhalt);
                a.name = neu.trim();
                const s = await ipc.abenteuerSpeichern({ name: a.name, inhalt: JSON.stringify(a, null, 2) });
                if (s && s.pfad && s.pfad !== eintrag.pfad) { try { await ipc.abenteuerLoeschen(eintrag.pfad); } catch { /* egal */ } }
                if (_einstieg) _einstieg._liste = null;
                sounds.playSpeichern();
                screen.pop();
                sprache.sage(`Umbenannt in ${a.name}.`);
              } catch (e) { console.error('Abenteuer umbenennen:', e); sprache.sage('Umbenennen fehlgeschlagen.'); }
            },
          },
          {
            label: 'Löschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Löschen', frage: `Abenteuer ${eintrag.name} wirklich löschen?` })) return;
              try { await ipc.abenteuerLoeschen(eintrag.pfad); } catch (e) { console.error('löschen:', e); }
              if (_einstieg) _einstieg._liste = null; // beim Zurück neu laden
              screen.pop();
              sprache.sage(`${eintrag.name} gelöscht.`);
            },
          },
        ],
      }).build();
    },
  };
}

// --- Hub ---

function oeffneHub() {
  const a = getAbenteuer();
  const titel = a.name;

  // Feste EP-Anzeige unten mittig einblenden (ein Charakter geladen).
  const cha = a.charakter;
  if (cha && cha.erfahrung) {
    let frei = 0;
    try { const db = getDb(); if (db) { neuberechne(cha, db); frei = verfuegbareEP(cha); } } catch { /* Anzeige ist nur optisch */ }
    zeigeEP(frei, cha.erfahrung.gesamt || 0);
  }

  let hub;
  const punkte = [
    { label: 'Meine Initiative-Phase', hint: 'Würfeln, Aktionen, Kämpfen, Manöver und Zauber', factory: () => liveSpielScreen() },
    { label: 'Charakterstatus', hint: 'Wunden, Energien, Werte zum Lesen', factory: () => charakterstatusScreen() },
    { label: 'Charakterbogen', hint: 'Werte ansehen, Schnellauskunft', factory: () => charakterbogenScreen() },
    { label: 'Inventar', hint: 'Geldbörse und Gegenstände (am Mann, Rucksack)', factory: () => inventarScreen() },
    { label: 'Notizen und Tagebuch', factory: () => notizenScreen() },
    { label: 'Mitspieler', factory: () => mitspielerScreen() },
    { label: 'Protokoll', hint: 'Was im Abenteuer passiert ist', factory: () => protokollScreenSpieler() },
    {
      label: 'Regeln',
      hint: 'Kurzregelfilter und das ganze Ilaris-Regelwerk',
      factory: () => regelnMenuScreen({ db: getDb(), charakter: getAbenteuer()?.charakter || null }),
    },
    { label: 'Spielfeld', hint: 'kommt in einer späteren Version', factory: () => spielfeldScreen() },
    { label: 'Audio', hint: 'Radio-Lautstärke und den Tisch des Meisters anhören', festeTaste: 12, factory: () => audioBereichScreen('spieler') },
    // Aktionen ohne F-Taste (nur per Eingabetaste):
    { label: 'Zwischenspeichern', hint: 'Spielstand sichern, Gold und Inventar auf den Bogen', aktion: async () => { await speichereMitBogen(); sounds.playSpeichern(); sprache.sage('Zwischengespeichert.'); } },
    { label: 'Abenteuer speichern und zurück', aktion: () => speichernUndZurueck(hub) },
  ];

  hub = reiterHub.oeffneHub({
    titel, subtitle: 'Mit F1 bis F12 direkt zum Menü. Escape verlässt das Abenteuer.', punkte,
    bereich: 'abenteuer',
    zurueckAuf: _einstieg,
    beimVerlassen: async () => {
      sounds.play('esc_verlassen'); // ESC-/Verlassen-Menue
      const w = await knopfDialog({
        titel: 'Abenteuer verlassen',
        knoepfe: [
          { label: 'Speichern und schließen', wert: 'ja' },
          { label: 'Schließen ohne Speichern', wert: 'nein' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (w === 'ja') { await speichereMitBogen(); sounds.playSpeichern(); }
      if (w === 'ja' || w === 'nein') { versteckeEP(); setAbenteuer(null); if (_einstieg) _einstieg._liste = null; }
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
      const items = a.protokoll.map((p, i) => ({ label: `${a.protokoll.length - i}. ${p.text}`, detail: p.zeit || '', onSelect: () => {} }));
      return menuScreen({ title: 'Protokoll', subtitle: 'Neueste oben. Escape zurück.', items, leer: 'Noch keine Einträge.' }).build();
    },
  };
}

async function speichernUndZurueck(hub) {
  await speichereMitBogen();
  sounds.playSpeichern();
  sprache.sage('Abenteuer gespeichert.');
  versteckeEP();
  setAbenteuer(null);
  if (hub) hub.verlasse(); else screen.pop();
}
