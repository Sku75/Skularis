/**
 * Skularis — kleine automatische Pruefung der Rechen- und Datenlogik (headless).
 * Prueft nur Module ohne DOM/Fenster-Abhaengigkeit. Bricht mit Code 1 ab, wenn
 * etwas nicht stimmt, damit kuenftige Aenderungen nichts Stilles zerbrechen.
 *
 * Aufruf: node _test/logik-check.mjs
 */
import { BESTIARIUM } from '../renderer/js/daten/gegner-bestiarium.js';
import {
  createMeisterAbenteuer, parseMeisterAbenteuer, statblockAusVorlage,
  baueSpielerKarte, baueStatblockKarte, angriffText, angriffeText, naechsteId,
} from '../renderer/js/core/meister-abenteuer.js';

let fehler = 0;
function pruefe(bedingung, text) { if (!bedingung) { console.error('FEHLGESCHLAGEN:', text); fehler++; } }

// --- Bestiarium ---
let gesamt = 0;
pruefe(Array.isArray(BESTIARIUM) && BESTIARIUM.length >= 5, 'Bestiarium hat mindestens 5 Kategorien');
for (const kat of BESTIARIUM) {
  pruefe(!!kat.kategorie, 'Kategorie hat einen Namen');
  pruefe(Array.isArray(kat.gegner) && kat.gegner.length > 0, `Kategorie ${kat.kategorie} hat Gegner`);
  for (const g of kat.gegner) {
    gesamt++;
    pruefe(!!g.name, 'Gegner hat Namen');
    pruefe(g.ws > 0, `${g.name}: Wundschwelle > 0`);
    pruefe(Array.isArray(g.angriffe) && g.angriffe.length > 0, `${g.name}: hat Angriffe`);
    for (const an of g.angriffe) {
      pruefe(!!an.name, `${g.name}: Angriff hat Namen`);
      pruefe(an.at != null, `${g.name}: Angriff hat Attacke`);
      pruefe(an.wuerfel >= 0 && an.seiten > 0, `${g.name}: Angriff hat Schadenswuerfel`);
    }
  }
}

// --- Meisterabenteuer-Modell ---
const a = createMeisterAbenteuer('Test');
pruefe(a.typ === 'meister', 'createMeisterAbenteuer hat typ meister');
pruefe(Array.isArray(a.tisch.karten) && Array.isArray(a.szenen), 'Modell hat tisch.karten und szenen');

const vorlage = BESTIARIUM[0].gegner[0];
const sb = statblockAusVorlage(a, { ...vorlage, kategorie: BESTIARIUM[0].kategorie });
pruefe(typeof sb.id === 'number', 'statblockAusVorlage vergibt eine Id');
pruefe(sb.angriffe.length === (vorlage.angriffe || []).length, 'statblockAusVorlage kopiert die Angriffe');
pruefe(sb.angriffe !== vorlage.angriffe, 'statblockAusVorlage kopiert tief (kein geteiltes Array)');

const karte = baueStatblockKarte(a, sb, 'gegner');
pruefe(karte.art === 'gegner' && karte.wunden === 0, 'baueStatblockKarte setzt art und Wunden');
pruefe(typeof angriffeText(karte) === 'string' && angriffeText(karte).length > 0, 'angriffeText liefert Text');

const bogen = { name: 'Alrik', attribute: { KO: 4, MU: 5, GE: 3, KK: 4, IN: 3, KL: 2, CH: 3, FF: 2 }, fertigkeiten: {}, talente: [], vorteile: [], waffen: [], energien: {}, uebernatuerlich: {} };
const sk = baueSpielerKarte(a, bogen, null);
pruefe(sk.art === 'spieler' && sk.name === 'Alrik', 'baueSpielerKarte baut eine Heldenkarte');
pruefe(sk.ws === 5, 'baueSpielerKarte berechnet Wundschwelle (4 + KO/4 = 5)');

const i1 = naechsteId(a), i2 = naechsteId(a);
pruefe(i2 === i1 + 1, 'naechsteId steigt monoton');

// Round-trip
const b = parseMeisterAbenteuer(JSON.stringify(a));
pruefe(b.typ === 'meister' && Array.isArray(b.szenen), 'parseMeisterAbenteuer liest den Stand zurueck');

// angriffText unterstuetzt altes wert und neues at
pruefe(angriffText({ name: 'X', wert: 12, wuerfel: 1, seiten: 6, bonus: 2 }).includes('Attacke 12'), 'angriffText liest altes wert-Feld');
pruefe(angriffText({ name: 'Y', at: 13, pa: 11, wuerfel: 1, seiten: 6, bonus: 3 }).includes('Parade 11'), 'angriffText zeigt Parade');

if (fehler) { console.error(`\n${fehler} Pruefungen fehlgeschlagen.`); process.exit(1); }
console.log(`Logik-Check OK: ${BESTIARIUM.length} Kategorien, ${gesamt} Gegner, Datenmodell und Kartenbau stimmen.`);
