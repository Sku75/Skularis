/**
 * Skularistool — Meister-Tisch (dritter Hauptbereich).
 *
 * Aufbau: Der Meister-Datensatz ist König. Beim ÖFFNEN werden die Charakterbögen
 * der Gruppe frisch von der Platte gelesen und ihre eingebetteten Kopien
 * aktualisiert (nur Bogen-Werte: Attribute, Talente, Waffen …). Fehlt ein Bogen,
 * fragt der Tisch: mit altem Datensatz weiter oder Charakter entfernen. Zähler
 * (Wunden, Erschöpfung) und alle übrigen Informationen bleiben im Meister-
 * Datensatz; gespeichert wird NUR dieser — nie ein Charakterbogen.
 *
 * Menü: eine Ebene — oben "Meisterabenteuer erstellen", darunter direkt alle
 * Meisterabenteuer; je Eintrag ein Untermenü mit "Öffnen" und "Löschen".
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, knopfDialog, jaNeinDialog, spinnerDialog, erschwernisDialog } from '../ui/dialog.js';
import { zeigeErgebnis } from '../abenteuer/wuerfel-kern.js';
import * as reiterHub from '../ui/reiter-hub.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { createMeisterAbenteuer, parseMeisterAbenteuer, protokolliere } from '../core/meister-abenteuer.js';
import { ladeBogenFrisch, waehleCharakterBogen } from '../core/bogen-laden.js';
import { getMeister, setMeister, speichere } from '../meister/state.js';
import { gruppenzusammenstellungScreen } from '../meister/gruppe.js';
import { spielerinfosScreen } from '../meister/spielerinfos.js';
import { gruppenrechercheScreen, gruppenprobeScreen } from '../meister/gruppenrecherche.js';
import { gegnerkarteiScreen } from '../meister/gegnerkartei.js';
import { gegnerBibliothekScreen } from '../meister/gegner-bibliothek.js';
import { szenenBereichScreen } from '../meister/szenen-spielen.js';
import { meisterNotizenScreen } from '../meister/notizen.js';
import { audioBereichScreen } from '../meister/audio-bereich.js';
import { regelnMenuScreen } from './regeln-menu.js';
import { versteckeEP } from '../ui/ep-anzeige.js';

const ipc = window.skularis?.ipc;

// Einstiegs-Bildschirm des Meister-Tisches; beim Verlassen des Hubs kehrt der
// Fokus hierher zurueck (nicht in ein Zwischenmenue).
let _einstieg = null;

export function oeffne() {
  versteckeEP(); // Meistertisch führt mehrere Helden — keine Einzel-EP-Anzeige.
  _einstieg = einstiegScreen();
  screen.push(_einstieg);
}

/** Einstieg: "Meisterabenteuer erstellen" oben, darunter direkt alle Datensätze. */
function einstiegScreen() {
  const scr = {
    title: 'Meister-Tisch',
    _liste: null,
    async ladeListe() {
      try { scr._liste = await ipc.meisterListe(); } catch { scr._liste = []; }
      screen.refresh();
    },
    build() {
      const items = [{ label: 'Meisterabenteuer erstellen', hint: 'Name eingeben, dann Helden hinzufügen', onSelect: erstellen }];
      for (const a of (scr._liste || [])) {
        items.push({ label: a.name, hint: 'Öffnen oder löschen', onSelect: () => screen.push(meisterEintragScreen(a)) });
      }
      return menuScreen({
        title: 'Meister-Tisch',
        subtitle: 'Oben erstellen, darunter deine Meisterabenteuer. Escape kehrt zum Hauptmenü zurück.',
        items,
        leer: 'Noch keine Meisterabenteuer. Oben eines erstellen.',
      }).build();
    },
    onShow() {
      // NUR beim ersten Anzeigen laden. ladeListe() ruft screen.refresh(), was
      // erneut onShow auslöst — ohne diese Bedingung entstünde eine Endlosschleife
      // und der Fokus käme nie auf einem Menüpunkt an (er fiele in die
      // Barrierefreiheits-Box). Nach Änderungen wird _liste extern auf null
      // gesetzt (erstellen/löschen/Rückkehr aus dem Hub), dann lädt es hier neu.
      if (scr._liste === null) scr.ladeListe();
      sprache.sage('Meister-Tisch.');
    },
  };
  return scr;
}

async function erstellen() {
  const name = await textDialog({ titel: 'Neues Meisterabenteuer', label: 'Name des Meisterabenteuers' });
  if (name === null || !name.trim()) return;
  try {
    await ladeDb();
    const a = createMeisterAbenteuer(name.trim());
    protokolliere(a, `Meisterabenteuer ${a.name} erstellt.`);
    setMeister(a);
    await speichere();
    sounds.playOeffnen();
    oeffneHub();
    sprache.sage(`Meisterabenteuer ${a.name} erstellt. Fuege unter Gruppenzusammenstellung deine Helden hinzu.`);
  } catch (e) {
    console.error('Meisterabenteuer erstellen:', e);
    sprache.sage('Meisterabenteuer konnte nicht erstellt werden.');
  }
}

/**
 * Die Bögen der Gruppe frisch von der Platte lesen und die eingebetteten Kopien
 * aktualisieren. Fehlende Bögen: pro Charakter nachfragen (alt weiter / entfernen).
 */
async function frischeBoegen(a, db) {
  const behalten = [];
  for (const c of (a.charaktere || [])) {
    const res = await ladeBogenFrisch(c.pfad, db);
    if (res.ok) { c.bogen = res.bogen; behalten.push(c); continue; }
    const w = await knopfDialog({
      titel: 'Charakterbogen fehlt',
      frage: `Der Charakterbogen zu ${c.name} wurde am gespeicherten Ort nicht gefunden.`,
      knoepfe: [
        { label: 'Alten Stand laden', wert: 'alt' },
        { label: 'Neuen Charakter laden', wert: 'neu' },
        { label: 'Ohne diesen Charakter', wert: 'ohne' },
        { label: 'Abbrechen', wert: 'ab' },
      ],
    });
    if (w === 'ab') return false; // gesamtes Öffnen abbrechen (a wird verworfen)
    if (w === 'neu') {
      const neu = await waehleCharakterBogen(db);
      if (!neu) { behalten.push(c); continue; } // Auswahl abgebrochen → alten behalten
      // Zähler/Notizen auf den neuen Namen mitnehmen (Name kann sich ändern).
      if (a.vitalitaet && a.vitalitaet[c.name] && !a.vitalitaet[neu.name]) { a.vitalitaet[neu.name] = a.vitalitaet[c.name]; delete a.vitalitaet[c.name]; }
      if (a.charNotizen && a.charNotizen[c.name] && !a.charNotizen[neu.name]) { a.charNotizen[neu.name] = a.charNotizen[c.name]; delete a.charNotizen[c.name]; }
      c.pfad = neu.pfad; c.name = neu.name; c.bogen = neu.bogen;
      behalten.push(c);
      continue;
    }
    if (w === 'ohne') {
      if (a.vitalitaet) delete a.vitalitaet[c.name];
      if (a.charNotizen) delete a.charNotizen[c.name];
      protokolliere(a, `${c.name} entfernt (Charakterbogen fehlt).`);
      continue; // nicht behalten
    }
    behalten.push(c); // 'alt' → mit altem, eingebettetem Bogen weiter
  }
  a.charaktere = behalten;
  return true;
}

async function oeffneMeister(eintrag) {
  try {
    const db = await ladeDb();
    const r = await ipc.meisterLaden(eintrag.pfad);
    const a = parseMeisterAbenteuer(r.inhalt);
    a._pfad = eintrag.pfad;
    const ok = await frischeBoegen(a, db); // Bogen-Werte auffrischen, fehlende klären
    if (!ok) { sprache.sage('Öffnen abgebrochen.'); return; } // Abbrechen: nichts laden
    setMeister(a);
    await speichere();               // aufgefrischten/bereinigten Stand sichern (nur Meister-JSON)
    sounds.playOeffnen();
    oeffneHub();
  } catch (e) {
    console.error('Meisterabenteuer laden:', e);
    sprache.sage('Meisterabenteuer konnte nicht geladen werden.');
  }
}

/** Untermenü eines Meisterabenteuers: Öffnen, Löschen. */
function meisterEintragScreen(eintrag) {
  return {
    title: eintrag.name,
    build() {
      return menuScreen({
        title: eintrag.name,
        subtitle: 'Escape zurück.',
        items: [
          { label: 'Öffnen', hint: 'Meisterabenteuer öffnen zum Bearbeiten oder Spielen', onSelect: () => oeffneMeister(eintrag) },
          {
            label: 'Löschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Löschen', frage: `Meisterabenteuer ${eintrag.name} wirklich löschen?` })) return;
              try { await ipc.meisterLoeschen(eintrag.pfad); } catch (e) { console.error('loeschen:', e); }
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

// --- Hub mit F-Tasten ---

function oeffneHub() {
  const a = getMeister();
  const titel = a.name;

  let hub;
  const regelHelden = () => (getMeister().charaktere || []).map(c => ({ name: c.name, charakter: c.bogen }));

  const punkte = [
    { label: 'Gruppenrecherche', hint: 'Werte der Gruppe abfragen und verdeckt wuerfeln', factory: () => gruppenrechercheScreen() },
    { label: 'Gruppenprobe', hint: 'die ganze Gruppe gegen eine Schwierigkeit', factory: () => gruppenprobeScreen() },
    { label: 'Kampfszene und Spieltisch', hint: 'Kampfszenenpacks vorbereiten, Kampfszenen spielen, freier Tisch', factory: () => szenenBereichScreen() },
    { label: 'Charakterboegen und Notizen', hint: 'Boegen der Gruppe, Vitalitaet und je Charakter Notizen', factory: () => spielerinfosScreen() },
    { label: 'Gegner-Bibliothek', hint: 'Gesamtliste und Kategorien, Gegner in die Auswahl uebernehmen', factory: () => gegnerBibliothekScreen() },
    { label: 'Freundliche NPC', hint: 'Meister-NPC verwalten', factory: () => gegnerkarteiScreen('freund') },
    { label: 'Meistertexte 1', hint: 'Abenteuertexte, geheime Notizen, Vorlesetexte, Zufallstabellen, Namen (erste Arbeitsflaeche)', factory: () => meisterNotizenScreen(1) },
    { label: 'Meistertexte 2', hint: 'dasselbe unabhaengig, mit eigenem Text-Ordner (zweite Arbeitsflaeche)', factory: () => meisterNotizenScreen(2) },
    { label: 'Regeln', hint: 'Kurzregelfilter und das ganze Ilaris-Regelwerk', factory: () => regelnMenuScreen({ db: getDb(), helden: regelHelden() }) },
    { label: 'Protokoll', hint: 'was im Abenteuer passiert ist', factory: () => protokollScreen() },
    { label: 'Gruppenzusammenstellung', hint: 'Helden hinzufuegen und entfernen', factory: () => gruppenzusammenstellungScreen() },
    { label: 'Audio', hint: 'Klaenge abspielen und ans Radio senden', festeTaste: 12, factory: () => audioBereichScreen('meister') },
    { label: 'Verdeckter Meister-Wurf', hint: 'schnell und leise wuerfeln', ergebnisId: 'meisterwurf', aktion: () => verdeckterMeisterWurf() },
    { label: 'Zwischenspeichern', hint: 'Spielstand sichern', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Zwischengespeichert.'); } },
    { label: 'Speichern und schliessen', hint: 'sichern und zum Meister-Tisch zurueck', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Gespeichert.'); if (_einstieg) _einstieg._liste = null; hub.verlasse(); } },
  ];

  hub = reiterHub.oeffneHub({
    titel, subtitle: 'Mit F1 bis F12 direkt zum Menue. Escape verlaesst den Bereich.', punkte,
    zurueckAuf: _einstieg,
    beimVerlassen: async () => {
      const w = await knopfDialog({
        titel: 'Meister-Tisch verlassen',
        knoepfe: [
          { label: 'Speichern und schliessen', wert: 'ja' },
          { label: 'Schliessen ohne Speichern', wert: 'nein' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (w === 'ja') { await speichere(); sounds.playSpeichern(); }
      if (w === 'ja' || w === 'nein') { if (_einstieg) _einstieg._liste = null; }
      return w || 'abbrechen';
    },
  });
}

function protokollScreen() {
  return {
    title: 'Protokoll',
    build() {
      const a = getMeister();
      const prot = a.protokoll || [];
      const items = prot.map((p, i) => ({ label: `${prot.length - i}. ${p.text}`, detail: p.zeit || '', onSelect: () => {} }));
      return menuScreen({ title: 'Protokoll', subtitle: 'Neueste oben. Escape zurueck.', items, leer: 'Noch keine Eintraege.' }).build();
    },
  };
}

async function verdeckterMeisterWurf() {
  const anzahl = await spinnerDialog({ titel: 'Anzahl Wuerfel', optionen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], index: 0, format: (v) => `${v} Wuerfel` });
  if (anzahl === null) return;
  const seiten = await spinnerDialog({ titel: 'Wuerfeltyp', optionen: [6, 20], index: 1, format: (v) => `W${v}` });
  if (seiten === null) return;
  const ersch = await erschwernisDialog({ titel: 'Erschwernis', wert: 0 });
  if (ersch === null) return;

  const a = getMeister();
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) - ersch; // Erschwernis positiv = Abzug
  sounds.playWuerfel();
  const erschText = ersch ? (ersch > 0 ? `, Erschwernis minus ${ersch}` : `, Erleichterung plus ${-ersch}`) : '';
  const ansage = `Verdeckt. Ergebnis ${summe}. ${anzahl} W ${seiten}, ${wuerfe.join(', ')}${erschText}.`;
  protokolliere(a, `Verdeckter Meister-Wurf: ${anzahl} W ${seiten} ${wuerfe.join(', ')}${erschText}, Ergebnis ${summe}.`);
  speichere();
  zeigeErgebnis('meisterwurf', `Ergebnis ${summe}`, ansage);
  sprache.sage(ansage);
}
