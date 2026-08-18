/**
 * Skularistool — Meistertisch: Szenen-Packs (Vorbereitung).
 *
 * Der Meister bereitet Kartensets (Szenen-Packs) vor und ruft sie im Spiel ab.
 * Struktur: Meine Kampfszenenpacks -> Abenteuer (Kategorie) -> Kampfszenenpacks -> Karten.
 * Gespeichert wird userindividuell im Ordner "Meister Daten" (Kampfszenenpacks.json),
 * getrennt vom Programm — bleibt bei Updates erhalten und ist transportierbar.
 *
 * Ein Pack-Kartentemplate hat keine Laufzeitfelder (Wunden, Zuordnung, Id); die
 * bekommt es erst beim Laden auf den Kampfspieltisch.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { textDialog, zahlDialog, jaNeinDialog, knopfDialog, spinnerDialog } from '../ui/dialog.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { baueSpielerKarte, angriffeText, naechsteId } from '../core/meister-abenteuer.js';
import { BESTIARIUM } from '../daten/gegner-bestiarium.js';
import { getMeister } from './state.js';

const ipc = window.skularis?.ipc;

// --- Speicher (global, im Ordner Meister Daten) --------------------------

let _store = null;
export async function ladeStore() {
  if (_store) return _store;
  try { const r = await ipc.szenenpacksLaden(); _store = r && r.inhalt ? JSON.parse(r.inhalt) : { abenteuer: [] }; }
  catch { _store = { abenteuer: [] }; }
  if (!_store || !Array.isArray(_store.abenteuer)) _store = { abenteuer: [] };
  return _store;
}
async function speichere() {
  try { await ipc.szenenpacksSpeichern(JSON.stringify(_store || { abenteuer: [] }, null, 2)); }
  catch (e) { console.error('Kampfszenenpacks speichern:', e); }
}
function abHolen(name) {
  let ab = _store.abenteuer.find(x => x.name === name);
  if (!ab) { ab = { name, packs: [] }; _store.abenteuer.unshift(ab); }
  return ab;
}
function abVorziehen(ab) {
  const i = _store.abenteuer.indexOf(ab);
  if (i > 0) { _store.abenteuer.splice(i, 1); _store.abenteuer.unshift(ab); }
}

// --- Kartentemplates -----------------------------------------------------

function vorlageZuKarte(v, art) {
  return {
    name: v.name || (art === 'freund' ? 'NPC' : 'Gegner'),
    art: art || 'gegner',
    kategorie: v.kategorie || '',
    ws: v.ws || 0, rs: v.rs || 0, ini: v.ini || 0,
    angriffe: (v.angriffe || []).map(x => ({ ...x })),
    vorteile: Array.isArray(v.vorteile) ? [...v.vorteile] : [],
    manoever: Array.isArray(v.manoever) ? [...v.manoever] : [],
    notizen: v.notizen || '',
  };
}

/** Ein Pack auf den Kampfspieltisch des aktiven Meisterabenteuers laden. */
export function ladeAufTisch(pack) {
  const a = getMeister();
  if (!a) return 0;
  let n = 0;
  for (const t of pack.karten || []) {
    a.tisch.karten.push({ ...JSON.parse(JSON.stringify(t)), id: naechsteId(a), wunden: 0, zuOrt: null });
    n++;
  }
  return n;
}

// --- Bildschirme ---------------------------------------------------------

export function szenenpacksScreen() {
  const scr = {
    title: 'Meine Kampfszenenpacks',
    _geladen: false,
    async lade() { await ladeStore(); scr._geladen = true; screen.refresh(); },
    build() {
      const items = [];
      items.push({ label: 'Neues Kampfszenenpack erstellen', hint: 'Abenteuer und Pack-Name eingeben', onSelect: () => neuesPack() });
      for (const ab of (_store && _store.abenteuer) || []) {
        items.push({ label: ab.name, hint: `${ab.packs.length} Kampfszenenpacks`, onSelect: () => screen.push(abenteuerScreen(ab)) });
      }
      return menuScreen({
        title: this.title,
        subtitle: 'Neues Kampfszenenpack oben, darunter deine Abenteuer. Escape zurueck.',
        items,
        leer: 'Noch keine Kampfszenenpacks. Oben ein neues erstellen.',
      }).build();
    },
    onShow() { if (!scr._geladen) scr.lade(); else sprache.sage('Meine Kampfszenenpacks.'); },
  };
  return scr;
}

async function neuesPack() {
  await ladeStore();
  const a = getMeister();
  const abName = await textDialog({ titel: 'Neues Kampfszenenpack', label: 'Zu welchem Abenteuer? Name', wert: (a && a.name) || '' });
  if (abName === null || !abName.trim()) return;
  const packName = await textDialog({ titel: 'Neues Kampfszenenpack', label: 'Name des Kampfszenenpacks' });
  if (packName === null || !packName.trim()) return;
  const ab = abHolen(abName.trim());
  abVorziehen(ab);
  const pack = { name: packName.trim(), karten: [] };
  ab.packs.push(pack);
  await speichere();
  sounds.playOeffnen();
  screen.push(kartenEditorScreen(pack, speichere));
  sprache.sage(`Kampfszenenpack ${pack.name} in Abenteuer ${ab.name} erstellt.`);
}

function abenteuerScreen(ab) {
  return {
    title: '',
    build() {
      this.title = `${ab.name}, ${ab.packs.length} Kampfszenenpacks`;
      const items = ab.packs.map(p => ({
        label: p.name,
        hint: `${p.karten.length} Karten. Enter: bearbeiten und mehr`,
        detail: (p.karten || []).map(k => k.name).join(', '),
        onSelect: () => screen.push(packUntermenueScreen(ab, p)),
      }));
      items.push({ label: 'Neues Kampfszenenpack in diesem Abenteuer', onSelect: () => neuesPackIn(ab) });
      return menuScreen({ title: this.title, subtitle: 'Enter oeffnet ein Kampfszenenpack. Escape zurueck.', items, leer: 'Noch keine Kampfszenenpacks in diesem Abenteuer.' }).build();
    },
  };
}

async function neuesPackIn(ab) {
  const packName = await textDialog({ titel: 'Neues Kampfszenenpack', label: 'Name des Kampfszenenpacks' });
  if (packName === null || !packName.trim()) return;
  const pack = { name: packName.trim(), karten: [] };
  ab.packs.push(pack);
  abVorziehen(ab);
  await speichere();
  screen.push(kartenEditorScreen(pack, speichere));
  sprache.sage(`Kampfszenenpack ${pack.name} erstellt.`);
}

function packUntermenueScreen(ab, pack) {
  return {
    title: '',
    build() {
      this.title = pack.name;
      return menuScreen({
        title: pack.name,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Bearbeiten', hint: 'Karten hinzufuegen und aendern', onSelect: () => screen.push(kartenEditorScreen(pack, speichere)) },
          { label: 'Auf den Kampfspieltisch laden', hint: 'die Karten des Packs auf den Tisch legen', onSelect: () => { const n = ladeAufTisch(pack); sounds.playOeffnen(); sprache.sage(`${n} Karten aus ${pack.name} auf den Kampfspieltisch geladen.`); } },
          { label: 'Umbenennen', onSelect: async () => { const v = await textDialog({ titel: 'Umbenennen', label: 'Neuer Name', wert: pack.name }); if (v === null || !v.trim()) return; pack.name = v.trim(); await speichere(); screen.refresh(); sprache.sage(`Umbenannt in ${pack.name}.`); } },
          { label: 'Verschieben', hint: 'in ein anderes Abenteuer', onSelect: () => verschiebePack(ab, pack) },
          {
            label: 'Loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Kampfszenenpack ${pack.name} loeschen?` })) return;
              const i = ab.packs.indexOf(pack); if (i >= 0) ab.packs.splice(i, 1);
              await speichere(); screen.pop(); sprache.sage('Geloescht.');
            },
          },
        ],
      }).build();
    },
  };
}

async function verschiebePack(ab, pack) {
  const ziele = _store.abenteuer.filter(x => x !== ab).map(x => ({ label: x.name, wert: x.name }));
  ziele.push({ label: 'Neues Abenteuer...', wert: '__neu' });
  const wahl = await knopfDialog({ titel: 'Verschieben nach', knoepfe: ziele });
  if (wahl === null) return;
  let zielName = wahl;
  if (wahl === '__neu') { const v = await textDialog({ titel: 'Neues Abenteuer', label: 'Name des Abenteuers' }); if (v === null || !v.trim()) return; zielName = v.trim(); }
  const ziel = abHolen(zielName);
  const i = ab.packs.indexOf(pack); if (i >= 0) ab.packs.splice(i, 1);
  ziel.packs.push(pack);
  abVorziehen(ziel);
  await speichere();
  screen.pop();
  sprache.sage(`${pack.name} nach ${ziel.name} verschoben.`);
}

// --- Pack-Editor: Karten hinzufuegen und pflegen -------------------------

/**
 * Generischer Karten-Editor fuer ein Objekt mit .name und .karten (Kampfszenenpack
 * ODER Szene). save() sichert nach jeder Aenderung (Pack -> globale Datei, Szene
 * -> Meisterabenteuer).
 */
export function kartenEditorScreen(obj, save) {
  const sichern = () => { if (save) Promise.resolve(save()).catch(() => {}); };
  const heldHinzu = async () => {
    let liste = [];
    try { liste = await ipc.bibliothekListe(); } catch { liste = []; }
    if (!liste.length) { sprache.sage('Keine Charaktere vorhanden.'); return; }
    auswahlScreen({
      titel: 'Held als Karte hinzufuegen',
      eintraege: liste.map(c => ({ label: c.name, wert: c.pfad })),
      onWahl: async (pfad) => {
        try {
          const db = await ladeDb();
          const res = await ipc.dateiDirektLaden(pfad);
          const bogen = parse(res.inhalt, db);
          const tmp = { _nextId: 0 };
          const k = baueSpielerKarte(tmp, bogen, db);
          delete k.id; delete k.wunden; delete k.zuOrt;
          obj.karten.push(k);
          sichern(); sprache.sage(`${k.name} hinzugefuegt.`);
        } catch (e) { console.error(e); sprache.sage('Held konnte nicht geladen werden.'); }
      },
    });
  };
  const vorlageHinzu = (art) => {
    const alle = [];
    for (const kat of BESTIARIUM) for (const g of kat.gegner) alle.push({ ...g, kategorie: kat.kategorie });
    auswahlScreen({
      titel: art === 'freund' ? 'Freundlichen NPC hinzufuegen' : 'Gegner hinzufuegen',
      eintraege: alle.map((g, i) => ({ label: `${g.name} (${g.kategorie})`, wert: i, detail: `Wundschwelle ${g.ws}, Ruestung ${g.rs}, Initiative ${g.ini}.` })),
      bleibt: true,
      onWahl: async (i) => { obj.karten.push(vorlageZuKarte(alle[i], art)); sichern(); sounds.playOeffnen(); sprache.sage(`${alle[i].name} hinzugefuegt.`); },
    });
  };
  const freieKarte = async () => {
    const name = await textDialog({ titel: 'Freie Karte', label: 'Name' }); if (name === null || !name.trim()) return;
    const ws = await zahlDialog({ titel: 'Wundschwelle', label: 'Wundschwelle', wert: 6, min: 0, max: 60 }); if (ws === null) return;
    const rs = await zahlDialog({ titel: 'Ruestung', label: 'Ruestungsschutz', wert: 0, min: 0, max: 20 }); if (rs === null) return;
    const ini = await zahlDialog({ titel: 'Initiative', label: 'Initiative', wert: 4, min: -20, max: 40 }); if (ini === null) return;
    const seite = await knopfDialog({ titel: 'Seite', knoepfe: [{ label: 'Gegner', wert: 'gegner' }, { label: 'Freund', wert: 'freund' }] }); if (seite === null) return;
    obj.karten.push({ name: name.trim(), art: seite, kategorie: 'Freie Karte', ws, rs, ini, angriffe: [], vorteile: [], manoever: [], notizen: '' });
    sichern(); screen.refresh(); sprache.sage(`Freie Karte ${name.trim()} hinzugefuegt.`);
  };
  return {
    title: '',
    build() {
      this.title = `${obj.name || 'Karten'}, ${(obj.karten || []).length} Karten`;
      const items = [];
      (obj.karten || []).forEach((k, i) => {
        items.push({
          label: `${k.name} (${artWort(k.art)})`,
          hint: 'Enter: umbenennen oder entfernen',
          detail: `${k.name}. Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}. ${angriffeText(k) || 'Keine Angriffe.'}`,
          onSelect: () => screen.push(karteEintragScreen(obj, i, save)),
        });
      });
      items.push({ label: 'Held auf den Tisch', hint: 'einen Spielerbogen als Karte hinzufuegen', onSelect: heldHinzu });
      items.push({ label: 'Gegner auf den Tisch', hint: 'aus der Gegner-Bibliothek', onSelect: () => vorlageHinzu('gegner') });
      items.push({ label: 'Freundlichen NPC auf den Tisch', hint: 'aus der Gegner-Bibliothek, als Freund', onSelect: () => vorlageHinzu('freund') });
      items.push({ label: 'Freie Karte auf den Tisch', hint: 'eigene Karte mit Eingabefeldern', onSelect: freieKarte });
      return menuScreen({ title: this.title, subtitle: 'Karten hinzufuegen. Escape zurueck.', items }).build();
    },
  };
}

function karteEintragScreen(obj, index, save) {
  const sichern = () => { if (save) Promise.resolve(save()).catch(() => {}); };
  return {
    title: '',
    build() {
      const k = obj.karten[index];
      if (!k) { screen.pop(); return document.createElement('div'); }
      this.title = k.name;
      return menuScreen({
        title: k.name,
        subtitle: 'Escape zurueck.',
        items: [
          { label: `Umbenennen (aktuell ${k.name})`, onSelect: async () => { const v = await textDialog({ titel: 'Umbenennen', label: 'Neuer Name', wert: k.name }); if (v === null || !v.trim()) return; k.name = v.trim(); sichern(); screen.refresh(); sprache.sage(`Umbenannt in ${k.name}.`); } },
          { label: 'Entfernen', onSelect: async () => { if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${k.name} entfernen?` })) return; obj.karten.splice(index, 1); sichern(); screen.pop(); sprache.sage('Entfernt.'); } },
        ],
      }).build();
    },
  };
}

function artWort(art) { return art === 'spieler' ? 'Held' : (art === 'freund' ? 'Freund' : 'Gegner'); }
