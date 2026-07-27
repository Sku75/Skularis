/**
 * Baut aus dem pdftotext-Volltext (Leseordnung, Formfeeds) eine strukturierte
 * Regel-Datendatei: Kapitel -> Überschriften -> Absätze.
 *
 * Die Struktur kommt aus dem Inhaltsverzeichnis (autoritativ, mit Seitenzahlen).
 * Im Fließtext werden die Überschriften per Reihenfolge-Abgleich verankert, damit
 * gleichlautende Wörter im Text keine falschen Treffer erzeugen.
 *
 *   Skularis.exe bau-regeln.mjs <voll.txt> <out.json>
 */
import fs from 'node:fs';

const [, , QUELL, ZIEL] = process.argv;
const roh = fs.readFileSync(QUELL, 'utf8').replace(/﻿/g, '');
const seiten = roh.split('\f');

function norm(s) {
  return String(s)
    .replace(/­/g, '')      // weiche Trennstriche
    .replace(/\s+/g, ' ')
    .trim();
}
const istZahl = (s) => /^\d{1,3}$/.test(s.trim());

// --- Body-Beginn finden: erste Seite, deren erste Zeile "Proben" ist. --------
let bodyStart = seiten.findIndex((s, i) => i >= 5 && norm(s.split('\n').find(z => z.trim()) || '') === 'Proben');
if (bodyStart < 0) { console.error('Body-Start nicht gefunden'); process.exit(1); }

// --- Inhaltsverzeichnis parsen ----------------------------------------------
const tocText = seiten.slice(0, bodyStart).join('\n');
const tocZeilen = tocText.split('\n');
let begonnen = false;
const kapitel = [];
let aktuell = null;
let pending = null;

for (const rawZeile of tocZeilen) {
  const z = norm(rawZeile);
  if (!z) continue;
  if (!begonnen) { if (z === 'Inhalt') begonnen = true; continue; }
  if (z === 'Inhalt') continue;

  // Ein oder mehrere Punktführungs-Einträge auf der Zeile: "Titel....7 Titel2...8"
  const treffer = [...z.matchAll(/([^.]+?)\s*\.{2,}\s*(\d{1,3})/g)];
  if (treffer.length && aktuell) {
    for (const m of treffer) {
      const titel = norm(m[1]);
      if (titel) aktuell.ueberschriften.push({ titel, seite: +m[2] });
    }
    continue;
  }
  if (istZahl(z)) {
    if (pending) {
      aktuell = { titel: pending, seite: +z, ueberschriften: [] };
      kapitel.push(aktuell);
      pending = null;
    }
    continue;
  }
  // Sonst: eine reine Textzeile ohne Punktführung -> Kapitel-Kandidat.
  pending = z;
}

// --- Fließtext strukturieren -------------------------------------------------
// Geordnete Liste aller TOC-Einträge in Dokumentreihenfolge.
const geordnet = [];
for (const k of kapitel) {
  geordnet.push({ art: 'kapitel', titel: k.titel, ref: k });
  for (const u of k.ueberschriften) geordnet.push({ art: 'ueberschrift', titel: u.titel, ref: u });
}

// Kapitel werden global (in Reihenfolge) abgeglichen, damit ein hängender
// Überschriften-Zeiger — etwa in der langen Zauberliste — nicht ganze Kapitel
// verschluckt. Der Index jedes Kapitels in geordnet[] dient als Sprungziel.
const kapitelIndex = [];
geordnet.forEach((e, i) => { if (e.art === 'kapitel') kapitelIndex.push({ i, titel: e.titel }); });
let naechstesKapitel = 0;

const ergebnis = [];
let kap = null;       // aktuelles Ausgabe-Kapitel
let absch = null;     // aktueller Abschnitt (Überschrift + Absätze)
let ptr = 0;

function neuerAbschnitt(titel) {
  absch = { titel, absaetze: [] };
  if (!kap) { kap = { titel: 'Ilaris', abschnitte: [] }; ergebnis.push(kap); }
  kap.abschnitte.push(absch);
}

for (let p = bodyStart; p < seiten.length; p++) {
  const zeilen = seiten[p].split('\n');
  for (const rawZeile of zeilen) {
    const z = norm(rawZeile);
    if (!z) continue;
    if (istZahl(z)) continue;               // Seitenzahl-Fußzeile

    // Erst: nächstes noch offenes Kapitel? (global, nicht nur im Fenster)
    if (naechstesKapitel < kapitelIndex.length && norm(kapitelIndex[naechstesKapitel].titel) === z) {
      const ki = kapitelIndex[naechstesKapitel];
      kap = { titel: ki.titel, abschnitte: [] };
      ergebnis.push(kap);
      absch = null;
      ptr = ki.i + 1;
      naechstesKapitel++;
      continue;
    }

    // Dann: passt die Zeile zu einer der nächsten Überschriften im Fenster?
    let k = -1;
    for (let i = ptr; i < Math.min(ptr + 8, geordnet.length); i++) {
      if (geordnet[i].art === 'kapitel') break;   // nicht über ein Kapitel hinweg
      if (norm(geordnet[i].titel) === z) { k = i; break; }
    }
    if (k >= 0) {
      ptr = k + 1;
      neuerAbschnitt(geordnet[k].titel);
      continue;
    }

    // Sonst: Absatztext.
    if (!absch) neuerAbschnitt('');          // Einleitungsabsätze vor erster Überschrift
    absch.absaetze.push(z);
  }
}

// --- Ausgabe -----------------------------------------------------------------
const daten = {
  titel: 'Ilaris Regelwerk',
  quelle: 'Ilaris, zweite Version. Copyright Ulisses Spiele GmbH. Freies Fan-Regelwerk.',
  kapitel: ergebnis.map(k => ({
    titel: k.titel,
    abschnitte: k.abschnitte.filter(a => a.absaetze.length || a.titel),
  })).filter(k => k.abschnitte.length),
};
// Als ES-Modul ausgeben, damit der Renderer es ohne Laufzeit-IO importieren kann.
const modul = '/**\n * Skularis — Ilaris-Regeldokument, aus der PDF extrahiert und strukturiert.\n'
  + ' * Automatisch erzeugt von _test/bau-regeln.mjs. Nicht von Hand bearbeiten.\n'
  + ' * Kapitel -> Abschnitte (Überschrift + Absätze). Freies Fan-Regelwerk Ilaris.\n'
  + ' */\n/* eslint-disable */\nexport const ILARIS = '
  + JSON.stringify(daten) + ';\n';
fs.writeFileSync(ZIEL, modul, 'utf8');

// --- Diagnose (keine Regeltexte) ---------------------------------------------
console.log('Body-Start Seitenindex:', bodyStart, '/', seiten.length, 'Seiten');
console.log('Kapitel im TOC:', kapitel.length);
console.log('Kapitel in Ausgabe:', daten.kapitel.length);
let ueb = 0, abs = 0;
for (const k of daten.kapitel) {
  ueb += k.abschnitte.length;
  for (const a of k.abschnitte) abs += a.absaetze.length;
}
console.log('Abschnitte gesamt:', ueb, ' Absätze gesamt:', abs);
console.log('Abgeglichene TOC-Einträge:', ptr, '/', geordnet.length);
console.log('--- Kapitel (Titel, Abschnitte, Absätze) ---');
for (const k of daten.kapitel) {
  const a = k.abschnitte.reduce((s, x) => s + x.absaetze.length, 0);
  console.log(`  ${k.titel}  —  ${k.abschnitte.length} Abschnitte, ${a} Absätze`);
}
