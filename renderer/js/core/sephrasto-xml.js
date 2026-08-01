/**
 * Skularis — Charakterdateien lesen und schreiben (Sephrasto-Format).
 *
 * ZIEL: Eine Datei muss in Skularis und in Sephrasto geöffnet und bearbeitet
 * werden können, beliebig oft hin und her, ohne dass etwas verloren geht.
 *
 * Dafür zwei Grundsätze:
 *
 * 1. Durchreichen. Beim Speichern wird die Originaldatei geparst und nur das
 *    ersetzt, was Skularis wirklich verwaltet. Alles andere bleibt Zeichen für
 *    Zeichen stehen: Notiz, Einstellungen, Plugins, Hausregeln, Geschlecht,
 *    Titel, Hintergrund0 bis 8, das Charakterbild und alles, was künftige
 *    Sephrasto-Versionen dazunehmen. Selbst innerhalb der Listen, die Skularis
 *    neu schreibt, werden vorhandene Elemente wiederverwendet, damit fremde
 *    Attribute (etwa variableKosten an einem Talent) erhalten bleiben.
 *
 * 2. Formatgeneration beibehalten. Sephrasto hat sein Dateiformat mehrfach
 *    geändert und rechnet alte Dateien beim Laden hoch (Migrationen.py).
 *    Skularis liest alle Generationen und schreibt in genau der Generation
 *    zurück, in der die Datei ankam. Ein neuer Charakter wird in Version 6
 *    angelegt: das ist die Version, die der Sephrasto des Projektinhabers
 *    schreibt, und neuere Sephrasto-Versionen rechnen sie beim Laden selbst hoch.
 *
 * Die Unterschiede der Generationen (aus Sephrasto/Migrationen.py):
 *   bis 4   Vorteile als Textinhalt, Talente in die Fertigkeit eingebettet,
 *           Waffen mit typ, ohne beSlot. Das ist das Format von Sephrasto 4.1
 *           und der mitgelieferten Erschaffungspakete.
 *   ab 5    Vorteile mit name-Attribut, Talente als eigener Block <Talente>
 *   ab 6    Waffen mit beSlot
 *   ab 7    Freie Fertigkeiten in einem eigenen Block <FreieFertigkeiten>
 *   ab 8    Attribute und Energien als <Attribut name= wert=> statt <KO>4</KO>
 *
 * Wohin die Skularis-Felder gehen, für die Sephrasto ein eigenes Feld hat:
 *   Aussehen        BeschreibungDetails: Grösse, Gewicht, Geburtsdatum,
 *                   Haarfarbe, Augenfarbe, Aussehen1 (Frisur und Bart),
 *                   Aussehen2 (besondere Merkmale)
 *   Eigenheiten     Beschreibung/Eigenheiten/Eigenheit, je eine Zeile Freitext.
 *                   Sephrasto speichert eine Eigenheit als einen einzigen Text,
 *                   deshalb werden die drei Skularis-Felder in eine Zeile
 *                   zusammengelegt (siehe eigenheitZuText).
 *   Kultur, Profession  BeschreibungDetails: Kultur, Profession
 */

import {
  createCharakter, ATTRIBUTE, BESCHREIBUNG_FELDER, AUSSEHEN_ZEILEN, HINTERGRUND_ZEILEN,
  leereZeilen, aktualisiereVorteilEffekte,
} from './character.js';
import { abgeleiteteWerte } from './regeln.js';
import {
  leseDokument, schreibeDokument, kind, kindOderNeu, textVon, zahlVon,
  setzeText, setzeTextFallsDa, leere, haengeAn, attributeVon,
} from './xml-dokument.js';

/** Generation, in der neue Charaktere angelegt werden. */
export const NEUE_CHARAKTER_VERSION = 6;

/** Datei ohne CharakterVersion ist das alte Sephrasto-4.1-Format. */
const VERSION_OHNE_ANGABE = 4;

const ENERGIEN = ['AsP', 'KaP', 'GuP'];

// --- Eigenheiten: drei Felder in eine Sephrasto-Zeile und zurück -----------

const TRENNER = ' | ';
const POSITIV = 'Positiv: ';
const NEGATIV = 'Negativ: ';

/** Eine Eigenheit als eine Zeile, wie Sephrasto sie speichert. */
export function eigenheitZuText(e) {
  const teile = [String(e?.name || '').trim()];
  if (e?.positiv) teile.push(POSITIV + String(e.positiv).trim());
  if (e?.negativ) teile.push(NEGATIV + String(e.negativ).trim());
  return teile.join(TRENNER);
}

/**
 * Eine Sephrasto-Zeile zurück in die drei Felder zerlegen. Was nicht dem Muster
 * folgt (weil es in Sephrasto von Hand geschrieben wurde), wird vollständig als
 * Name übernommen — verloren geht nie etwas.
 */
export function textZuEigenheit(text) {
  const roh = String(text || '').trim();
  if (!roh) return null;
  const teile = roh.split('|').map(t => t.trim());
  const e = { name: '', positiv: '', negativ: '' };
  const nameTeile = [];
  for (const t of teile) {
    if (t.startsWith(POSITIV.trim())) e.positiv = t.slice(POSITIV.trim().length).trim();
    else if (t.startsWith(NEGATIV.trim())) e.negativ = t.slice(NEGATIV.trim().length).trim();
    else nameTeile.push(t);
  }
  e.name = nameTeile.join(TRENNER);
  return e.name || e.positiv || e.negativ ? e : null;
}

// --- Formatgeneration -----------------------------------------------------

function leseVersion(root) {
  const v = kind(kind(root, 'Version'), 'CharakterVersion');
  const n = v ? parseInt(v.textContent, 10) : NaN;
  return Number.isNaN(n) ? VERSION_OHNE_ANGABE : n;
}

function form(version) {
  return {
    vorteilAlsAttribut: version >= 5,
    talenteEigenerBlock: version >= 5,
    waffeBeSlot: version >= 6,
    freieEigenerBlock: version >= 7,
    werteAlsAttribut: version >= 8,
  };
}

// --- Lesen ----------------------------------------------------------------

export function parse(xml, db) {
  const dok = leseDokument(xml);
  const root = dok.root;
  if (!root || root.tagName !== 'Charakter') throw new Error('Keine Ilaris-Charakterdatei.');

  const version = leseVersion(root);
  const f = form(version);
  const c = createCharakter(db);

  // Für das Durchreichen beim Speichern. Text statt DOM, damit der Charakter
  // weiterhin als JSON abgelegt werden kann (Abenteuer-Momentaufnahme).
  c._quellXml = xml;
  c._version = version;
  c._vorteilAttribute = {};
  c._talentAttribute = {};
  // Welche Talente im alten Format unter welcher Fertigkeit standen, in genau
  // dieser Reihenfolge — damit sie beim Speichern wieder dort landen.
  // Im Format ab Version 5 leer, dort gibt es nur den einen Talente-Block.
  c._talenteJeFertigkeit = {};

  // Eigene Skularis-Felder (Münzbörse, Spielinventar) aus dem SkularisDaten-Block.
  const sd = kind(root, 'SkularisDaten');
  if (sd && sd.textContent && sd.textContent.trim()) {
    try {
      const d = JSON.parse(sd.textContent);
      if (d.geldboerse) c.geldboerse = d.geldboerse;
      if (d.spielinventar) c.spielinventar = d.spielinventar;
      if (typeof d.startkapital === 'number') c.startkapital = d.startkapital;
      if (typeof d.astralspeicherStab === 'number') c.astralspeicherStab = d.astralspeicherStab;
    } catch { /* defekte eigene Daten ignorieren, Sephrasto-Teil bleibt gültig */ }
  }

  // Beschreibung
  const besch = kind(root, 'Beschreibung');
  c.name = textVon(besch, 'Name');
  c.spezies = textVon(besch, 'Spezies');
  c.heimat = textVon(besch, 'Heimat') || 'Mittelreich';
  c.finanzen = zahlVon(besch, 'Finanzen', 2);
  c.status = zahlVon(besch, 'Status', 2);
  c.kurzbeschreibung = textVon(besch, 'Kurzbeschreibung');

  c.eigenheiten = [];
  const eigBlock = kind(besch, 'Eigenheiten');
  if (eigBlock) {
    for (const el of Array.from(eigBlock.children)) {
      if (el.tagName !== 'Eigenheit') continue;
      // Dateien von Skularis 0.05 vor der Umstellung trugen die Aspekte als
      // Attribute. Die werden weiter gelesen, damit nichts verloren geht.
      const pos = el.getAttribute('positiv');
      const neg = el.getAttribute('negativ');
      if (pos !== null || neg !== null) {
        const name = (el.textContent || '').trim();
        if (name) c.eigenheiten.push({ name, positiv: pos || '', negativ: neg || '' });
        continue;
      }
      const e = textZuEigenheit(el.textContent);
      if (e) c.eigenheiten.push(e);
    }
  }

  // Attribute
  const at = kind(root, 'Attribute');
  if (f.werteAlsAttribut) {
    for (const el of Array.from(at ? at.children : [])) {
      const name = el.getAttribute('name');
      if (name && name in c.attribute) c.attribute[name] = parseInt(el.getAttribute('wert'), 10) || 0;
    }
  } else {
    for (const a of ATTRIBUTE) c.attribute[a] = zahlVon(at, a, 0);
  }

  // Energien
  const en = kind(root, 'Energien');
  for (const el of Array.from(en ? en.children : [])) {
    const name = f.werteAlsAttribut ? el.getAttribute('name') : el.tagName;
    if (!ENERGIEN.includes(name)) continue;
    c.energien[name] = { gekauft: parseInt(el.getAttribute('wert'), 10) || 0 };
  }

  // Vorteile. Sephrasto führt sie in einem Wörterbuch je Name, ein doppelt
  // eingetragener Vorteil zählt dort also nur einmal. Ein solcher Doppeleintrag
  // steckt zum Beispiel im Paket "Hesindegeweihte - Deinomache".
  c.vorteile = [];
  const vGesehen = new Set();
  const vBlock = kind(root, 'Vorteile');
  for (const el of Array.from(vBlock ? vBlock.children : [])) {
    if (el.tagName !== 'Vorteil') continue;
    const name = (f.vorteilAlsAttribut ? el.getAttribute('name') : el.textContent || '').trim();
    if (!name || vGesehen.has(name)) continue;
    vGesehen.add(name);
    c._vorteilAttribute[name] = attributeVon(el);
    const vk = el.getAttribute('variableKosten');
    if (vk !== null) {
      c.vorteile.push({ name, kosten: parseInt(vk, 10) || 0, kommentar: el.getAttribute('kommentar') || '' });
    } else {
      c.vorteile.push(name);
    }
  }

  // Fertigkeiten (und bis Version 6 die freien Fertigkeiten im selben Block)
  c.fertigkeiten = {};
  c.freieFertigkeiten = [];
  const fBlock = kind(root, 'Fertigkeiten');
  for (const el of Array.from(fBlock ? fBlock.children : [])) {
    if (el.tagName === 'Fertigkeit') {
      const fname = el.getAttribute('name');
      c.fertigkeiten[fname] = { wert: parseInt(el.getAttribute('wert'), 10) || 0 };
      eingebetteteTalente(el, c, fname);
    } else if (el.tagName === 'FreieFertigkeit') {
      c.freieFertigkeiten.push({
        name: el.getAttribute('name') || '',
        wert: parseInt(el.getAttribute('wert'), 10) || 0,
      });
    }
  }
  const ffBlock = kind(root, 'FreieFertigkeiten');
  for (const el of Array.from(ffBlock ? ffBlock.children : [])) {
    if (el.tagName !== 'FreieFertigkeit') continue;
    c.freieFertigkeiten.push({
      name: el.getAttribute('name') || '',
      wert: parseInt(el.getAttribute('wert'), 10) || 0,
    });
  }

  // Übernatürliche Fertigkeiten
  c.uebernatuerlich = {};
  const uBlock = kind(root, 'ÜbernatürlicheFertigkeiten');
  for (const el of Array.from(uBlock ? uBlock.children : [])) {
    if (el.tagName !== 'ÜbernatürlicheFertigkeit') continue;
    const uname = el.getAttribute('name');
    c.uebernatuerlich[uname] = { wert: parseInt(el.getAttribute('wert'), 10) || 0 };
    eingebetteteTalente(el, c, uname);
  }

  // Talente als eigener Block (ab Version 5). Sie kommen in eine einzige Liste
  // am Charakter, genau wie in Sephrasto; angezeigt werden sie später unter
  // jeder Fertigkeit, zu der sie laut Datenbank gehören.
  if (f.talenteEigenerBlock) {
    const tBlock = kind(root, 'Talente');
    for (const el of Array.from(tBlock ? tBlock.children : [])) {
      if (el.tagName !== 'Talent') continue;
      const name = el.getAttribute('name');
      if (!name) continue;
      merkeTalent(c, el, name);
    }
  }

  // Objekte
  const obj = kind(root, 'Objekte');
  c.ruestungen = [];
  c.waffen = [];
  c.ausruestung = [];
  const rBlock = kind(obj, 'Rüstungen');
  for (const el of Array.from(rBlock ? rBlock.children : [])) {
    if (el.tagName !== 'Rüstung') continue;
    c.ruestungen.push({
      name: el.getAttribute('name') || '',
      be: parseInt(el.getAttribute('be'), 10) || 0,
      rs: el.getAttribute('rs') || '0/0/0/0/0/0',
      _attr: attributeVon(el),
    });
  }
  const wBlock = kind(obj, 'Waffen');
  for (const el of Array.from(wBlock ? wBlock.children : [])) {
    if (el.tagName !== 'Waffe') continue;
    c.waffen.push({
      name: el.getAttribute('name') || '',
      id: el.getAttribute('id') || el.getAttribute('name') || '',
      wuerfel: parseInt(el.getAttribute('würfel'), 10) || 0,
      wuerfelSeiten: parseInt(el.getAttribute('würfelSeiten'), 10) || 6,
      plus: parseInt(el.getAttribute('plus'), 10) || 0,
      eigenschaften: el.getAttribute('eigenschaften') || '',
      haerte: parseInt(el.getAttribute('härte'), 10) || 6,
      rw: parseInt(el.getAttribute('rw'), 10) || 0,
      kampfstil: el.getAttribute('kampfstil') || '',
      wm: parseInt(el.getAttribute('wm'), 10) || 0,
      typ: el.getAttribute('typ') || 'Nah',
      _attr: attributeVon(el),
    });
  }
  const aBlock = kind(obj, 'Ausrüstung');
  for (const el of Array.from(aBlock ? aBlock.children : [])) {
    if (el.tagName !== 'Ausrüstungsstück') continue;
    c.ausruestung.push(el.textContent || '');
  }

  // Erfahrung
  const erf = kind(root, 'Erfahrung');
  c.erfahrung = { gesamt: zahlVon(erf, 'Gesamt', 0), ausgegeben: zahlVon(erf, 'Ausgegeben', 0) };

  // Einstellung, ob Voraussetzungen durchgesetzt werden (Hausregel-Schalter).
  const einst = kind(root, 'Einstellungen');
  c.voraussetzungenPruefen = textVon(einst, 'VoraussetzungenPrüfen', '1') !== '0';

  // Beschreibungsdetails: die neun Einzelfelder, sechs Aussehen-Zeilen,
  // neun Hintergrund-Zeilen.
  c.aussehen = leereZeilen(AUSSEHEN_ZEILEN.length);
  c.hintergrund = leereZeilen(HINTERGRUND_ZEILEN.length);
  const bd = kind(root, 'BeschreibungDetails');
  if (bd) {
    c.kultur = textVon(bd, 'Kultur');
    c.profession = textVon(bd, 'Profession');
    for (const feld of BESCHREIBUNG_FELDER) c[feld.key] = textVon(bd, feld.ziel, '');
    for (let i = 0; i < AUSSEHEN_ZEILEN.length; i++) c.aussehen[i] = textVon(bd, `Aussehen${i + 1}`, '');
    for (let i = 0; i < HINTERGRUND_ZEILEN.length; i++) c.hintergrund[i] = textVon(bd, `Hintergrund${i}`, '');
  }
  // Dateien von Skularis 0.05 vor der Umstellung: eigener Aussehen-Block mit
  // erfundenen Elementnamen. Nur noch lesen, beim Speichern verschwindet er.
  const altAussehen = kind(besch, 'Aussehen');
  if (altAussehen) {
    for (const feld of BESCHREIBUNG_FELDER) {
      if (feld.altXml && !c[feld.key]) c[feld.key] = textVon(altAussehen, feld.altXml, '');
    }
    if (!c.aussehen[0]) c.aussehen[0] = textVon(altAussehen, 'FrisurUndBart', '');
    if (!c.aussehen[1]) c.aussehen[1] = textVon(altAussehen, 'BesondereMerkmale', '');
  }

  aktualisiereVorteilEffekte(c, db);
  return c;
}

/**
 * Talente, die in eine Fertigkeit eingebettet sind (Format bis Version 4).
 * Sie landen in der globalen Liste; wo sie standen, wird gemerkt, damit sie
 * beim Speichern wieder genau dort erscheinen.
 */
function eingebetteteTalente(el, c, fname) {
  const t = kind(el, 'Talente');
  if (!t) return;
  for (const x of Array.from(t.children)) {
    if (x.tagName !== 'Talent') continue;
    const name = x.getAttribute('name');
    if (!name) continue;
    merkeTalent(c, x, name);
    if (!c._talenteJeFertigkeit[fname]) c._talenteJeFertigkeit[fname] = [];
    if (!c._talenteJeFertigkeit[fname].includes(name)) c._talenteJeFertigkeit[fname].push(name);
  }
}

/** Kosten, Kommentar und alle übrigen Attribute eines Talents festhalten. */
function merkeTalent(c, el, name) {
  c._talentAttribute[name] = attributeVon(el);
  const vk = el.getAttribute('variableKosten');
  if (vk !== null) c.talentKosten[name] = parseInt(vk, 10) || 0;
  const kom = el.getAttribute('kommentar');
  if (kom !== null) c.talentKommentar[name] = kom;
  if (!c.talente.includes(name)) c.talente.push(name);
}

/**
 * Welche Talente des Charakters unter dieser Fertigkeit geschrieben werden, in
 * welcher Reihenfolge. Was in der Quelldatei schon hier stand, behält seinen
 * Platz; alles Neue wird hinten angehängt, wenn es laut Datenbank hierher gehört.
 */
function talenteUnter(c, db, fname) {
  const vorhanden = c.talente || [];
  const jeFertigkeit = c._talenteJeFertigkeit || {};
  const liste = [];

  // Was in der Quelldatei schon hier stand, bleibt hier und behält die Reihenfolge.
  for (const n of jeFertigkeit[fname] || []) {
    if (vorhanden.includes(n) && !liste.includes(n)) liste.push(n);
  }

  // Neue Talente kommen an genau eine Stelle, nicht unter jede Fertigkeit, zu
  // der sie gehören. Sephrasto hat das im alten Format ebenso gehandhabt.
  for (const n of vorhanden) {
    if (liste.includes(n)) continue;
    if (Object.values(jeFertigkeit).some(liste2 => liste2.includes(n))) continue;
    if (stelleFuerNeuesTalent(c, db, n) === fname) liste.push(n);
  }
  return liste;
}

/** Unter welcher Fertigkeit ein neu hinzugekommenes Talent geschrieben wird. */
function stelleFuerNeuesTalent(c, db, name) {
  const gehoert = db.talentByName[name]?.fertigkeiten || [];
  // Bevorzugt die primäre Fertigkeit, sonst die erste, die der Charakter hat.
  for (const f of gehoert) {
    if (c.fertigkeiten[f] || c.uebernatuerlich[f]) return f;
  }
  return gehoert[0] || null;
}

/**
 * Die Attribute, mit denen ein Talent geschrieben wird. Reihenfolge wie in
 * Sephrasto (Talent.serialize): name, variableKosten, kommentar, Übriges.
 */
function talentAttribute(c, db, name) {
  const def = db.talentByName[name];
  const attr = { ...((c._talentAttribute || {})[name] || {}) };
  attr.name = name;
  if (def && def.variableKosten) {
    attr.variableKosten = Object.prototype.hasOwnProperty.call(c.talentKosten || {}, name)
      ? c.talentKosten[name] : def.kosten;
  } else {
    delete attr.variableKosten;
  }
  if (def && def.kommentar) {
    attr.kommentar = Object.prototype.hasOwnProperty.call(c.talentKommentar || {}, name)
      ? c.talentKommentar[name] : '';
  } else {
    delete attr.kommentar;
  }
  return attr;
}


// --- Schreiben ------------------------------------------------------------

export function serialisiere(c, db) {
  aktualisiereVorteilEffekte(c, db);

  const dok = leseDokument(c._quellXml || vorlage());
  const root = dok.root;
  const version = leseVersion(root);
  const f = form(version);

  schreibeBeschreibung(root, c);
  schreibeAttribute(root, c, f);
  schreibeEnergien(root, c, f);
  schreibeVorteile(root, c, f);
  schreibeFertigkeiten(root, c, db, f);
  schreibeTalente(root, c, db, f);
  schreibeUebernatuerlich(root, c, db, f);
  schreibeObjekte(root, c, f);
  schreibeErfahrung(root, c);
  schreibeBeschreibungDetails(root, c);
  schreibeSkularisDaten(root, c);

  const xml = schreibeDokument(dok);
  // Die eigene Quelle nachziehen, damit ein zweites Speichern auf dem
  // aktuellen Stand aufsetzt.
  c._quellXml = xml;
  return xml;
}

function schreibeBeschreibung(root, c) {
  const besch = kindOderNeu(root, 'Beschreibung');
  setzeText(besch, 'Name', c.name);
  setzeText(besch, 'Spezies', c.spezies);
  setzeText(besch, 'Status', c.status ?? 2);
  setzeText(besch, 'Kurzbeschreibung', c.kurzbeschreibung);
  setzeText(besch, 'Finanzen', c.finanzen ?? 2);
  setzeText(besch, 'Heimat', c.heimat);
  // SchiP kennt nur das alte Format; dort wird es aktuell gehalten, sonst nicht
  // neu angelegt (Sephrasto ab Version 5 berechnet es selbst).
  setzeTextFallsDa(besch, 'SchiP', abgeleiteteWerte(c).SchiP);

  const eig = kindOderNeu(besch, 'Eigenheiten');
  leere(eig);
  for (const e of c.eigenheiten || []) {
    const text = eigenheitZuText(e);
    if (text) haengeAn(eig, 'Eigenheit', {}, text);
  }

  // Der eigene Aussehen-Block aus Skularis 0.05 wird nicht mehr geschrieben,
  // die Inhalte stehen jetzt in BeschreibungDetails.
  const alt = kind(besch, 'Aussehen');
  if (alt) besch.removeChild(alt);
}

function schreibeAttribute(root, c, f) {
  const at = kindOderNeu(root, 'Attribute');
  if (f.werteAlsAttribut) {
    const vorhanden = new Map();
    for (const el of Array.from(at.children)) vorhanden.set(el.getAttribute('name'), el);
    leere(at);
    for (const a of ATTRIBUTE) {
      const el = vorhanden.get(a) || at.ownerDocument.createElement('Attribut');
      el.setAttribute('name', a);
      el.setAttribute('wert', String(c.attribute[a] || 0));
      at.appendChild(el);
    }
  } else {
    for (const a of ATTRIBUTE) setzeText(at, a, c.attribute[a] || 0);
  }
}

function schreibeEnergien(root, c, f) {
  const en = kindOderNeu(root, 'Energien');
  const vorhanden = new Map();
  for (const el of Array.from(en.children)) {
    vorhanden.set(f.werteAlsAttribut ? el.getAttribute('name') : el.tagName, el);
  }
  leere(en);
  for (const name of ENERGIEN) {
    const eintrag = c.energien && c.energien[name];
    const gekauft = eintrag ? (eintrag.gekauft || 0) : 0;
    // Energien, die in der Datei standen, bleiben erhalten; neue kommen nur
    // dazu, wenn wirklich Punkte gekauft wurden.
    if (!vorhanden.has(name) && !gekauft) continue;
    const el = vorhanden.get(name)
      || en.ownerDocument.createElement(f.werteAlsAttribut ? 'Energie' : name);
    if (f.werteAlsAttribut) el.setAttribute('name', name);
    el.setAttribute('wert', String(gekauft));
    en.appendChild(el);
  }
}

function schreibeVorteile(root, c, f) {
  const block = kindOderNeu(root, 'Vorteile');
  const vorhanden = new Map();
  for (const el of Array.from(block.children)) {
    if (el.tagName !== 'Vorteil') continue;
    const name = (f.vorteilAlsAttribut ? el.getAttribute('name') : el.textContent || '').trim();
    if (name) vorhanden.set(name, el);
  }
  leere(block);

  for (const eintrag of c.vorteile || []) {
    const name = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const el = vorhanden.get(name) || block.ownerDocument.createElement('Vorteil');
    if (f.vorteilAlsAttribut) {
      el.setAttribute('name', name);
      el.textContent = '';
    } else {
      el.removeAttribute('name');
      el.textContent = name;
    }
    if (typeof eintrag === 'object') {
      if (typeof eintrag.kosten === 'number') el.setAttribute('variableKosten', String(eintrag.kosten));
      if (eintrag.kommentar) el.setAttribute('kommentar', eintrag.kommentar);
      else if (el.hasAttribute('kommentar') && !eintrag.kommentar) el.setAttribute('kommentar', '');
    }
    block.appendChild(el);
  }
}

function schreibeFertigkeiten(root, c, db, f) {
  const block = kindOderNeu(root, 'Fertigkeiten');
  const vorhanden = new Map();
  for (const el of Array.from(block.children)) {
    if (el.tagName === 'Fertigkeit') vorhanden.set(el.getAttribute('name'), el);
  }
  leere(block);

  for (const fdef of db.fertigkeiten) {
    const eintrag = c.fertigkeiten[fdef.name] || { wert: 0 };
    const el = vorhanden.get(fdef.name) || block.ownerDocument.createElement('Fertigkeit');
    el.setAttribute('name', fdef.name);
    el.setAttribute('wert', String(eintrag.wert || 0));
    if (f.talenteEigenerBlock) {
      const t = kind(el, 'Talente');
      if (t) el.removeChild(t);
    } else {
      const t = leere(kindOderNeu(el, 'Talente'));
      for (const name of talenteUnter(c, db, fdef.name)) {
        haengeAn(t, 'Talent', talentAttribute(c, db, name));
      }
    }
    block.appendChild(el);
  }

  // Freie Fertigkeiten: bis Version 6 im selben Block, ab Version 7 eigener.
  const ziel = f.freieEigenerBlock ? kindOderNeu(root, 'FreieFertigkeiten') : block;
  if (f.freieEigenerBlock) leere(ziel);
  for (const ff of c.freieFertigkeiten || []) {
    haengeAn(ziel, 'FreieFertigkeit', { name: ff.name || '', wert: ff.wert || 0 });
  }
}

function schreibeTalente(root, c, db, f) {
  if (!f.talenteEigenerBlock) {
    const alt = kind(root, 'Talente');
    if (alt) root.removeChild(alt);
    return;
  }

  const block = kindOderNeu(root, 'Talente');
  const vorhanden = new Map();
  for (const el of Array.from(block.children)) {
    if (el.tagName === 'Talent') vorhanden.set(el.getAttribute('name'), el);
  }
  leere(block);

  // Die Liste des Charakters hält die Reihenfolge der Quelldatei bereits ein.
  for (const name of c.talente || []) {
    const el = vorhanden.get(name) || block.ownerDocument.createElement('Talent');
    for (const [k, v] of Object.entries(talentAttribute(c, db, name))) el.setAttribute(k, String(v));
    if (!db.talentByName[name]?.variableKosten) el.removeAttribute('variableKosten');
    if (!db.talentByName[name]?.kommentar) el.removeAttribute('kommentar');
    block.appendChild(el);
  }
}

function schreibeUebernatuerlich(root, c, db, f) {
  const block = kindOderNeu(root, 'ÜbernatürlicheFertigkeiten');
  const vorhanden = new Map();
  for (const el of Array.from(block.children)) {
    if (el.tagName === 'ÜbernatürlicheFertigkeit') vorhanden.set(el.getAttribute('name'), el);
  }
  leere(block);

  for (const [name, ue] of Object.entries(c.uebernatuerlich || {})) {
    const el = vorhanden.get(name) || block.ownerDocument.createElement('ÜbernatürlicheFertigkeit');
    el.setAttribute('name', name);
    el.setAttribute('wert', String(ue.wert || 0));
    if (!el.hasAttribute('exportieren')) el.setAttribute('exportieren', ue.wert > 0 ? '1' : '0');
    if (f.talenteEigenerBlock) {
      const t = kind(el, 'Talente');
      if (t) el.removeChild(t);
    } else {
      const t = leere(kindOderNeu(el, 'Talente'));
      for (const tn of talenteUnter(c, db, name)) haengeAn(t, 'Talent', talentAttribute(c, db, tn));
    }
    block.appendChild(el);
  }
}

function schreibeObjekte(root, c, f) {
  const obj = kindOderNeu(root, 'Objekte');
  if (!kind(obj, 'Zonensystem')) setzeText(obj, 'Zonensystem', 0);

  const rBlock = leere(kindOderNeu(obj, 'Rüstungen'));
  for (const r of c.ruestungen || []) {
    haengeAn(rBlock, 'Rüstung', { ...(r._attr || {}), name: r.name, be: r.be || 0, rs: r.rs || '0/0/0/0/0/0' });
  }

  const wBlock = leere(kindOderNeu(obj, 'Waffen'));
  for (const w of c.waffen || []) {
    const attr = { ...(w._attr || {}) };
    attr.name = w.name;
    attr.id = w.id || w.name;
    attr['würfel'] = w.wuerfel || 0;
    attr['würfelSeiten'] = w.wuerfelSeiten || 6;
    attr.plus = w.plus || 0;
    attr.eigenschaften = w.eigenschaften || '';
    attr['härte'] = w.haerte || 6;
    attr.rw = w.rw || 0;
    attr.kampfstil = w.kampfstil || (f.waffeBeSlot ? 'Kein Kampfstil' : '');
    attr.wm = w.wm || 0;
    if (f.waffeBeSlot) {
      if (attr.beSlot === undefined) attr.beSlot = 1;
      delete attr.typ;
    } else {
      attr.typ = w.typ || 'Nah';
      delete attr.beSlot;
    }
    haengeAn(wBlock, 'Waffe', attr);
  }

  const aBlock = leere(kindOderNeu(obj, 'Ausrüstung'));
  for (const g of c.ausruestung || []) haengeAn(aBlock, 'Ausrüstungsstück', {}, g);
}

function schreibeErfahrung(root, c) {
  const erf = kindOderNeu(root, 'Erfahrung');
  setzeText(erf, 'Gesamt', c.erfahrung?.gesamt || 0);
  setzeText(erf, 'Ausgegeben', c.erfahrung?.ausgegeben || 0);
  // Der Hausregel-Schalter wird nur aktualisiert, nicht neu angelegt.
  setzeTextFallsDa(kindOderNeu(root, 'Einstellungen'), 'VoraussetzungenPrüfen',
    c.voraussetzungenPruefen === false ? 0 : 1);
}

function schreibeBeschreibungDetails(root, c) {
  const bd = kindOderNeu(root, 'BeschreibungDetails');
  setzeText(bd, 'Kultur', c.kultur || '');
  setzeText(bd, 'Profession', c.profession || '');
  for (const feld of BESCHREIBUNG_FELDER) setzeText(bd, feld.ziel, c[feld.key] || '');
  for (let i = 0; i < AUSSEHEN_ZEILEN.length; i++) {
    setzeText(bd, `Aussehen${i + 1}`, (c.aussehen && c.aussehen[i]) || '');
  }
  for (let i = 0; i < HINTERGRUND_ZEILEN.length; i++) {
    setzeText(bd, `Hintergrund${i}`, (c.hintergrund && c.hintergrund[i]) || '');
  }
}

/**
 * Eigene Skularis-Felder, die es in Sephrasto nicht gibt und die über Abenteuer
 * hinweg erhalten bleiben sollen: die Münzbörse und das Spielinventar. Als ein
 * JSON-Block in einem eigenen Element abgelegt; Sephrasto ignoriert es beim
 * Öffnen, unsere eigene parse-Funktion liest es wieder ein.
 */
function schreibeSkularisDaten(root, c) {
  const el = kindOderNeu(root, 'SkularisDaten');
  const daten = {};
  if (c.geldboerse) daten.geldboerse = c.geldboerse;
  if (c.spielinventar) daten.spielinventar = c.spielinventar;
  if (typeof c.startkapital === 'number') daten.startkapital = c.startkapital;
  if (typeof c.astralspeicherStab === 'number') daten.astralspeicherStab = c.astralspeicherStab;
  el.textContent = JSON.stringify(daten);
}

// --- Vorlage für einen neuen Charakter ------------------------------------

/** Leerer Charakter in der Generation, die Sephrasto beim Projektinhaber schreibt. */
function vorlage() {
  const attribute = ATTRIBUTE.map(a => `    <${a}>0</${a}>`).join('\n');
  const aussehen = [1, 2, 3, 4, 5, 6].map(i => `    <Aussehen${i}></Aussehen${i}>`).join('\n');
  const hintergrund = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `    <Hintergrund${i}></Hintergrund${i}>`).join('\n');
  return `<Charakter>
  <Version>
    <CharakterVersion>${NEUE_CHARAKTER_VERSION}</CharakterVersion>
    <Plugins></Plugins>
    <Hausregeln>Keine</Hausregeln>
  </Version>
  <Beschreibung>
    <Name></Name>
    <Spezies></Spezies>
    <Status>2</Status>
    <Kurzbeschreibung></Kurzbeschreibung>
    <Finanzen>2</Finanzen>
    <Heimat></Heimat>
    <Eigenheiten/>
  </Beschreibung>
  <Attribute>
${attribute}
  </Attribute>
  <Energien>
    <AsP wert="0"/>
  </Energien>
  <Vorteile/>
  <Fertigkeiten/>
  <Talente/>
  <Objekte>
    <Zonensystem>0</Zonensystem>
    <Rüstungen/>
    <Waffen/>
    <Ausrüstung/>
  </Objekte>
  <ÜbernatürlicheFertigkeiten/>
  <Erfahrung>
    <Gesamt>0</Gesamt>
    <Ausgegeben>0</Ausgegeben>
  </Erfahrung>
  <Notiz/>
  <Einstellungen>
    <VoraussetzungenPrüfen>1</VoraussetzungenPrüfen>
    <Charakterbogen>Standard Charakterbogen</Charakterbogen>
    <FinanzenAnzeigen>1</FinanzenAnzeigen>
    <ÜbernatürlichesPDFSpalteAnzeigen>0</ÜbernatürlichesPDFSpalteAnzeigen>
    <DetailsAnzeigen>0</DetailsAnzeigen>
    <RegelnAnhängen>1</RegelnAnhängen>
    <RegelnGrösse>8</RegelnGrösse>
    <DeaktivierteRegelKategorien></DeaktivierteRegelKategorien>
    <FormularEditierbarkeit>1</FormularEditierbarkeit>
  </Einstellungen>
  <BeschreibungDetails>
    <Kultur></Kultur>
    <Profession></Profession>
    <Geschlecht></Geschlecht>
    <Geburtsdatum></Geburtsdatum>
    <Grösse></Grösse>
    <Gewicht></Gewicht>
    <Haarfarbe></Haarfarbe>
    <Augenfarbe></Augenfarbe>
    <Titel></Titel>
${aussehen}
${hintergrund}
  </BeschreibungDetails>
</Charakter>
`;
}
