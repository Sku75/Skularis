/**
 * Skularistool — Charakterbogen (nur ansehen) + Schnellauskunft.
 * Eine durchsuchbare Liste aller Bogen-Einträge: Attribute, abgeleitete Werte,
 * Fertigkeiten mit Talenten, Vorteile, Übernatürliches, freie Fertigkeiten,
 * Ausrüstung, Erfahrung. Filter oben (Schnellauskunft). Nichts ist änderbar.
 *
 * Modular: baueCharakterbogen(char, db, titel) baut den Bogen für einen
 * beliebigen Charakter. So sieht der Bogen überall gleich aus — am Spieltisch,
 * in der Vorlagen-Ansicht und wo immer sonst ein Charakter angezeigt wird.
 * charakterbogenScreen() ohne Argumente nimmt den Charakter des offenen
 * Abenteuers, wie bisher.
 */
import { menuScreen } from '../ui/menu-screen.js';
import { abgeleiteteWerte, fertigkeitBasiswert, fertigkeitProbenwert, waffenwerte, waffenwerteText } from '../core/regeln.js';
import { getDb } from '../core/db-laden.js';
import { getAbenteuer } from './state.js';

const ATTR_NAME = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Körperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};

function vName(v) { return typeof v === 'string' ? v : v.name; }

/** Der Charakterbogen des offenen Abenteuers (Aufruf ohne Argumente). */
export function charakterbogenScreen() {
  const a = getAbenteuer();
  return baueCharakterbogen(a.charakter, getDb(), 'Charakterbogen');
}

/** Charakterbogen für einen beliebigen Charakter. */
export function baueCharakterbogen(char, db, titel = 'Charakterbogen') {
  const w = abgeleiteteWerte(char);
  const items = [];
  const eintrag = (label, detail) => items.push({ label, detail: detail || '', onSelect: () => {} });
  // Abschnittsüberschrift, mit Strg und Pfeil hoch/runter anspringbar.
  const kopf = (label) => items.push({ label, ueberschrift: true, detail: '', onSelect: () => {} });

  // Fertigkeit-Zeile: Basiswert (gerundeter Mittelwert der Attribute) + Fertigkeitswert;
  // Detail nennt Probenwert, Formel und Talente.
  const talenteVon = (fname) => (char.talente || [])
    .filter(n => (db?.talentByName[n]?.fertigkeiten || []).includes(fname));

  const fertigkeitEintrag = (praefix, name, fe, fdef) => {
    const fw = fe.wert || 0;
    const talente = talenteVon(name);
    if (db && fdef && fdef.attribute && fdef.attribute.length) {
      const basis = fertigkeitBasiswert(char, fdef);
      const attrText = fdef.attribute.map(k => `${k} ${char.attribute[k] || 0}`).join(', ');
      const label = `${praefix} ${name}: Basiswert ${basis}, Fertigkeitswert ${fw}`;
      let detail = `Probenwert mit passendem Talent ${fertigkeitProbenwert(char, fdef, fw, true)}, `
        + `ohne Talent ${fertigkeitProbenwert(char, fdef, fw, false)}. `
        + `Basiswert ${basis}, der gerundete Mittelwert der Attribute ${attrText}.`;
      if (talente.length) detail += ` Talente: ${talente.join(', ')}.`;
      eintrag(label, detail);
    } else {
      eintrag(`${praefix} ${name}: ${fw}`, talente.length ? `Talente: ${talente.join(', ')}` : '');
    }
  };

  kopf('Charakter');
  eintrag(`Charakter: ${char.name || 'ohne Namen'}`, `Spezies ${char.spezies || 'keine'}, Heimat ${char.heimat || 'keine'}`);
  eintrag(`Erfahrung: ${char.erfahrung.gesamt} gesamt, ${char.erfahrung.ausgegeben} ausgegeben`);

  kopf('Attribute');
  for (const k of ['KO', 'MU', 'GE', 'KK', 'IN', 'KL', 'CH', 'FF']) {
    eintrag(`${ATTR_NAME[k]} ${k}: ${char.attribute[k] || 0}`);
  }
  kopf('Abgeleitete Werte');
  eintrag(`Wundschwelle: ${w.WS}`, 'Modifizierte Wundschwelle, sie enthält den Rüstungsschutz der getragenen Rüstung. Grundwert ohne Rüstung: 4 plus Konstitution durch 4. Ab dieser Schadenshöhe erleidet man eine Wunde.');
  eintrag(`Magieresistenz: ${w.MR}`);
  eintrag(`Geschwindigkeit: ${w.GS}`);
  eintrag(`Initiative: ${w.INI}`);
  eintrag(`Schadensbonus: ${w.SB}`);
  eintrag(`Durchhaltevermögen: ${w.DH}`);
  eintrag(`Rüstungsschutz: ${w.RS}`);
  eintrag(`Behinderung: ${w.BE}`);
  eintrag(`Schicksalspunkte: ${w.SchiP}`);

  const fertMitInhalt = Object.entries(char.fertigkeiten || {})
    .filter(([name, fe]) => (fe.wert || 0) > 0 || talenteVon(name).length);
  if (fertMitInhalt.length) kopf('Fertigkeiten und Talente');
  for (const [name, fe] of fertMitInhalt) {
    fertigkeitEintrag('Fertigkeit', name, fe, db && db.fertigkeitByName[name]);
  }
  const ueberMitInhalt = Object.entries(char.uebernatuerlich || {})
    .filter(([name, ue]) => (ue.wert || 0) > 0 || talenteVon(name).length);
  if (ueberMitInhalt.length) kopf('Übernatürliches');
  for (const [name, ue] of ueberMitInhalt) {
    fertigkeitEintrag('Übernatürlich', name, ue, db && db.uebernatByName[name]);
  }
  if ((char.vorteile || []).length) kopf('Vorteile');
  for (const v of char.vorteile || []) {
    const n = vName(v);
    const komm = (typeof v === 'object' && v.kommentar) ? `, ${v.kommentar}` : '';
    eintrag(`Vorteil: ${n}${komm}`);
  }
  const freie = (char.freieFertigkeiten || []).filter(ff => ff.name);
  if (freie.length) kopf('Freie Fertigkeiten');
  for (const ff of freie) {
    eintrag(`Freie Fertigkeit ${ff.name}: ${ff.wert || 0}`);
  }
  const waffen = (char.waffen || []).filter(x => x.name);
  if (waffen.length) kopf('Waffen');
  for (const wa of waffen) {
    const k = db ? waffenwerte(char, db, wa) : null;
    const label = k
      ? `Waffe: ${wa.name}, Attacke ${k.at === null ? 'nicht möglich' : k.at}, Verteidigung ${k.vt === null ? 'nicht möglich' : k.vt}`
      : `Waffe: ${wa.name}`;
    eintrag(label, db ? waffenwerteText(char, db, wa) : '');
  }
  const ruestungen = (char.ruestungen || []).filter(x => x.name);
  if (ruestungen.length) kopf('Rüstungen');
  for (const r of ruestungen) {
    eintrag(`Rüstung: ${r.name}`, `RS-Zonen ${r.rs}, Behinderung ${r.be}`);
  }

  return menuScreen({
    title: titel,
    subtitle: 'Nur zum Ansehen. Oben Filtern für die Schnellauskunft. Strg und Pfeil hoch oder runter '
      + 'springt zwischen den Überschriften. Shift und Pfeil-runter liest Details. Escape zurück.',
    items,
    filter: true,
  });
}
