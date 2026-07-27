/**
 * Skularistool — Sephrasto-Datenbank-Transformation
 * Wandelt die (von fast-xml-parser) geparste datenbank.xml in typisierte
 * Nachschlage-Strukturen um. Reine Funktion, in Node testbar.
 *
 * Erwartete Parser-Optionen: attributeNamePrefix:'', textNodeName:'_text',
 * isArray für die Top-Level-Elementtypen (siehe main/file-operations.js).
 */

import { aufbereiten } from './regeltext.js';

function arr(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }
function num(v, d = 0) { const n = parseInt(v, 10); return Number.isNaN(n) ? d : n; }
function pipe(s) { return String(s || '').split('|').map(x => x.trim()).filter(Boolean); }
function komma(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
/** Jeder Beschreibungstext wird einmal beim Laden für die Ansage aufbereitet. */
function txt(s) { return aufbereiten(s); }

export function transformDb(raw) {
  const q = raw?.db?.Datenbank || raw?.Datenbank || raw || {};

  const db = {
    attribute: [], attributByName: {},
    abgeleitete: [], abgeleiteteByName: {},
    energien: [], energieByName: {},
    vorteile: [], vorteilByName: {},
    fertigkeiten: [], fertigkeitByName: {},
    uebernat: [], uebernatByName: {},
    talente: [], talentByName: {}, talenteByFertigkeit: {},
    freieFertigkeiten: [], freieByName: {},
    waffen: [], ruestungen: [], waffeneigenschaften: {},
    regeln: [], regelByName: {},
    einstellungen: {},
  };

  // Einstellungen (Name → Rohwert als String)
  for (const e of arr(q.Einstellung)) {
    db.einstellungen[e.name] = (e._text !== undefined && e._text !== null) ? String(e._text) : '';
  }

  // Attribute
  for (const a of arr(q.Attribut)) {
    const o = {
      name: a.name, anzeigename: a.anzeigename || a.name,
      steigerungsfaktor: num(a.steigerungsfaktor, 16),
      sortorder: num(a.sortorder), text: txt(a._text),
    };
    db.attribute.push(o); db.attributByName[o.name] = o;
  }
  db.attribute.sort((x, y) => x.sortorder - y.sortorder);

  // Abgeleitete Werte
  for (const w of arr(q.AbgeleiteterWert)) {
    const o = {
      name: w.name, anzeigename: w.anzeigename || w.name,
      anzeigen: w.anzeigen === '1',
      formel: w.formel || '', script: w.script || '', finalscript: w.finalscript || '',
      sortorder: num(w.sortorder), text: txt(w._text),
    };
    db.abgeleitete.push(o); db.abgeleiteteByName[o.name] = o;
  }
  db.abgeleitete.sort((x, y) => x.sortorder - y.sortorder);

  // Energien
  for (const e of arr(q.Energie)) {
    const o = {
      name: e.name, anzeigename: e.anzeigename || e.name,
      steigerungsfaktor: num(e.steigerungsfaktor, 1),
      voraussetzungen: e.voraussetzungen || '', sortorder: num(e.sortorder), text: txt(e._text),
    };
    db.energien.push(o); db.energieByName[o.name] = o;
  }
  db.energien.sort((x, y) => x.sortorder - y.sortorder);

  // Vorteile
  for (const v of arr(q.Vorteil)) {
    const o = {
      name: v.name, kosten: num(v.kosten, 0),
      voraussetzungen: v.voraussetzungen || '', nachkauf: v.nachkauf || '',
      typ: num(v.typ, 0), variableKosten: v.variableKosten === '1', kommentar: v.kommentar === '1',
      script: v.script || '', csBeschreibung: txt(v.csBeschreibung),
      linkKategorie: v.linkKategorie || '', linkElement: v.linkElement || '',
      querverweise: v.querverweise || '', info: txt(v.info), text: txt(v._text),
    };
    db.vorteile.push(o); db.vorteilByName[o.name] = o;
  }

  // Talente (mit Rückverweis auf ihre Fertigkeiten)
  for (const t of arr(q.Talent)) {
    const kostenRaw = t.kosten;
    const o = {
      name: t.name,
      kosten: (kostenRaw === undefined || kostenRaw === '') ? -1 : num(kostenRaw, -1),
      voraussetzungen: t.voraussetzungen || '',
      verbilligt: t.verbilligt === '1',
      variableKosten: t.variableKosten === '1',
      kommentar: t.kommentar === '1',
      fertigkeiten: komma(t.fertigkeiten),
      text: txt(t._text),
      info: txt(t.info),
      // Für den Nachschlag im Regelwerk und die richtige Bezeichnung:
      // spezialTyp 0 = Zauber, 1 = Liturgie, 2 = Anrufung, fehlt = profanes Talent.
      referenzseite: t.referenzseite === undefined ? null : num(t.referenzseite, 0),
      referenzbuch: num(t.referenzbuch, 0),
      spezialTyp: t.spezialTyp === undefined ? null : num(t.spezialTyp, 0),
    };
    db.talente.push(o); db.talentByName[o.name] = o;
    for (const f of o.fertigkeiten) {
      (db.talenteByFertigkeit[f] || (db.talenteByFertigkeit[f] = [])).push(o);
    }
  }

  // Fertigkeiten (profan)
  for (const f of arr(q.Fertigkeit)) {
    const o = {
      name: f.name, steigerungsfaktor: num(f.steigerungsfaktor, 1),
      voraussetzungen: f.voraussetzungen || '', attribute: pipe(f.attribute),
      kampffertigkeit: num(f.kampffertigkeit, 0), typ: num(f.typ, 0),
      talente: db.talenteByFertigkeit[f.name] || [], text: txt(f._text), uebernatuerlich: false,
    };
    db.fertigkeiten.push(o); db.fertigkeitByName[o.name] = o;
  }

  // Übernatürliche Fertigkeiten (Zauber/Liturgien/Traditionen)
  for (const u of arr(q['ÜbernatürlicheFertigkeit'])) {
    const o = {
      name: u.name, steigerungsfaktor: num(u.steigerungsfaktor, 2),
      voraussetzungen: u.voraussetzungen || '', attribute: pipe(u.attribute),
      typ: num(u.typ, 0), talente: db.talenteByFertigkeit[u.name] || [],
      text: txt(u._text), uebernatuerlich: true,
    };
    db.uebernat.push(o); db.uebernatByName[o.name] = o;
  }

  // Regeln (Regelanhang und Nachschlagewerk)
  for (const r of arr(q.Regel)) {
    const o = {
      name: r.name, typ: num(r.typ, 0),
      voraussetzungen: r.voraussetzungen || '',
      probe: r.probe || '',
      querverweise: r.querverweise || '',
      text: txt(r._text),
    };
    db.regeln.push(o); db.regelByName[o.name] = o;
  }

  // Freie Fertigkeiten
  for (const f of arr(q.FreieFertigkeit)) {
    const o = { name: f.name, kategorie: f.kategorie || '' };
    db.freieFertigkeiten.push(o); db.freieByName[o.name] = o;
  }

  // Waffen / Rüstungen / Waffeneigenschaften (für Ausrüstung)
  for (const w of arr(q.Waffe)) db.waffen.push({ ...w });
  for (const r of arr(q['Rüstung'])) db.ruestungen.push({ ...r });
  for (const we of arr(q.Waffeneigenschaft)) {
    db.waffeneigenschaften[we.name] = { name: we.name, script: we.script || '' };
  }

  // Talent-Steigerungsfaktor = SF der primären (ersten) Fertigkeit des Talents.
  // Deterministisch, unabhängig davon, unter welcher Fertigkeit der Charakter
  // das Talent führt (wichtig bei Talenten in mehreren Fertigkeiten).
  for (const t of db.talente) {
    const primaer = t.fertigkeiten[0];
    const f = db.fertigkeitByName[primaer] || db.uebernatByName[primaer];
    t.steigerungsfaktor = f ? f.steigerungsfaktor : 2;
  }

  // Bequeme Einstellungswerte
  db.talentMulti = num(db.einstellungen['Talente: SteigerungsfaktorMulti'], 20);
  db.talentMultiVerbilligt = num(db.einstellungen['Talente: SteigerungsfaktorMulti Verbilligt'], 10);
  db.freieKosten = [
    num(db.einstellungen['FreieFertigkeiten: Kosten Stufe1'], 4),
    num(db.einstellungen['FreieFertigkeiten: Kosten Stufe2'], 8),
    num(db.einstellungen['FreieFertigkeiten: Kosten Stufe3'], 16),
  ];
  db.freieKostenlos = num(db.einstellungen['FreieFertigkeiten: Anzahl Kostenlos'], 1);
  db.kampfstilTyp = num(db.einstellungen['Vorteile: Kampfstil Typ'], 3);

  // Bezeichnungen der Spezialtalente, aus der Einstellung
  // "Talente: Spezialtalent Typen" (je Zeile Einzahl=Mehrzahl).
  db.spezialTypen = String(db.einstellungen['Talente: Spezialtalent Typen'] || '')
    .split('\n').map(z => z.split('=')[0].trim()).filter(Boolean);
  // Referenzwerke, aus der Einstellung "Referenzbücher".
  db.referenzbuecher = komma(db.einstellungen['Referenzbücher']);
  // Kategorien der Regeln, aus der Einstellung "Regeln: Typen".
  db.regelTypen = komma(db.einstellungen['Regeln: Typen']);
  // Waffentalente ohne Attacke bzw. ohne Verteidigung (Bögen, Wurfwaffen, Lanze).
  db.waffenTalenteATverboten = komma(db.einstellungen['Waffen: Talente AT verboten']);
  db.waffenTalenteVTverboten = komma(db.einstellungen['Waffen: Talente VT verboten']);
  // Kampfstile sind Vorteile eines bestimmten Typs (Einstellung "Vorteile: Typen").
  db.kampfstile = db.vorteile.filter(v => v.typ === db.kampfstilTyp).map(v => v.name);
  db.regeln.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return db;
}
