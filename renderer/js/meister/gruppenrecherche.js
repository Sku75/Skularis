/**
 * Skularistool — Meistertisch: Gruppenrecherche und Gruppenprobe.
 *
 * Ein Filterfeld, darunter die aus den Charakterboegen gezogenen Werte. Drei
 * Formen, die dieselbe Filterzeile bedient:
 *   1. Fertigkeit (z. B. Wahrnehmung): Probenwert je Held, Talente dahinter.
 *   2. Attribut oder abgeleiteter Wert (z. B. Mut, Wundschwelle): Wert je Held.
 *   3. Auskunft (z. B. ein Vorteil): wer hat es, wer nicht.
 * Sortiert, hoechster zuerst, Umkehr moeglich. Enter auf einer Fertigkeits- oder
 * Attributzeile wuerfelt verdeckt fuer diesen Helden. Die Gruppenprobe laesst
 * die ganze Gruppe gegen eine Schwierigkeit wuerfeln.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, zahlDialog, knopfDialog } from '../ui/dialog.js';
import { getDb } from '../core/db-laden.js';
import { fertigkeitProbenwert, fertigkeitBasiswert, attributProbenwert, abgeleiteteWerte } from '../core/regeln.js';
import { getMeister } from './state.js';
import { verdeckteProbe } from './wuerfel.js';

const ATTRIBUTE = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Koerperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};
const ABGELEITET = [
  { key: 'WS', name: 'Wundschwelle', syn: ['wundschwelle', 'ws'] },
  { key: 'MR', name: 'Magieresistenz', syn: ['magieresistenz', 'mr'] },
  { key: 'GS', name: 'Geschwindigkeit', syn: ['geschwindigkeit', 'gs', 'tempo'] },
  { key: 'INI', name: 'Initiative', syn: ['initiative', 'ini'] },
  { key: 'SB', name: 'Schadensbonus', syn: ['schadensbonus', 'sb'] },
  { key: 'DH', name: 'Durchhaltevermoegen', syn: ['durchhaltevermoegen', 'durchhaltevermögen', 'dh'] },
  { key: 'RS', name: 'Ruestungsschutz', syn: ['ruestungsschutz', 'rüstungsschutz', 'rs'] },
  { key: 'BE', name: 'Behinderung', syn: ['behinderung', 'be'] },
  { key: 'SchiP', name: 'Schicksalspunkte', syn: ['schicksalspunkte', 'schip', 'sip'] },
];

/** Index Talentname -> zugehoerige Fertigkeit (einmal je Datenbank gebaut). */
function talentIndex(db) {
  if (!db) return {};
  if (db.__talentIndex) return db.__talentIndex;
  const idx = {};
  for (const f of db.fertigkeiten || []) for (const t of f.talente || []) {
    if (!idx[t.name.toLowerCase()]) idx[t.name.toLowerCase()] = { name: t.name, fdef: f };
  }
  db.__talentIndex = idx;
  return idx;
}

/** Begriff deuten: Attribut, abgeleiteter Wert, Fertigkeit, Talent oder Auskunft. */
function deute(begriff, db) {
  const b = (begriff || '').trim().toLowerCase();
  if (!b) return null;
  // Attribut nach Kuerzel oder Name
  for (const [abk, name] of Object.entries(ATTRIBUTE)) {
    if (b === abk.toLowerCase() || b === name.toLowerCase()) return { typ: 'attribut', abk, name };
  }
  // Abgeleiteter Wert
  for (const w of ABGELEITET) if (w.syn.includes(b)) return { typ: 'abgeleitet', ...w };
  const tidx = talentIndex(db);
  // Fertigkeit exakt
  let f = (db && db.fertigkeiten || []).find(x => x.name.toLowerCase() === b);
  if (f) return { typ: 'fertigkeit', fdef: f };
  // Talent exakt
  if (tidx[b]) return { typ: 'talent', talentName: tidx[b].name, fdef: tidx[b].fdef };
  // Fertigkeit enthaltend
  f = (db && db.fertigkeiten || []).find(x => x.name.toLowerCase().includes(b));
  if (f) return { typ: 'fertigkeit', fdef: f };
  // Talent enthaltend
  const tKey = Object.keys(tidx).find(k => k.includes(b));
  if (tKey) return { typ: 'talent', talentName: tidx[tKey].name, fdef: tidx[tKey].fdef };
  return { typ: 'auskunft', begriff: b };
}

/** Tooltip mit den genauen Werten einer Fertigkeitszeile. */
function fertigkeitDetail(char, fdef, fw, hatTalent, talentName) {
  const basis = fertigkeitBasiswert(char, fdef);
  const pwOhne = fertigkeitProbenwert(char, fdef, fw, false);
  const pwMit = fertigkeitProbenwert(char, fdef, fw, true);
  const attrs = (fdef.attribute || []).join(', ');
  const zeilen = [
    talentName ? `${talentName}${hatTalent ? '' : ', Talent nicht vorhanden'}. Fertigkeit ${fdef.name}.` : `Fertigkeit ${fdef.name}.`,
    `Basiswert ${basis}, Fertigkeitswert ${fw}.`,
    `Probenwert ohne Talent ${pwOhne}, mit passendem Talent ${pwMit}.`,
    attrs ? `Attribute: ${attrs}.` : '',
    talentName ? (hatTalent ? 'Held besitzt das Talent, es zaehlt der volle Fertigkeitswert.' : 'Ohne Talent zaehlt der halbe Fertigkeitswert (Fertigkeitsgruppe).') : '',
  ];
  return zeilen.filter(Boolean).join(' ');
}

/** Zeilen je Held fuer einen gedeuteten Begriff. */
function zeilen(deutung, db) {
  const a = getMeister();
  const helden = a.charaktere || [];
  const rows = [];
  for (const c of helden) {
    const char = c.bogen;
    if (deutung.typ === 'attribut') {
      const pw = attributProbenwert(char, deutung.abk);
      const av = char.attribute?.[deutung.abk] || 0;
      rows.push({ name: c.name, wert: pw, text: `Probenwert ${pw}`, probenwert: pw, was: deutung.name,
        detail: `${deutung.name} ${deutung.abk}. Attributwert ${av}, Probenwert ${pw} (Attribut mal zwei).` });
    } else if (deutung.typ === 'abgeleitet') {
      const w = abgeleiteteWerte(char);
      const v = w[deutung.key] || 0;
      rows.push({ name: c.name, wert: v, text: `${v}`, probenwert: null, was: deutung.name,
        detail: `${deutung.name}: ${v}. Abgeleiteter Wert, kein direkter Wurf.` });
    } else if (deutung.typ === 'fertigkeit') {
      const f = deutung.fdef;
      const fw = char.fertigkeiten?.[f.name]?.wert || 0;
      const pw = fertigkeitProbenwert(char, f, fw, false);
      const talente = (f.talente || []).map(t => t.name).filter(n => (char.talente || []).includes(n));
      const text = `Probenwert ${pw}` + (talente.length ? `, Talente: ${talente.join(', ')}` : ', kein Talent');
      rows.push({ name: c.name, wert: pw, text, probenwert: pw, was: f.name, detail: fertigkeitDetail(char, f, fw, talente.length > 0, null) });
    } else if (deutung.typ === 'talent') {
      const f = deutung.fdef;
      const fw = char.fertigkeiten?.[f.name]?.wert || 0;
      const hat = (char.talente || []).includes(deutung.talentName);
      const pw = fertigkeitProbenwert(char, f, fw, hat);
      const text = hat ? `Talent ${deutung.talentName}, Probenwert ${pw}` : `${deutung.talentName} kein Talent. ${f.name} Probenwert ${pw}`;
      rows.push({ name: c.name, wert: pw, text, probenwert: pw, was: hat ? deutung.talentName : f.name, detail: fertigkeitDetail(char, f, fw, hat, deutung.talentName) });
    } else {
      const tr = auskunft(char, deutung.begriff);
      rows.push({ name: c.name, wert: tr.hat ? 1 : 0, text: tr.hat ? `ja, ${tr.treffer}` : 'nein', probenwert: null, was: deutung.begriff,
        detail: tr.hat ? `${c.name} hat: ${tr.treffer}.` : `${c.name} hat nichts zu ${deutung.begriff}.` });
    }
  }
  return rows;
}

/** Auskunft: hat der Charakter etwas, das zum Begriff passt? */
function auskunft(char, t) {
  const enthaelt = (s) => String(s || '').toLowerCase().includes(t);
  for (const v of char.vorteile || []) { const n = typeof v === 'string' ? v : v.name; if (enthaelt(n)) return { hat: true, treffer: `Vorteil ${n}` }; }
  for (const tal of char.talente || []) { if (enthaelt(tal)) return { hat: true, treffer: `Talent ${tal}` }; }
  for (const [fn, fv] of Object.entries(char.fertigkeiten || {})) { if ((fv?.wert || 0) > 0 && enthaelt(fn)) return { hat: true, treffer: `Fertigkeit ${fn}` }; }
  for (const un of Object.keys(char.uebernatuerlich || {})) { if (enthaelt(un)) return { hat: true, treffer: `Fertigkeit ${un}` }; }
  if (enthaelt(char.spezies) || enthaelt(char.kultur) || enthaelt(char.profession)) return { hat: true, treffer: 'Herkunft' };
  return { hat: false, treffer: '' };
}

const VORSCHLAEGE = ['Wahrnehmung', 'Mut', 'Wundschwelle', 'Magieresistenz', 'Heimlichkeit', 'Selbstbeherrschung'];

export function gruppenrechercheScreen() {
  const zustand = { begriff: '', umkehr: false };
  const scr = {
    title: 'Gruppenrecherche',
    build() {
      const a = getMeister();
      const db = getDb();
      const items = [];

      items.push({
        id: 'gr-filter',
        label: zustand.begriff ? `Suchbegriff: ${zustand.begriff}` : 'Suchbegriff eingeben',
        hint: 'Fertigkeit, Attribut, abgeleiteter Wert oder eine Auskunft',
        onSelect: async () => {
          const eingabe = await textDialog({ titel: 'Gruppenrecherche', label: 'Wonach fragst du die Gruppe?', wert: zustand.begriff });
          if (eingabe === null) return;
          zustand.begriff = eingabe.trim();
          screen.refresh('#erg-0');
        },
      });

      if (!(a.charaktere || []).length) {
        items.push({ label: 'Noch keine Helden in der Gruppe', hint: 'Erst unter Gruppenzusammenstellung Charaktere hinzufuegen', onSelect: () => {} });
        return menuScreen({ title: this.title, subtitle: 'Escape zurueck.', items }).build();
      }

      if (!zustand.begriff) {
        for (const v of VORSCHLAEGE) items.push({ label: `Vorschlag: ${v}`, hint: 'Enter uebernimmt diesen Begriff', onSelect: () => { zustand.begriff = v; screen.refresh('#erg-0'); } });
        this.title = 'Gruppenrecherche';
        return menuScreen({ title: this.title, subtitle: 'Suchbegriff eingeben, darunter erscheinen die Werte der Gruppe. Escape zurueck.', items }).build();
      }

      const deutung = deute(zustand.begriff, db);
      let rows = zeilen(deutung, db);
      rows.sort((x, y) => y.wert - x.wert);
      if (zustand.umkehr) rows.reverse();

      const titelWort = deutung.typ === 'auskunft' ? `Auskunft ${zustand.begriff}` : (deutung.name || deutung.fdef?.name || zustand.begriff);
      this.title = `Gruppenrecherche, ${titelWort}`;

      items.push({ label: `Reihenfolge umkehren, aktuell ${zustand.umkehr ? 'niedrigster oben' : 'hoechster oben'}`, hint: 'schaltet die Sortierung um', onSelect: () => { zustand.umkehr = !zustand.umkehr; screen.refresh('#erg-0'); } });

      rows.forEach((r, i) => {
        const rollbar = typeof r.probenwert === 'number';
        items.push({
          id: `erg-${i}`,
          label: `${r.name}: ${r.text}`,
          hint: rollbar ? 'Enter wuerfelt verdeckt' : '',
          detail: r.detail || '',
          onSelect: () => {
            if (rollbar) verdeckteProbe({ wer: r.name, was: r.was, probenwert: r.probenwert, anzahl: 3 });
            else sprache.sage(`${r.name}, ${r.was}: ${r.text}.`);
          },
        });
      });

      return menuScreen({
        title: this.title,
        subtitle: 'Hoechster oben. Enter wuerfelt verdeckt (nur fuer dich). Suchbegriff oben aendern. Escape zurueck.',
        items,
        filter: false,
      }).build();
    },
    onShow() {
      sprache.sage('Gruppenrecherche. Suchbegriff eingeben, dann erscheinen die Werte der Gruppe, hoechster oben. Enter auf einer Zeile wuerfelt verdeckt.');
    },
  };
  return scr;
}

// --- Gruppenprobe ---------------------------------------------------------

export function gruppenprobeScreen() {
  return {
    title: 'Gruppenprobe',
    build() {
      const a = getMeister();
      const items = [{
        label: 'Neue Gruppenprobe starten',
        hint: 'Fertigkeit oder Attribut und Schwierigkeit, dann wuerfeln alle',
        onSelect: () => starteGruppenprobe(),
      }];
      // Letztes Ergebnis nachlesbar, je Mitglied ein Tooltip mit den Wuerfen.
      if (scrErgebnis.length) {
        for (const z of scrErgebnis) items.push({ label: z.label, detail: z.detail || '', hint: 'Shift und Pfeil-runter zeigt die Wuerfe', onSelect: () => { if (z.detail) sprache.sage(z.detail); } });
      }
      return menuScreen({
        title: this.title,
        subtitle: (a.charaktere || []).length ? 'Escape zurueck.' : 'Erst Helden in die Gruppe aufnehmen. Escape zurueck.',
        items,
      }).build();
    },
    onShow() { sprache.sage('Gruppenprobe. Neue Gruppenprobe starten laesst die ganze Gruppe verdeckt gegen eine Schwierigkeit wuerfeln.'); },
  };
}

let scrErgebnis = [];

async function starteGruppenprobe() {
  const db = getDb();
  const a = getMeister();
  if (!(a.charaktere || []).length) { sprache.sage('Keine Helden in der Gruppe.'); return; }
  const begriff = await textDialog({ titel: 'Gruppenprobe', label: 'Fertigkeit oder Attribut' });
  if (begriff === null || !begriff.trim()) return;
  const deutung = deute(begriff.trim(), db);
  if (deutung.typ === 'auskunft' || deutung.typ === 'abgeleitet') { sprache.sage('Bitte eine Fertigkeit, ein Talent oder ein Attribut angeben.'); return; }
  const anzahl = await knopfDialog({ titel: 'Wuerfel', knoepfe: [{ label: '1 W20, Konflikt', wert: 1 }, { label: '3 W20, entspannt', wert: 3 }] });
  if (anzahl === null) return;
  const schwierigkeit = await zahlDialog({ titel: 'Schwierigkeit', label: 'Schwierigkeit der Probe', wert: 12, min: 0, max: 40 });
  if (schwierigkeit === null) return;

  // Bei einem Talent wuerfelt der Talenttraeger mit Talent, alle anderen auf die
  // Fertigkeit ohne Talent — das leistet zeilen() bereits je Held.
  const rows = zeilen(deutung, db).filter(r => typeof r.probenwert === 'number');
  const ergebnisse = rows.map(r => {
    const res = verdeckteProbeStumm(r, schwierigkeit, anzahl);
    const wtext = res.n === 3 ? `drei W20 ${res.wuerfe.join(', ')}, mittlerer ${res.wert}` : `ein W20 ${res.wert}`;
    const detail = `${r.name}, ${r.was}. ${wtext}, plus Probenwert ${r.probenwert}. Ergebnis ${res.ew}. Gegen Schwierigkeit ${schwierigkeit}: ${res.gelungen ? 'gelungen' : 'misslungen'}.`;
    return { name: r.name, ew: res.ew, gelungen: res.gelungen, detail };
  });
  ergebnisse.sort((x, y) => y.ew - x.ew);
  const was = deutung.name || deutung.talentName || deutung.fdef?.name || begriff.trim();
  scrErgebnis = ergebnisse.map(e => ({ label: `${e.name}: Ergebnis ${e.ew}, ${e.gelungen ? 'gelungen' : 'misslungen'}`, detail: e.detail }));
  const geschafft = ergebnisse.filter(e => e.gelungen).length;
  const zusammen = `Gruppenprobe ${was} gegen ${schwierigkeit}. ${geschafft} von ${ergebnisse.length} gelungen. `
    + ergebnisse.map(e => `${e.name} ${e.ew} ${e.gelungen ? 'gelungen' : 'misslungen'}`).join('. ') + '.';
  const am = getMeister();
  if (am) { const { protokolliere } = await import('../core/meister-abenteuer.js'); protokolliere(am, zusammen); const { speichere } = await import('./state.js'); speichere(); }
  screen.refresh();
  sprache.sage(zusammen);
}

/** Wie verdeckteProbe, aber ohne einzelne Ansage (fuer die Gruppenprobe-Sammelansage). */
function verdeckteProbeStumm(r, schwierigkeit, anzahl) {
  const wuerfe = [];
  const n = anzahl === 1 ? 1 : 3;
  for (let i = 0; i < n; i++) wuerfe.push(1 + Math.floor(Math.random() * 20));
  const s = [...wuerfe].sort((a, b) => a - b);
  const wert = n === 3 ? s[1] : wuerfe[0];
  const ew = wert + (r.probenwert || 0);
  return { ew, gelungen: ew >= schwierigkeit, wuerfe, wert, n };
}
