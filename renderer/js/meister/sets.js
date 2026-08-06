/**
 * Skularistool — Meistertisch: Spieltisch bestuecken und Sets.
 *
 * Ein aktiver Spieltisch (a.tisch.karten). Karten kommen entweder einzeln ueber
 * "Bestuecken" (Spieler, freundliche NPC, Gegner, fertige Sets) oder gebuendelt
 * ueber ein Set. Sets sind vorbereitete Kartenbuendel, global gespeichert (Ordner
 * Meister Daten), flach und alphabetisch, mit Filter. Ein Set kann Karten aller
 * Arten enthalten - so laesst sich auch die Spielergruppe als Set anlegen.
 *
 * Sets loesen die alten Kampfszenenpacks ab; deren Inhalte werden beim ersten
 * Laden einmalig in flache Sets migriert.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, verbindeDetail } from '../editor/widgets.js';
import { getDb, ladeDb } from '../core/db-laden.js';
import { getMeister, speichere } from './state.js';
import { baueSpielerKarte, baueStatblockKarte, angriffeText, leererStatblock } from '../core/meister-abenteuer.js';
import { statblockScreen } from './gegnerkartei.js';

const ipc = window.skularis?.ipc;

// --- Speicher (global, Ordner Meister Daten, Datei Kampfszenenpacks.json) ----

let _store = null; // { sets: [ { name, karten: [template] } ] }

/** Ein Kartentemplate hat KEINE Laufzeitfelder (id, wunden, zuOrt, kid). */
function template(t, art) {
  return {
    art: art || t.art || 'gegner',
    name: t.name || '',
    kategorie: t.kategorie || '',
    ws: t.ws || 0, rs: t.rs || 0, ini: t.ini || 0, ausweichen: t.ausweichen || 0,
    angriffe: (t.angriffe || []).map(x => ({ ...x })),
    vorteile: Array.isArray(t.vorteile) ? [...t.vorteile] : [],
    manoever: Array.isArray(t.manoever) ? [...t.manoever] : [],
    notizen: t.notizen || '',
  };
}

export async function ladeSets() {
  if (_store) return _store.sets;
  let roh = null;
  try { const r = await ipc.szenenpacksLaden(); roh = r && r.inhalt ? JSON.parse(r.inhalt) : null; } catch { roh = null; }
  if (roh && Array.isArray(roh.sets)) {
    _store = { sets: roh.sets };
  } else if (roh && Array.isArray(roh.abenteuer)) {
    // Migration: alte Kampfszenenpacks (Abenteuer -> Packs -> Karten) flach machen.
    const sets = [];
    for (const ab of roh.abenteuer) {
      for (const pack of (ab.packs || [])) {
        let name = pack.name || 'Set';
        if (sets.some(s => s.name === name)) name = `${ab.name || ''} ${name}`.trim();
        sets.push({ name, karten: (pack.karten || []).map(k => template(k, k.art)) });
      }
    }
    _store = { sets };
    await speichereSets();
  } else {
    _store = { sets: [] };
  }
  return _store.sets;
}

async function speichereSets() {
  try { await ipc.szenenpacksSpeichern(JSON.stringify(_store || { sets: [] }, null, 2)); }
  catch (e) { console.error('Sets speichern:', e); }
}

function sortiert(sets) { return [...sets].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de')); }

// --- Kartenquellen (Spieler, freundliche NPC, Gegner) --------------------

function quelleFuer(art) {
  const a = getMeister();
  if (art === 'spieler') return (a.charaktere || []).map(c => ({ name: c.name, bogen: c.bogen }));
  if (art === 'freund') return a.freundlicheNsc || [];
  return a.nsc || [];
}

function detailFuer(art, e) {
  if (art === 'spieler') return `Held ${e.name}`;
  return `${e.name}, Wundschwelle ${e.ws}, Ruestung ${e.rs}, Initiative ${e.ini}. ${angriffeText(e) || 'keine Angriffe'}`;
}

async function alsTemplate(art, e) {
  if (art === 'spieler') {
    const db = getDb() || await ladeDb();
    const k = baueSpielerKarte(getMeister(), e.bogen, db); // fertige Kampfkarte
    return template({ ...k, art: 'spieler' }, 'spieler');
  }
  return template(e, art);
}

/**
 * Kategorie-Auswahl (Spieler, freundliche NPC, Gegner). Enter auf einer Karte ruft
 * zielFn(template, art) und laesst den Fokus in der Liste (mehrere schnell waehlen).
 * bezeichnung: "zum Spieltisch" oder "zum Set".
 */
function kategorienScreen(titel, zielFn, bezeichnung) {
  const arten = [
    { art: 'spieler', label: 'Spieler' },
    { art: 'freund', label: 'Freundliche NPC' },
    { art: 'gegner', label: 'Gegner' },
  ];
  return {
    title: titel,
    build() {
      const items = arten.map(x => {
        const n = quelleFuer(x.art).length;
        return { label: `${x.label}, ${n}`, hint: `${bezeichnung} hinzufuegen`, onSelect: () => screen.push(quelleListeScreen(x.art, x.label, zielFn, bezeichnung)) };
      });
      return menuScreen({ title: titel, subtitle: `Kategorie waehlen, dann Enter fuegt eine Karte ${bezeichnung} hinzu. Escape zurueck.`, items }).build();
    },
  };
}

function quelleListeScreen(art, label, zielFn, bezeichnung) {
  const scr = {
    title: label,
    __filter: '',
    build() {
      const a = getMeister();
      const liste = quelleFuer(art);
      const q = (scr.__filter || '').toLowerCase();
      const treffer = q ? liste.filter(e => (e.name || '').toLowerCase().includes(q)) : liste;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(label));

      // Ganz oben: Statbloecke (freundliche NPC, Gegner) hier direkt erstellen.
      if (art === 'freund' || art === 'gegner') {
        const wort = art === 'freund' ? 'freundlichen NPC' : 'Gegner';
        wrap.appendChild(aktionZeile(`Neuen ${wort} erstellen`, async () => {
          const nm = await textDialog({ titel: `Neuer ${art === 'freund' ? 'NPC' : 'Gegner'}`, label: 'Name' });
          if (nm === null || !nm.trim()) return;
          const sb = leererStatblock(a); sb.name = nm.trim();
          (art === 'freund' ? a.freundlicheNsc : a.nsc).push(sb);
          await speichere();
          screen.push(statblockScreen(art, (art === 'freund' ? a.freundlicheNsc : a.nsc).length - 1));
        }, 'Name, Werte und Angriffe eintragen'));
      }

      // Darunter die Filterzeile (nur wenn es Eintraege gibt).
      if (liste.length) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'die Liste durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${liste.length}`));
        }
      }

      // Darunter die Karten; Enter fuegt hinzu.
      for (const e of treffer) {
        wrap.appendChild(aktionZeile(e.name || '(ohne Name)', async () => { const t = await alsTemplate(art, e); zielFn(t, art); }, `Enter fuegt ${bezeichnung} hinzu`, detailFuer(art, e)));
      }

      if (!liste.length) {
        wrap.appendChild(infoZeile(
          art === 'spieler' ? 'Keine Helden in der Gruppe.'
            : (art === 'freund' ? 'Noch keine freundlichen NPC. Oben einen erstellen.' : 'Keine Gegner in der Auswahl. Oben einen erstellen.'), ''));
      } else if (scr.__filter && !treffer.length) {
        wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zuruecksetzen.'));
      }

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() { sprache.sage(label + '.'); },
  };
  return scr;
}

// --- Spieltisch bestuecken -----------------------------------------------

/** Ein Template als frische Laufzeit-Karte auf den aktiven Tisch legen. */
export function templateZuTisch(a, t) {
  const karte = baueStatblockKarte(a, t, t.art); // universell fuer alle Arten
  a.tisch.karten.push(karte);
  return karte;
}

export function bestueckenScreen() {
  return {
    title: 'Spieltisch bestuecken',
    build() {
      const a = getMeister();
      const zumTisch = (t) => { const k = templateZuTisch(a, t); speichere(); sprache.sage(`${k.name} zum Spieltisch, ${a.tisch.karten.length} Karten.`); };
      const items = [];
      // Die drei Kategorien flach; Enter in der Liste legt eine Karte auf den Tisch.
      for (const x of [{ art: 'spieler', label: 'Spieler' }, { art: 'freund', label: 'Freundliche NPC' }, { art: 'gegner', label: 'Gegner' }]) {
        const n = quelleFuer(x.art).length;
        items.push({ label: `${x.label}, ${n}`, hint: 'Enter fuegt eine Karte zum Spieltisch hinzu', onSelect: () => screen.push(quelleListeScreen(x.art, x.label, zumTisch, 'zum Spieltisch')) });
      }
      items.push({ label: 'Fertige Sets', hint: 'ein ganzes Set auf den Spieltisch legen', onSelect: () => screen.push(setsWaehlenScreen()) });
      return menuScreen({ title: 'Spieltisch bestuecken', subtitle: 'Kategorie waehlen, Enter legt eine Karte auf den Spieltisch. Escape zurueck.', items }).build();
    },
    onShow() { sprache.sage('Spieltisch bestuecken.'); },
  };
}

/** Sets zum Auflegen (Bestuecken, Fertige Sets): Enter legt das ganze Set auf. */
function setsWaehlenScreen() {
  const scr = {
    title: 'Fertige Sets',
    _sets: null,
    __filter: '',
    async lade() { scr._sets = await ladeSets(); screen.refresh(); },
    build() {
      const a = getMeister();
      const alle = sortiert(scr._sets || []);
      const q = (scr.__filter || '').toLowerCase();
      const treffer = q ? alle.filter(s => (s.name || '').toLowerCase().includes(q)) : alle;
      const items = treffer.map(s => ({
        label: `${s.name}, ${(s.karten || []).length} Karten`,
        hint: 'Enter legt das ganze Set auf den Spieltisch',
        onSelect: () => {
          let n = 0;
          for (const t of (s.karten || [])) { templateZuTisch(a, t); n++; }
          speichere();
          sounds.playOeffnen();
          sprache.sage(`Set ${s.name}, ${n} Karten auf den Spieltisch gelegt.`);
        },
      }));
      return menuScreen({ title: 'Fertige Sets', subtitle: 'Enter legt das ganze Set auf den Spieltisch. Escape zurueck.', items, leer: 'Noch keine Sets. Lege eines unter Sets an.', filter: (scr._sets || []).length >= 8 }).build();
    },
    onShow() { if (scr._sets === null) scr.lade(); },
  };
  return scr;
}

// --- Sets verwalten ------------------------------------------------------

export function setsScreen() {
  const scr = {
    title: 'Sets',
    _sets: null,
    __filter: '',
    async lade() { scr._sets = await ladeSets(); screen.refresh(); },
    build() {
      const items = [];
      items.push({ label: 'Neues Set erstellen', hint: 'Name vergeben, dann Karten hinzufuegen', onSelect: () => neuesSet(scr) });
      const alle = sortiert(scr._sets || []);
      const q = (scr.__filter || '').toLowerCase();
      const treffer = q ? alle.filter(s => (s.name || '').toLowerCase().includes(q)) : alle;
      for (const s of treffer) {
        items.push({ label: `${s.name}, ${(s.karten || []).length} Karten`, hint: 'Zum Spieltisch, bearbeiten, loeschen', onSelect: () => screen.push(setEintragScreen(scr, s)) });
      }
      return menuScreen({
        title: 'Sets (vorbereitete Kartenbuendel)',
        subtitle: 'Oben ein neues Set, darunter die Sets alphabetisch. Escape zurueck.',
        items, filter: (scr._sets || []).length >= 8,
      }).build();
    },
    onShow() { if (scr._sets === null) scr.lade(); sprache.sage('Sets.'); },
  };
  return scr;
}

async function neuesSet(uebersicht) {
  const name = await textDialog({ titel: 'Neues Set', label: 'Name des Sets' });
  if (name === null || !name.trim()) return;
  await ladeSets();
  const s = { name: name.trim(), karten: [] };
  _store.sets.push(s);
  await speichereSets();
  uebersicht._sets = _store.sets;
  screen.push(setBearbeitenScreen(uebersicht, s));
  sprache.sage(`Set ${s.name} angelegt. Fuege Karten hinzu, dann Set speichern.`);
}

function setEintragScreen(uebersicht, s) {
  return {
    title: s.name,
    build() {
      return menuScreen({
        title: s.name,
        subtitle: 'Escape zurueck.',
        items: [
          {
            label: 'Zum Spieltisch hinzufuegen', hint: 'das ganze Set auf den aktiven Spieltisch legen',
            onSelect: () => {
              const a = getMeister();
              let n = 0; for (const t of (s.karten || [])) { templateZuTisch(a, t); n++; }
              speichere(); sounds.playOeffnen(); sprache.sage(`${n} Karten aus ${s.name} auf den Spieltisch gelegt.`);
            },
          },
          { label: 'Bearbeiten', hint: 'Name und Karten aendern', onSelect: () => screen.push(setBearbeitenScreen(uebersicht, s)) },
          {
            label: 'Loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Set ${s.name} loeschen?` })) return;
              const i = _store.sets.indexOf(s); if (i >= 0) _store.sets.splice(i, 1);
              await speichereSets(); uebersicht._sets = _store.sets; screen.pop(); sprache.sage(`Set ${s.name} geloescht.`);
            },
          },
        ],
      }).build();
    },
  };
}

function setBearbeitenScreen(uebersicht, s) {
  const scr = {
    title: s.name,
    build() {
      const items = [];
      items.push({
        label: `Setname: ${s.name}`, hint: 'umbenennen',
        onSelect: async () => { const v = await textDialog({ titel: 'Setname', label: 'Name', wert: s.name }); if (v === null || !v.trim()) return; s.name = v.trim(); await speichereSets(); screen.refresh(); sprache.sage(`Heisst jetzt ${s.name}.`); },
      });
      // Karten hinzufuegen ueber die Kategorien (Spieler, freundliche NPC, Gegner).
      const zielFn = async (t) => { s.karten.push(t); await speichereSets(); sprache.sage(`${t.name} zum Set, ${s.karten.length} Karten.`); };
      items.push({ label: 'Karten hinzufuegen', hint: 'Spieler, freundliche NPC oder Gegner ins Set', onSelect: () => screen.push(kategorienScreen('Karten ins Set', zielFn, 'zum Set')) });
      // Vorhandene Karten des Sets (Enter entfernt).
      (s.karten || []).forEach((t, i) => {
        items.push({
          label: `${t.name} (${artWort(t.art)})`,
          detail: detailFuer(t.art === 'spieler' ? 'spieler' : t.art, t),
          hint: 'Enter: aus dem Set entfernen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${t.name} aus dem Set entfernen?` })) return;
            s.karten.splice(i, 1); await speichereSets(); screen.refresh(); sprache.sage(`${t.name} entfernt.`);
          },
        });
      });
      items.push({ label: 'Set speichern', hint: 'Set sichern und zurueck', onSelect: async () => { await speichereSets(); if (uebersicht) uebersicht._sets = _store.sets; sounds.playSpeichern(); screen.pop(); sprache.sage(`Set ${s.name} gespeichert, ${s.karten.length} Karten.`); } });
      return menuScreen({ title: `Set: ${s.name}`, subtitle: 'Oben Name, dann Karten hinzufuegen, darunter die Karten des Sets, unten Set speichern. Escape zurueck.', items }).build();
    },
  };
  return scr;
}

function artWort(art) { return art === 'spieler' ? 'Held' : (art === 'freund' ? 'Freund' : 'Gegner'); }

/**
 * Ein Set aus einer Liste von Gegner-Statbloecken erstellen (fuer die Gegner-
 * Bibliothek: "Set erstellen" aus der Auswahl a.nsc). Fragt nach dem Namen.
 */
export async function setAusGegnern(gegnerListe) {
  if (!gegnerListe || !gegnerListe.length) { sprache.sage('Keine Gegner in der Auswahl.'); return; }
  const name = await textDialog({ titel: 'Set erstellen', label: 'Name des Sets' });
  if (name === null || !name.trim()) return;
  await ladeSets();
  _store.sets.push({ name: name.trim(), karten: gegnerListe.map(g => template(g, 'gegner')) });
  await speichereSets();
  sounds.playSpeichern();
  sprache.sage(`Set ${name.trim()} mit ${gegnerListe.length} Gegnern erstellt. Es erscheint beim Bestuecken unter Fertige Sets.`);
}
