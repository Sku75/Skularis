/**
 * Skularistool — Meistertisch: kategorisierte Gegner-Ansicht für "Bestücken".
 *
 * Zwei Quellen zusammengeführt: das mitgelieferte Bestiarium (fest, kategorisiert,
 * nur lesen) und die eigenen Gegner des Abenteuers (a.nsc, mit Feld kategorie).
 * Aufbau nach Nutzerwunsch/Council:
 *   1. Gegner erstellen (Name -> Kategorie wählen, auch eigene) -> Statblock-Editor
 *   2. Kategorienübersicht (alle Kategorien mit Anzahl, "Sonstige", Kategorie erstellen)
 *   3. Filterzeile (durchsucht alle Gegner nach Namen)
 *   4. Alle Gegner (flache, gefilterte Liste)
 * Enter auf einem Gegner legt ihn als Kampfkarte auf den Spieltisch.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, knopfDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, verbindeDetail } from '../editor/widgets.js';
import { BESTIARIUM } from '../daten/gegner-bestiarium.js';
import { baueStatblockKarte, angriffeText, leererStatblock } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { statblockScreen } from './gegnerkartei.js';
import { ladeUserBib, eigeneGegner, generiereGegner, neuerGegner, eigeneListeScreen } from './gegner-bibliothek.js';

/**
 * Alle Gegner als eine flache Liste, aus drei Quellen zusammengeführt:
 * die eigenen Gegner des Abenteuers (a.nsc), die globale eigene Bibliothek und
 * das mitgelieferte Bestiarium. Doppelte (gleicher Name) erscheinen nur EINMAL;
 * die eigene Version gewinnt (a.nsc vor Bibliothek vor Bestiarium).
 */
function alleGegner(a) {
  const out = [];
  const seen = new Set();
  const add = (g, quelle, index) => {
    const key = (g.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...g, kategorie: g.kategorie || '', quelle, index });
  };
  (a.nsc || []).forEach((sb, i) => add(sb, 'nsc', i));
  for (const g of eigeneGegner()) add(g, 'bib');
  for (const kat of BESTIARIUM) for (const g of kat.gegner) add({ ...g, kategorie: kat.kategorie }, 'bestiarium');
  return out;
}

/** Geordnete Kategorienamen: feste Bestiarium-Kategorien, dann eigene, dann Rest. */
function kategorienNamen(a, alle) {
  const feste = BESTIARIUM.map(k => k.kategorie);
  const custom = a.gegnerKategorien || [];
  const vorhanden = new Set(alle.map(g => g.kategorie).filter(Boolean));
  const namen = [];
  for (const k of feste) if (vorhanden.has(k)) namen.push(k);
  for (const k of custom) if (!namen.includes(k)) namen.push(k); // eigene auch, wenn noch leer
  for (const k of vorhanden) if (!namen.includes(k)) namen.push(k);
  return namen;
}

function gegnerDetail(g) {
  const faeh = [...(g.vorteile || []), ...(g.manoever || [])];
  return [
    `${g.name}${g.kategorie ? ', ' + g.kategorie : ''}. Wundschwelle ${g.ws}, Rüstung ${g.rs}, Initiative ${g.ini}${g.ausweichen ? `, Ausweichen ${g.ausweichen}` : ''}.`,
    angriffeText(g) || 'Keine Angriffe.',
    faeh.length ? `Fähigkeiten: ${faeh.join(', ')}.` : '',
    g.notizen ? `Notizen: ${g.notizen}` : '',
  ].filter(Boolean).join(' ');
}

/** Einen Gegner als Kampfkarte auf den Spieltisch legen. */
function aufTisch(g) {
  const a = getMeister();
  a.tisch.karten.push(baueStatblockKarte(a, g, 'gegner'));
  speichere();
  sounds.playOeffnen();
  sprache.sage(`${g.name} auf den Spieltisch, ${a.tisch.karten.length} Karten.`);
}

/** Neuen eigenen Gegner anlegen: Name, Kategorie wählen, dann in den Editor. */
async function erstelleGegner() {
  const a = getMeister();
  const name = await textDialog({ titel: 'Neuer Gegner', label: 'Name' });
  if (name === null || !name.trim()) return;

  const alle = alleGegner(a);
  const knoepfe = kategorienNamen(a, alle).map(k => ({ label: k, wert: k }));
  knoepfe.push({ label: 'Sonstige (ohne Kategorie)', wert: '' });
  knoepfe.push({ label: 'Neue Kategorie anlegen', wert: '__neu' });
  let kat = await knopfDialog({ titel: 'Kategorie wählen', knoepfe });
  if (kat === null) return;
  if (kat === '__neu') {
    const nk = await textDialog({ titel: 'Neue Kategorie', label: 'Name der Kategorie' });
    if (nk === null || !nk.trim()) return;
    kat = nk.trim();
    a.gegnerKategorien = a.gegnerKategorien || [];
    if (!a.gegnerKategorien.includes(kat)) a.gegnerKategorien.push(kat);
  }

  const sb = leererStatblock(a);
  sb.name = name.trim();
  sb.kategorie = kat;
  a.nsc.push(sb);
  await speichere();
  screen.push(statblockScreen('gegner', a.nsc.length - 1));
}

/** Kategorienübersicht: je Kategorie eine Liste, "Sonstige", Kategorie erstellen. */
function kategorienScreen() {
  return {
    title: 'Kategorienübersicht',
    build() {
      const a = getMeister();
      const alle = alleGegner(a);
      const items = kategorienNamen(a, alle).map(k => {
        const n = alle.filter(g => g.kategorie === k).length;
        return { label: `${k}, ${n}`, hint: 'Gegner dieser Kategorie', onSelect: () => screen.push(kategorieGegnerScreen(k, k)) };
      });
      const ohne = alle.filter(g => !g.kategorie).length;
      if (ohne) items.push({ label: `Sonstige, ${ohne}`, hint: 'Gegner ohne Kategorie', onSelect: () => screen.push(kategorieGegnerScreen('', 'Sonstige')) });
      items.push({
        label: 'Kategorie erstellen',
        hint: 'eine neue eigene Kategorie anlegen',
        onSelect: async () => {
          const nm = await textDialog({ titel: 'Neue Kategorie', label: 'Name der Kategorie' });
          if (nm === null || !nm.trim()) return;
          const k = nm.trim();
          a.gegnerKategorien = a.gegnerKategorien || [];
          if (!a.gegnerKategorien.includes(k)) a.gegnerKategorien.push(k);
          await speichere();
          screen.refresh();
          sprache.sage(`Kategorie ${k} angelegt.`);
        },
      });
      return menuScreen({
        title: 'Kategorienübersicht',
        subtitle: 'Kategorie öffnen, Enter legt einen Gegner auf den Spieltisch. Unten Kategorie erstellen. Escape zurück.',
        items, leer: 'Noch keine Kategorien.',
      }).build();
    },
    onShow() { sprache.sage('Kategorienübersicht.'); },
  };
}

function kategorieGegnerScreen(katKey, katLabel) {
  return {
    title: katLabel,
    build() {
      const a = getMeister();
      const liste = alleGegner(a).filter(g => (g.kategorie || '') === katKey);
      const items = liste.map(g => ({
        label: g.name || '(ohne Name)',
        hint: `Wundschwelle ${g.ws}, Rüstung ${g.rs}. Enter legt auf den Spieltisch`,
        detail: gegnerDetail(g),
        onSelect: () => aufTisch(g),
      }));
      return menuScreen({
        title: katLabel,
        subtitle: 'Enter legt den Gegner auf den Spieltisch. Escape zurück.',
        items, leer: 'Keine Gegner in dieser Kategorie.', filter: liste.length >= 10,
      }).build();
    },
    onShow() { sprache.sage(katLabel + '.'); },
  };
}

/** Hauptansicht "Bestücken -> Gegner". */
export function gegnerBestueckenScreen() {
  const scr = {
    title: 'Gegner',
    __filter: '',
    build() {
      const a = getMeister();
      a.gegnerKategorien = Array.isArray(a.gegnerKategorien) ? a.gegnerKategorien : [];
      const alle = alleGegner(a);
      const q = (scr.__filter || '').toLowerCase();
      const treffer = q ? alle.filter(g => (g.name || '').toLowerCase().includes(q)) : alle;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Gegner'));

      // 1. Erstellen / Generieren / eigene bearbeiten
      wrap.appendChild(aktionZeile('Gegner erstellen', () => erstelleGegner(), 'Name, Kategorie wählen, dann Werte eintragen'));
      wrap.appendChild(aktionZeile('Gegner generieren', async () => { await generiereGegner(); screen.refresh(); }, 'aus Gefährlichkeit und Art schnell einen Gegner erzeugen (eigene Bibliothek)'));
      wrap.appendChild(aktionZeile('Eigene Gegner bearbeiten', () => screen.push(eigeneListeScreen()), 'die selbst erstellten Gegner der Bibliothek ändern oder löschen'));
      // 2. Kategorienübersicht
      wrap.appendChild(aktionZeile('Kategorienübersicht', () => screen.push(kategorienScreen()), 'Gegner nach Kategorien, Sonstige, Kategorie erstellen'));

      // 3. Filterzeile
      if (alle.length) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'alle Gegner nach Namen durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${alle.length}`));
        }
      }

      // 4. Alle Gegner (flach)
      for (const g of treffer) {
        wrap.appendChild(aktionZeile(g.name || '(ohne Name)', () => aufTisch(g), `Wundschwelle ${g.ws}, Rüstung ${g.rs}. Enter legt auf den Spieltisch`, gegnerDetail(g)));
      }

      if (!alle.length) wrap.appendChild(infoZeile('Noch keine Gegner. Oben einen erstellen.', ''));
      else if (scr.__filter && !treffer.length) wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zurücksetzen.'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      if (!scr.__bibGeladen) {
        scr.__bibGeladen = true;
        ladeUserBib().then(() => screen.refresh()).catch(() => {});
      }
      sprache.sage('Gegner. Oben Erstellen, Generieren, eigene bearbeiten, Kategorienübersicht, Filter, dann alle Gegner. Enter legt einen Gegner auf den Spieltisch.');
    },
  };
  return scr;
}
