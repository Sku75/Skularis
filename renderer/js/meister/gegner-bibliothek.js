/**
 * Skularistool — Meistertisch: globale Gegner-Bibliothek.
 *
 * Ueber allen Meisterabenteuern liegt eine grosse Sammlung: das mitgelieferte
 * Bestiarium (nach Ilaris uebersetzt, in Kategorien) plus die eigene, global
 * gespeicherte Bibliothek des Meisters. Aufbau des Bildschirms:
 *   - Meine Auswahl: die Gegner dieses Abenteuers (a.nsc), auf den Spieltisch legbar.
 *   - Gesamtliste: alle Gegner, filterbar. Enter uebernimmt in die Auswahl.
 *   - je Kategorie eine Liste. Enter uebernimmt in die Auswahl.
 *   - Eigene Gegner: die selbst erstellten, mit Editor.
 *   - Neuen Gegner erstellen.
 * Enter auf einem Gegner kopiert ihn in a.nsc (die Auswahl des Abenteuers).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, zahlDialog, jaNeinDialog, spinnerDialog } from '../ui/dialog.js';
import { BESTIARIUM } from '../daten/gegner-bestiarium.js';
import { statblockAusVorlage, angriffeText } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { gegnerkarteiScreen } from './gegnerkartei.js';

const ipc = window.skularis?.ipc;

let _userBib = null;

async function ladeUserBib() {
  if (_userBib) return _userBib;
  try { const r = await ipc.gegnerBibLaden(); _userBib = r && r.inhalt ? JSON.parse(r.inhalt) : { gegner: [] }; }
  catch { _userBib = { gegner: [] }; }
  if (!_userBib || !Array.isArray(_userBib.gegner)) _userBib = { gegner: [] };
  return _userBib;
}
async function speichereUserBib() {
  try { await ipc.gegnerBibSpeichern(JSON.stringify(_userBib || { gegner: [] }, null, 2)); }
  catch (e) { console.error('Gegner-Bibliothek speichern:', e); }
}

function vorlageDetail(v) {
  const faeh = [...(v.vorteile || []), ...(v.manoever || [])];
  return [
    `${v.name}${v.kategorie ? ', ' + v.kategorie : ''}. Wundschwelle ${v.ws}, Ruestung ${v.rs}, Initiative ${v.ini}.`,
    angriffeText(v) || 'Keine Angriffe.',
    faeh.length ? `Faehigkeiten: ${faeh.join(', ')}.` : '',
    v.notizen ? `Notizen: ${v.notizen}` : '',
  ].filter(Boolean).join(' ');
}

/** Einen Bibliotheks-Gegner in die Auswahl des Abenteuers uebernehmen. */
function uebernehmen(v) {
  const a = getMeister();
  a.nsc.push(statblockAusVorlage(a, v));
  speichere();
  sounds.playOeffnen();
  sprache.sage(`${v.name} in deine Auswahl uebernommen. ${a.nsc.length} Gegner in der Auswahl.`);
}

/** Liste von Gegner-Vorlagen; Enter uebernimmt in die Auswahl. */
function vorlagenListe(titel, vorlagen, filter) {
  return menuScreen({
    title: titel,
    subtitle: 'Enter uebernimmt den Gegner in deine Auswahl. Shift und Pfeil-runter liest die Werte. Escape zurueck.',
    items: vorlagen.map(v => ({
      label: v.name,
      hint: `Wundschwelle ${v.ws}, Ruestung ${v.rs}, Initiative ${v.ini}`,
      detail: vorlageDetail(v),
      onSelect: () => uebernehmen(v),
    })),
    filter: !!filter,
    leer: 'Keine Gegner.',
  });
}

export function gegnerBibliothekScreen() {
  const scr = {
    title: 'Gegner-Bibliothek',
    _geladen: false,
    async lade() { await ladeUserBib(); scr._geladen = true; screen.refresh(); },
    build() {
      const a = getMeister();
      const alle = [];
      for (const kat of BESTIARIUM) for (const g of kat.gegner) alle.push({ ...g, kategorie: kat.kategorie });
      for (const g of (_userBib && _userBib.gegner) || []) alle.push({ ...g, kategorie: g.kategorie || 'Eigene Gegner' });

      const items = [];
      items.push({ label: `Meine Auswahl, ${a.nsc.length}`, hint: 'die Gegner dieses Abenteuers, auf den Spieltisch legbar', onSelect: () => screen.push(gegnerkarteiScreen('gegner')) });
      items.push({ label: 'Gesamtliste', hint: `alle ${alle.length} Gegner, filterbar`, onSelect: () => screen.push(vorlagenListe('Gesamtliste', alle, true)) });

      for (const kat of BESTIARIUM) {
        items.push({ label: kat.kategorie, hint: `${kat.gegner.length} Gegner`, onSelect: () => screen.push(vorlagenListe(kat.kategorie, kat.gegner.map(g => ({ ...g, kategorie: kat.kategorie })), kat.gegner.length >= 10)) });
      }

      const eigene = (_userBib && _userBib.gegner) || [];
      items.push({ label: `Eigene Gegner, ${eigene.length}`, hint: 'selbst erstellte Gegner, bearbeitbar', onSelect: () => screen.push(eigeneListeScreen()) });
      items.push({ label: 'Neuen Gegner erstellen', hint: 'eigenen Gegner anlegen und in die Bibliothek speichern', onSelect: () => neuerGegner() });
      items.push({ label: 'Gegner generieren', hint: 'aus Gefaehrlichkeit und Art schnell erzeugen', onSelect: () => generiereGegner() });

      return menuScreen({
        title: this.title,
        subtitle: 'Gesamtliste oder Kategorie oeffnen, Enter uebernimmt einen Gegner in deine Auswahl. Escape zurueck.',
        items,
      }).build();
    },
    onShow() {
      if (!scr._geladen) scr.lade();
      else sprache.sage('Gegner-Bibliothek. Erster Punkt Gesamtliste mit Filter, darunter die Kategorien.');
    },
  };
  return scr;
}

// --- Eigene Bibliothek: Liste, Anlegen, Bearbeiten ---

function eigeneListeScreen() {
  return {
    title: '',
    build() {
      const eigene = (_userBib && _userBib.gegner) || [];
      this.title = `Eigene Gegner, ${eigene.length}`;
      const items = eigene.map((g, i) => ({
        label: g.name || 'Gegner',
        hint: `Wundschwelle ${g.ws}, Ruestung ${g.rs}. Enter: uebernehmen, bearbeiten, loeschen`,
        detail: vorlageDetail(g),
        onSelect: () => screen.push(eigenEintragScreen(i)),
      }));
      items.push({ label: 'Neuen Gegner erstellen', onSelect: () => neuerGegner() });
      return menuScreen({ title: this.title, subtitle: 'Escape zurueck.', items, leer: 'Noch keine eigenen Gegner.' }).build();
    },
  };
}

function eigenEintragScreen(index) {
  return {
    title: '',
    build() {
      const g = (_userBib.gegner || [])[index];
      if (!g) { screen.pop(); return document.createElement('div'); }
      this.title = g.name || 'Gegner';
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'In die Auswahl uebernehmen', onSelect: () => uebernehmen(g) },
          { label: 'Bearbeiten', onSelect: () => screen.push(editorScreen(g, async () => { await speichereUserBib(); })) },
          {
            label: 'Aus der Bibliothek loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `${g.name} aus der Bibliothek loeschen?` })) return;
              _userBib.gegner.splice(index, 1);
              await speichereUserBib();
              screen.pop();
              sprache.sage(`${g.name} geloescht.`);
            },
          },
        ],
      }).build();
    },
  };
}

const GEFAHR = [
  { name: 'Schwach', ws: 4, rs: 0, at: 9, pa: 8, wuerfel: 1, bonus: 1, ini: 3 },
  { name: 'Normal', ws: 6, rs: 1, at: 11, pa: 10, wuerfel: 1, bonus: 3, ini: 4 },
  { name: 'Stark', ws: 8, rs: 2, at: 13, pa: 11, wuerfel: 1, bonus: 5, ini: 5 },
  { name: 'Sehr stark', ws: 11, rs: 3, at: 14, pa: 12, wuerfel: 2, bonus: 6, ini: 5 },
  { name: 'Legendaer', ws: 15, rs: 5, at: 16, pa: 13, wuerfel: 3, bonus: 8, ini: 6 },
];
const ARTEN = [
  { name: 'Mensch', angriff: 'Waffe', hatPa: true, vorteile: [] },
  { name: 'Tier', angriff: 'Biss', hatPa: false, vorteile: ['Flink'] },
  { name: 'Ork oder Oger', angriff: 'Wuchtwaffe', hatPa: true, vorteile: ['Zaeh'] },
  { name: 'Untot', angriff: 'Klauen', hatPa: true, vorteile: ['Untot', 'Schmerzlos'] },
  { name: 'Daemon', angriff: 'Krallen', hatPa: true, vorteile: ['Daemonisch', 'Furchteinfloessend'] },
  { name: 'Bestie oder Drache', angriff: 'Biss', hatPa: true, vorteile: ['Zaeh', 'Furchteinfloessend'] },
];

async function generiereGegner() {
  await ladeUserBib();
  const gefahr = await spinnerDialog({ titel: 'Gefaehrlichkeit', optionen: GEFAHR, index: 1, format: (g) => g.name });
  if (gefahr === null) return;
  const art = await spinnerDialog({ titel: 'Art', optionen: ARTEN, index: 0, format: (a) => a.name });
  if (art === null) return;
  const name = await textDialog({ titel: 'Name', label: 'Name des Gegners', wert: `${gefahr.name}er ${art.name}` });
  if (name === null || !name.trim()) return;
  const g = {
    name: name.trim(),
    kategorie: `Generiert, ${art.name}`,
    ws: gefahr.ws, rs: gefahr.rs, ini: gefahr.ini,
    angriffe: [{ name: art.angriff, at: gefahr.at, pa: art.hatPa ? gefahr.pa : null, wuerfel: gefahr.wuerfel, seiten: 6, bonus: gefahr.bonus }],
    vorteile: [...art.vorteile], manoever: [], notizen: 'Generiert. Werte bei Bedarf im Editor anpassen.',
  };
  _userBib.gegner.push(g);
  await speichereUserBib();
  screen.refresh();
  sounds.playOeffnen();
  sprache.sage(`${g.name} generiert und in die eigene Bibliothek gelegt. Wundschwelle ${g.ws}, Angriff ${gefahr.at}.`);
}

async function neuerGegner() {
  const name = await textDialog({ titel: 'Neuer Gegner', label: 'Name' });
  if (name === null || !name.trim()) return;
  await ladeUserBib();
  const g = { name: name.trim(), kategorie: 'Eigene Gegner', ws: 6, rs: 1, ini: 4, angriffe: [], vorteile: [], manoever: [], notizen: '' };
  _userBib.gegner.push(g);
  await speichereUserBib();
  screen.push(editorScreen(g, async () => { await speichereUserBib(); }));
}

/** Editor fuer einen Gegner-Statblock (Bibliothek oder Auswahl). onChange nach jeder Aenderung. */
export function editorScreen(sb, onChange) {
  const sichern = () => { if (onChange) Promise.resolve(onChange()).catch(() => {}); };
  return {
    title: '',
    build() {
      this.title = sb.name || 'Gegner';
      const items = [];
      const textFeld = (label, key) => items.push({
        label: `${label}: ${sb[key] || ''}`,
        onSelect: async () => { const v = await textDialog({ titel: label, label, wert: sb[key] || '' }); if (v === null) return; sb[key] = v.trim(); sichern(); screen.refresh(); sprache.sage(`${label} ${sb[key]}.`); },
      });
      const zahlFeld = (label, key, min, max) => items.push({
        label: `${label}: ${sb[key]}`,
        onSelect: async () => { const v = await zahlDialog({ titel: label, label, wert: sb[key] || 0, min, max }); if (v === null) return; sb[key] = v; sichern(); screen.refresh(); sprache.sage(`${label} ${v}.`); },
      });
      const listeFeld = (label, key) => items.push({
        label: `${label}: ${(sb[key] || []).join(', ') || 'keine'}`,
        hint: 'Komma-getrennt eingeben',
        onSelect: async () => { const v = await textDialog({ titel: label, label: `${label}, Komma-getrennt`, wert: (sb[key] || []).join(', ') }); if (v === null) return; sb[key] = v.split(',').map(s => s.trim()).filter(Boolean); sichern(); screen.refresh(); sprache.sage(`${label} gespeichert.`); },
      });

      textFeld('Name', 'name');
      textFeld('Kategorie', 'kategorie');
      zahlFeld('Wundschwelle', 'ws', 0, 60);
      zahlFeld('Ruestung', 'rs', 0, 20);
      zahlFeld('Initiative', 'ini', -20, 40);

      (sb.angriffe || []).forEach((ang, ai) => {
        items.push({
          label: `Angriff ${ang.name}: Attacke ${ang.at != null ? ang.at : ang.wert || 0}${ang.pa != null ? ', Parade ' + ang.pa : ''}, Schaden ${ang.wuerfel || 0} W ${ang.seiten || 6}${ang.bonus ? ' plus ' + ang.bonus : ''}`,
          hint: 'Enter: bearbeiten oder entfernen',
          onSelect: () => screen.push(angriffEditorScreen(sb, ai, sichern)),
        });
      });
      items.push({ label: 'Angriff hinzufuegen', onSelect: () => neuerAngriff(sb, sichern) });

      listeFeld('Vorteile', 'vorteile');
      listeFeld('Manoever', 'manoever');
      textFeld('Notizen', 'notizen');

      return menuScreen({ title: this.title, subtitle: 'Werte aendern, Angriffe pflegen. Escape zurueck.', items }).build();
    },
  };
}

async function neuerAngriff(sb, sichern) {
  const name = await textDialog({ titel: 'Angriff', label: 'Name, z. B. Krummsaebel' });
  if (name === null || !name.trim()) return;
  const at = await zahlDialog({ titel: 'Attacke', label: 'Attacke-Wert (AT)', wert: 12, min: 0, max: 40 });
  if (at === null) return;
  const pa = await zahlDialog({ titel: 'Parade', label: 'Parade-Wert (PA), 0 wenn keine', wert: 0, min: 0, max: 40 });
  if (pa === null) return;
  const wuerfel = await zahlDialog({ titel: 'Schadenswuerfel', label: 'Anzahl Wuerfel', wert: 1, min: 0, max: 20 });
  if (wuerfel === null) return;
  const seiten = await spinnerDialog({ titel: 'Wuerfeltyp', optionen: [6, 20], index: 0, format: (v) => `W${v}` });
  if (seiten === null) return;
  const bonus = await zahlDialog({ titel: 'Schadensbonus', label: 'Fester Schadensbonus, 0 wenn keiner', wert: 0, min: -20, max: 40 });
  if (bonus === null) return;
  sb.angriffe.push({ name: name.trim(), at, pa: pa || null, wuerfel, seiten, bonus });
  sichern(); screen.refresh(); sprache.sage(`Angriff ${name.trim()} hinzugefuegt.`);
}

function angriffEditorScreen(sb, ai, sichern) {
  return {
    title: '',
    build() {
      const ang = sb.angriffe[ai];
      if (!ang) { screen.pop(); return document.createElement('div'); }
      this.title = `Angriff ${ang.name}`;
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurueck.',
        items: [
          {
            label: 'Werte bearbeiten',
            onSelect: async () => {
              const at = await zahlDialog({ titel: 'Attacke', label: 'Attacke (AT)', wert: ang.at != null ? ang.at : ang.wert || 0, min: 0, max: 40 }); if (at === null) return;
              const pa = await zahlDialog({ titel: 'Parade', label: 'Parade (PA), 0 wenn keine', wert: ang.pa || 0, min: 0, max: 40 }); if (pa === null) return;
              const wuerfel = await zahlDialog({ titel: 'Schadenswuerfel', label: 'Anzahl Wuerfel', wert: ang.wuerfel || 0, min: 0, max: 20 }); if (wuerfel === null) return;
              const bonus = await zahlDialog({ titel: 'Schadensbonus', label: 'Schadensbonus', wert: ang.bonus || 0, min: -20, max: 40 }); if (bonus === null) return;
              ang.at = at; ang.pa = pa || null; ang.wuerfel = wuerfel; ang.bonus = bonus; delete ang.wert;
              sichern(); screen.refresh(); sprache.sage('Angriff geaendert.');
            },
          },
          {
            label: 'Angriff entfernen',
            onSelect: async () => { if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Angriff ${ang.name} entfernen?` })) return; sb.angriffe.splice(ai, 1); sichern(); screen.pop(); sprache.sage('Angriff entfernt.'); },
          },
        ],
      }).build();
    },
  };
}
