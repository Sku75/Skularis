/**
 * Skularistool — Ilaris-Rechenkern (originalgetreu zu Sephrasto)
 * EP-Kosten, abgeleitete Werte, Voraussetzungsprüfung. Reine Funktionen,
 * in Node testbar. Datengetrieben aus der transformierten Datenbank (db.js).
 */

import { waffenErklaerung, waffenGattungstext } from '../daten/ausruestung-texte.js';
import { bauInfo } from './infotext.js';
import { leseInventar } from './ausruestung.js';

// --- EP-Kosten-Grundformeln ---
// Steigerung eines Werts von 0 auf W kostet die Summe SF·v für v = 1..W.
export function summenKosten(sf, wert) {
  const w = Math.max(0, wert | 0);
  return sf * w * (w + 1) / 2;
}

export function kostenAttribut(db, name, wert) {
  const sf = db.attributByName[name]?.steigerungsfaktor ?? 16;
  return summenKosten(sf, wert);
}

export function kostenFertigkeit(sf, wert) {
  return summenKosten(sf, wert);
}

export function kostenEnergie(sf, punkte) {
  return summenKosten(sf, punkte);
}

/**
 * Talent-Kosten: feste kosten (>=0) oder regelbasiert
 * (SteigerungsfaktorMulti · SF der Fertigkeit; verbilligt entsprechend).
 */
export function kostenTalent(talent, parentSF, db, verbilligt = null) {
  if (!talent) return 0;
  if (talent.kosten >= 0) return talent.kosten;
  const sf = (typeof talent.steigerungsfaktor === 'number') ? talent.steigerungsfaktor : parentSF;
  const istVerbilligt = verbilligt === null ? talent.verbilligt : verbilligt;
  const multi = istVerbilligt ? db.talentMultiVerbilligt : db.talentMulti;
  return multi * sf;
}

/**
 * Freie Fertigkeiten: 4/8/16 je Stufe. Kostenlos sind nur bis zu
 * `Anzahl Kostenlos` Fertigkeiten mit wert==3 (die Muttersprache).
 *
 * Zwei Prüfungen, in genau dieser Reihenfolge wie in Sephrasto
 * (Charakter.py, epZaehlen):
 *   1. wert 3 und noch ein Freiplatz übrig -> kostenlos
 *   2. kein Name -> überspringen. Sephrasto legt in der Oberfläche leere
 *      Zeilen an (name="" wert="1"); die kosten nichts und stehen trotzdem
 *      in der Datei.
 */
export function kostenFreieFertigkeiten(freie, db) {
  let numKostenlos = 0;
  let summe = 0;
  for (const ff of freie || []) {
    const w = Math.max(0, Math.min(3, ff.wert | 0));
    if (w === 3 && numKostenlos < (db.freieKostenlos || 0)) { numKostenlos++; continue; }
    if (!ff.name) continue;
    for (let s = 0; s < w; s++) summe += db.freieKosten[s] || 0;
  }
  return summe;
}

/**
 * Kosten eines Talents für diesen Charakter. Talente mit variablen Kosten
 * (Sephrasto: variableKosten="1") tragen ihren Preis am Charakter, nicht in der
 * Datenbank — etwa wenn mehrere Tiere für Adlerschwinge Wolfsgestalt gewählt
 * wurden. Nur wenn dort nichts steht, gilt der Datenbankwert.
 */
export function talentKostenFuer(char, db, name, parentSF) {
  // Von einem Vorteil geschenkt (Tiergeist-Vorteile): das Skript gibt den Preis
  // vor, in aller Regel 0.
  if (char.geschenkteTalente && Object.prototype.hasOwnProperty.call(char.geschenkteTalente, name)) {
    return char.geschenkteTalente[name] | 0;
  }
  if (char.talentKosten && Object.prototype.hasOwnProperty.call(char.talentKosten, name)) {
    return char.talentKosten[name] | 0;
  }
  const def = db.talentByName[name];
  const sf = parentSF !== undefined ? parentSF : (def ? def.steigerungsfaktor : 1);
  return kostenTalent(def, sf, db);
}

/**
 * Gesamt ausgegebene EP eines Charakters, mit Aufschlüsselung.
 * @returns {{ total, attribute, vorteile, fertigkeiten, talente, uebernat, uebernatTalente, energien, freie }}
 */
export function gesamtEP(char, db) {
  const b = { attribute: 0, vorteile: 0, fertigkeiten: 0, talente: 0, uebernat: 0, uebernatTalente: 0, energien: 0, freie: 0 };

  // Kostenlose Heimat-Talente (Gebräuche der Heimat ist gratis).
  const gratisTalente = new Set();
  if (char.heimat) gratisTalente.add('Gebräuche: ' + char.heimat);
  // Jedes Talent wird nur EINMAL bezahlt, auch wenn es (zur Anzeige) unter
  // mehreren Fertigkeiten geführt wird. Gratis-Talente gelten als bezahlt.
  const bezahlt = new Set(gratisTalente);

  // Attribute
  for (const [name, wert] of Object.entries(char.attribute || {})) {
    b.attribute += kostenAttribut(db, name, wert);
  }

  // Vorteile
  for (const eintrag of char.vorteile || []) {
    const name = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const v = db.vorteilByName[name];
    if (!v) continue;
    if (v.variableKosten && typeof eintrag === 'object' && typeof eintrag.kosten === 'number') {
      b.vorteile += eintrag.kosten;
    } else {
      b.vorteile += v.kosten;
    }
  }

  // Profane Fertigkeiten
  let hoechsteNahkampf = 0;
  for (const [fname, fe] of Object.entries(char.fertigkeiten || {})) {
    const f = db.fertigkeitByName[fname];
    const sf = f?.steigerungsfaktor ?? 1;
    b.fertigkeiten += kostenFertigkeit(sf, fe.wert || 0);
    if (f && f.kampffertigkeit === 1) hoechsteNahkampf = Math.max(hoechsteNahkampf, fe.wert || 0);
  }
  // Aufschlag auf die höchste Nahkampf-Kampffertigkeit: 2 · Dreieckssumme(wert)
  // (Sephrasto Core/Fertigkeit.py: getHöchsteKampffertigkeit).
  b.fertigkeiten += 2 * (hoechsteNahkampf * (hoechsteNahkampf + 1) / 2);

  // Übernatürliche Fertigkeiten
  for (const [uname, ue] of Object.entries(char.uebernatuerlich || {})) {
    const u = db.uebernatByName[uname];
    const sf = u?.steigerungsfaktor ?? 2;
    b.uebernat += kostenFertigkeit(sf, ue.wert || 0);
  }

  // Talente. Der Charakter führt sie in einer Liste; jedes wird einmal bezahlt,
  // auch wenn es unter mehreren Fertigkeiten erscheint. Der Steigerungsfaktor
  // kommt aus der primären Fertigkeit des Talents (db.js), ist also unabhängig
  // davon, wo es angezeigt wird.
  for (const tname of char.talente || []) {
    if (bezahlt.has(tname)) continue;
    bezahlt.add(tname);
    const def = db.talentByName[tname];
    const primaer = def && def.fertigkeiten && def.fertigkeiten[0];
    const kosten = talentKostenFuer(char, db, tname, def ? def.steigerungsfaktor : 1);
    if (primaer && db.uebernatByName[primaer]) b.uebernatTalente += kosten;
    else b.talente += kosten;
  }

  // Energien (gekaufte Punkte über der Basis)
  for (const [ename, ee] of Object.entries(char.energien || {})) {
    const sf = db.energieByName[ename]?.steigerungsfaktor ?? 1;
    b.energien += kostenEnergie(sf, ee.gekauft || 0);
  }

  // Freie Fertigkeiten
  b.freie = kostenFreieFertigkeiten(char.freieFertigkeiten || [], db);

  b.total = b.attribute + b.vorteile + b.fertigkeiten + b.talente + b.uebernat + b.uebernatTalente + b.energien + b.freie;
  return b;
}

/**
 * Fertigkeits-Basiswert nach Ilaris: kaufmännisch gerundeter Mittelwert der
 * zugeordneten Attribute. Der Probenwert ist Basiswert + Fertigkeitswert.
 * @param {object} char  Charakter (mit char.attribute)
 * @param {object} fdef  Fertigkeits-Definition aus der DB (mit fdef.attribute[])
 */
export function fertigkeitBasiswert(char, fdef) {
  const attrs = (fdef && fdef.attribute) || [];
  if (!attrs.length) return 0;
  const a = char.attribute || {};
  const summe = attrs.reduce((s, k) => s + (a[k] || 0), 0);
  return Math.round(summe / attrs.length);
}

/**
 * Probenwert einer Fertigkeit. Ilaris unterscheidet zwei Fälle, die Datenbank
 * gibt beide vor:
 *   ohne passendes Talent   PW Script  = Basiswert + int(Wert/2 + 0,5)
 *   mit passendem Talent    PWT Script = Basiswert + Wert
 * Bis 0.05 zeigte Skularis nur den zweiten Wert und nannte ihn "Probenwert".
 */
export function fertigkeitProbenwert(char, fdef, wert, mitTalent) {
  const basis = fertigkeitBasiswert(char, fdef);
  const w = Math.max(0, wert | 0);
  return mitTalent ? basis + w : basis + Math.round(w / 2);
}

/** Probenwert eines Attributs: der doppelte Wert (Attribute: PW Script). */
export function attributProbenwert(char, abk) {
  return (char.attribute?.[abk] || 0) * 2;
}

/**
 * Kampfwerte einer ausgerüsteten Waffe.
 *
 * Attacke und Verteidigung sind der Probenwert der Kampffertigkeit, die zur
 * Waffe gehört, plus der Waffenmodifikator. Ob der volle oder der halbe
 * Fertigkeitswert zählt, entscheidet das Waffentalent: wer es hat, führt die
 * Waffe geübt. Dazu kommen die Aufschläge des eingestellten Kampfstils
 * (Vorteile mit modifyKampfstil), die nur für Waffen mit genau diesem Stil gelten.
 *
 * Für einige Talente ist keine Verteidigung vorgesehen — Bögen, Armbrüste,
 * Wurfwaffen und die Lanze (Einstellung "Waffen: Talente VT verboten").
 *
 * @returns {{ at, vt, tp, rw, be, fertigkeit, talent, geuebt, stil }}
 *   at und vt sind null, wenn die Waffe das nicht kann.
 */
export function waffenwerte(char, db, waffe) {
  const def = db.waffen.find(w => w.name === (waffe.id || waffe.name)) || {};
  const fName = def.fertigkeit || '';
  const tName = def.talent || '';
  const fdef = db.fertigkeitByName[fName];

  const geuebt = tName ? (char.talente || []).includes(tName) : false;
  const basis = fdef ? fertigkeitProbenwert(char, fdef, char.fertigkeiten?.[fName]?.wert || 0, geuebt) : 0;
  const wm = waffe.wm || 0;

  const stilName = waffe.kampfstil && waffe.kampfstil !== 'Kein Kampfstil' ? waffe.kampfstil : '';
  const stil = (stilName && char.kampfstilMods && char.kampfstilMods[stilName]) || null;

  const atVerboten = (db.waffenTalenteATverboten || []).includes(tName);
  const vtVerboten = (db.waffenTalenteVTverboten || []).includes(tName);

  return {
    at: atVerboten ? null : basis + wm + (stil ? stil.at : 0),
    vt: vtVerboten ? null : basis + wm + (stil ? stil.vt : 0),
    tp: (waffe.plus || 0) + (stil ? stil.tp : 0),
    rw: (waffe.rw || 0) + (stil ? stil.rw : 0),
    be: stil ? stil.be : 0,
    fertigkeit: fName,
    talent: tName,
    geuebt,
    stil: stilName,
  };
}

function waffenSchaden(k, waffe) {
  return `${waffe.wuerfel || 0} W ${waffe.wuerfelSeiten || 6}`
    + (k.tp ? (k.tp > 0 ? ` plus ${k.tp}` : ` minus ${-k.tp}`) : '');
}

/** Kompakter Werte-Satz für Listen-Beschriftung und HTML-Export (ein String). */
export function waffenKurz(char, db, waffe) {
  const k = waffenwerte(char, db, waffe);
  const nn = (v) => (v === null ? 'nicht möglich' : v);
  return `Attacke ${nn(k.at)}, Verteidigung ${nn(k.vt)}, Schaden ${waffenSchaden(k, waffe)}, `
    + `Reichweite ${k.rw || 0}, Härte ${waffe.haerte || 0}.`;
}

/**
 * Voller Waffen-Tooltip als gegliederte Abschnitte in der Standard-Reihenfolge:
 * Kopf mit Attacke/Verteidigung, dann Wirkung (Gattung/Schild), dann die Werte,
 * dann Fertigkeit und Kampfstil. Gibt eine bauInfo-Zeilenliste zurück.
 */
export function waffenwerteText(char, db, waffe) {
  const k = waffenwerte(char, db, waffe);
  const nn = (v) => (v === null ? 'nicht möglich' : v);
  const abschnitte = [[waffe.name, `Attacke ${nn(k.at)}, Verteidigung ${nn(k.vt)}.`]];
  const wirkung = waffenGattungstext(waffe.name, k.talent);
  if (wirkung) abschnitte.push(['Wirkung', wirkung]);
  abschnitte.push(['Werte',
    `Schaden ${waffenSchaden(k, waffe)}.`,
    `Reichweite ${k.rw || 0}.`,
    `Härte ${waffe.haerte || 0}, so viel hält die Waffe aus.`,
  ]);
  if (k.fertigkeit) {
    abschnitte.push(['Fertigkeit',
      `${k.fertigkeit}${k.talent ? ', Talent ' + k.talent : ''}, `
      + `${k.geuebt ? 'geübt' : 'ungeübt, deshalb nur der halbe Fertigkeitswert'}.`]);
  }
  if (k.stil) abschnitte.push(['Kampfstil', k.stil]);
  return bauInfo(abschnitte);
}

// --- Abgeleitete Werte (Ilaris-Formeln) ---

/** Rüstungsschutz einer EINZELNEN Rüstung als Zahl (Zahl, rsGesamt oder Zonen-String). */
function einzelRs(r) {
  if (!r) return 0;
  if (typeof r.rs === 'number') return r.rs;
  if (typeof r.rsGesamt === 'number') return r.rsGesamt;
  if (typeof r.rs === 'string') {
    const zonen = r.rs.split('/').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
    if (zonen.length) return Math.round(zonen.reduce((s, n) => s + n, 0) / zonen.length);
  }
  return 0;
}

/** Die Rüstungsteile eines Sets (Name des Sets) mit ihren Einzelwerten — für die Aufschlüsselung. */
export function ruestungsSetTeile(char, setName) {
  const name = setName || char.aktivRuestungsset;
  if (!name || name === '__ohne') return [];
  const set = (leseInventar(char).ruestungsSets || []).find(s => s.name === name);
  if (!set) return [];
  const teile = new Set((set.teile || []).map(t => String(t).trim().toLowerCase()));
  return (char.ruestungen || [])
    .filter(x => x && teile.has(String(x.name || '').trim().toLowerCase()))
    .map(r => ({ name: r.name, rs: einzelRs(r), be: r.be || 0 }));
}

export function getRuestungswerte(char) {
  // Standard: erste angelegte Rüstung bestimmt RS/BE (Sephrasto: getRüstung()[0]).
  // Ist am Spieltisch ein Rüstungsset aktiv (char.aktivRuestungsset), zählen ALLE
  // Teile DIESES Sets: ihre Rüstungsschutz- und Behinderungswerte werden addiert.
  // Der Sonderwert '__ohne' steht für "keine Rüstung angelegt".
  const aktiv = char.aktivRuestungsset;
  if (aktiv === '__ohne') return { rs: 0, be: 0 };
  if (aktiv) {
    const stuecke = ruestungsSetTeile(char, aktiv);
    if (stuecke.length) {
      let rs = 0, be = 0;
      for (const s of stuecke) { rs += s.rs; be += s.be; }
      return { rs, be };
    }
    // Set nicht gefunden oder ohne passende Teile -> unten wie Standard weiter.
  }
  const r = (char.ruestungen || []).find(x => x && (x.rs || x.be)) || null;
  if (!r) return { rs: 0, be: 0 };
  return { rs: einzelRs(r), be: r.be || 0 };
}

function finanzenIndex(char) {
  // 0 Sehr Reich .. 2 Normal .. 4 Sehr Arm
  return typeof char.finanzen === 'number' ? char.finanzen : 2;
}

/**
 * Abgeleitete Werte nach den Skripten der Regeldatenbank, samt der Aufschläge
 * aus den Vorteil-Skripten (char.wertMods, gefüllt von character.js):
 *   WS    4 + KO/4,  final + RS
 *   MR    4 + MU/4
 *   GS    4 + GE/4,  final max(GS - BE, 1)
 *   SB    KK/4
 *   INI   IN
 *   DH    KO,        final max(DH - 2·BE, 1)
 *   RS    Rüstung + Aufschlag
 *   BE    Rüstung + Aufschlag, mindestens 0
 *   SchiP 4, final plus Finanzen
 */
export function abgeleiteteWerte(char) {
  const a = char.attribute || {};
  const at = k => a[k] || 0;
  const mod = k => (char.wertMods && char.wertMods[k]) || 0;
  const roh = getRuestungswerte(char);
  const fin = finanzenIndex(char);

  const rs = roh.rs + mod('RS');
  const be = Math.max(roh.be + mod('BE'), 0);

  const ws = 4 + Math.floor(at('KO') / 4) + mod('WS') + rs;
  const mr = 4 + Math.floor(at('MU') / 4) + mod('MR');
  const gs = Math.max(4 + Math.floor(at('GE') / 4) + mod('GS') - be, 1);
  const sb = Math.floor(at('KK') / 4) + mod('SB');
  const ini = at('IN') + mod('INI');
  const dh = Math.max(at('KO') + mod('DH') - 2 * be, 1);
  const schipBasis = 4 + mod('SchiP');
  const schip = schipBasis + (fin >= 2 ? (fin - 2) : -((2 - fin) * 2));

  return { WS: ws, MR: mr, GS: gs, SB: sb, INI: ini, DH: dh, RS: rs, BE: be, SchiP: schip };
}

// --- Wunden und Erschöpfung (Ilaris) ---
// Wunden und Erschöpfung stehen auf derselben Statusleiste und zählen zusammen
// als "Einschränkungen". Ab der dritten Einschränkung sind alle Proben um zwei
// erschwert, je weitere Einschränkung um zwei mehr (3 = minus 2, 4 = minus 4,
// 5 = minus 6). Ab fünf Einschränkungen droht nach jeder weiteren die
// Kampfunfähigkeit (Zähigkeits-Probe mit dem Wundabzug).

/** Wundabzug (Malus auf alle Proben) aus der Zahl der Einschränkungen. */
export function wundabzug(einschraenkungen) {
  return Math.max(0, 2 * ((einschraenkungen || 0) - 2));
}

// Die Voraussetzungsprüfung steht in core/voraussetzungen.js. Sie ist von hier
// weggezogen, weil sie inzwischen die volle Sephrasto-Grammatik beherrscht
// (Platzhalter, MeisterAttribut, Spezies, Waffeneigenschaft) und außerdem eine
// Aufschlüsselung für Anzeige und Ansage liefert.
