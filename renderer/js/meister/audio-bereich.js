/**
 * Skularis — Audio-Bereich (F12), fuer Meister und Spieler.
 *
 * Meister: eigene Audios und die drei Ordner Musik, Hintergrundstimmung,
 * Spontansounds durchsuchen und abspielen (Enter spielt, mit Ein- und
 * Ueberblenden); eigene Abhoer-Lautstaerke; unten das Radio: Schluessel erzeugen
 * und Senden starten oder beenden. Bei jedem neuen Hoerer ein kurzer Ton und die
 * aktuelle Hoererzahl.
 *
 * Spieler: die Radio-Lautstaerke (eigener Kanal) und "Tisch anhoeren": den
 * Schluessel des Meisters eingeben und zuhoeren. Rueckmeldung, sobald verbunden.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, knopfDialog, jaNeinDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, wertZeile, verbindeDetail } from '../editor/widgets.js';
import * as player from './audio-player.js';
import * as radio from '../net/radio.js';
import * as kurztasten from './kurztasten.js';
import { getMeister, speichere as speichereMeister } from './state.js';

const ipc = window.skularis?.ipc;

let _wurzeln = null;         // { audioDaten, musik, stimmung, spontan, meineAudios }
let _config = null;          // gespeicherte Werte (Lautstaerken, letzter Schluessel)
let _schluessel = '';        // aktueller Radio-Schluessel (Meister)
let _statusEl = null;        // Live-Statuszeile (wird von Radio-Rueckmeldungen aktualisiert)
let _verbunden = false;      // Spieler wirklich verbunden (Ton kommt an)
let _playlists = null;       // { auto:bool, listen:[{name, sounds:[{name,pfad}]}] }
let _autoWeiter = false;     // Playlist: automatisch zum naechsten Titel
let _plToken = 0;            // laufende Playlist-Wiedergabe (Abbruch-Marke)

async function ladeGrunddaten() {
  if (!_config) {
    try { const r = await ipc.configLesen(); _config = (r && r.config) || {}; } catch { _config = {}; }
    if (_config.audio_monitor_vol != null) player.setMonitorLautstaerke(_config.audio_monitor_vol);
    if (_config.audio_hintergrund_vol != null) player.setHintergrundLautstaerke(_config.audio_hintergrund_vol);
    if (_config.radio_hoerer_vol != null) radio.setHoererLautstaerke(_config.radio_hoerer_vol);
    if (_config.radio_letzter_schluessel) _schluessel = _config.radio_letzter_schluessel;
  }
  try { _wurzeln = await ipc.audioWurzeln(); } catch { _wurzeln = null; }
}

function merke(key, val) {
  _config = _config || {};
  _config[key] = val;
  try { ipc.configSchreiben(key, val); } catch { /* egal */ }
}

function setzeStatus(text) {
  if (_statusEl && document.body.contains(_statusEl)) {
    _statusEl.textContent = text;
    _statusEl.setAttribute('aria-label', text);
  }
}

// --- Ordner durchsuchen und abspielen -----------------------------------

function ordnerName(pfad) { return String(pfad || '').split(/[\\/]/).filter(Boolean).pop() || pfad; }

// Den Schluessel gut nachlesbar aufbereiten: drei Zeichen je Zeile, Zeichen
// einzeln durch Leerzeichen getrennt. Als Tooltip-Detail bleibt er stehen und
// kann in Ruhe Zeichen fuer Zeichen gelesen werden.
function schluesselDetail(key) {
  if (!key) return 'Noch kein Schluessel. Erzeuge unten einen.';
  const zeilen = ['Schluessel, drei Zeichen je Zeile:'];
  for (let i = 0; i < key.length; i += 3) zeilen.push(key.slice(i, i + 3).split('').join(' '));
  return zeilen;
}

// --- Aktionen je Datei (von Tastatur UND Schaltflaechen genutzt) ---------

// Hintergrund-Pegel: 75 Prozent leiser als normal (der Klang kommt schon leise
// in den Mix und damit in den Stream, ohne dass der Lautstaerke-Regler wandert).
const HINTERGRUND_PEGEL = 0.25;

// Abspielen-Kanal (normale Lautstaerke). Neues blendet das Alte dieses Kanals ueber.
async function tuAbspielen(d, loop = false) {
  try {
    await player.spieleKanal('abspielen', d, { loop });
    sprache.sage(loop ? `${d.name} laeuft in Schleife.` : `${d.name} abgespielt.`);
  } catch (e) { console.error('Audio abspielen:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
}

// Hintergrund-Kanal (leiser). Eigener Kanal, ueberblendet ebenfalls sein Vorheriges.
async function tuHintergrund(d, loop = false) {
  try {
    await player.spieleKanal('hintergrund', d, { loop, pegel: player.getHintergrundPegel() });
    sprache.sage(loop ? `${d.name} laeuft leise als Hintergrund in Schleife.` : `${d.name} als Hintergrund, leise.`);
  } catch (e) { console.error('Audio Hintergrund:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
}

// Diesen Klang anhalten, egal auf welchem Kanal er laeuft (oder beim Vorhoeren).
function tuStop(d) {
  let gestoppt = false;
  if (player.vorhoerenPfad() === d.pfad) { player.beendeVorhoeren(); gestoppt = true; }
  if (player.stoppePfad(d.pfad)) gestoppt = true;
  sprache.sage(gestoppt ? `${d.name} gestoppt.` : `${d.name} laeuft gerade nicht.`);
}

async function tuVorhoeren(d) {
  try {
    if (player.vorhoerenPfad() === d.pfad) { player.beendeVorhoeren(); sprache.sage('Vorhoeren beendet. Dein Live-Ton ist wieder da.'); }
    else { await player.starteVorhoeren(d); sprache.sage(`Vorhoeren ${d.name}. Nur du hoerst das, die Spieler hoeren den Stream weiter.`); }
  } catch (e) { console.error('Vorhoeren:', e); sprache.sage('Vorhoeren nicht moeglich.'); }
}

async function tuEinspielen(d) {
  try { await player.spieleEin(d); sprache.sage(`${d.name} wird eingespielt, die laufende Musik ist solange leiser.`); }
  catch (e) { console.error('Einspielen:', e); sprache.sage('Einspielen nicht moeglich.'); }
}

// Das Fenster mit den drei Optionen (Blind: per Enter; Sehende: per Klick auf
// den Titel). Fokus liegt auf "Abspielen".
async function oeffneAudioDialog(d, kanal) {
  const wahl = await knopfDialog({
    titel: d.name,
    knoepfe: [
      { label: 'Abspielen', wert: 'einmal' },
      { label: 'Abspielen als Schleife', wert: 'schleife' },
      { label: 'Hintergrund', wert: 'hg' },
      { label: 'Hintergrund als Schleife', wert: 'hgschleife' },
      { label: 'Einspielen', wert: 'ein' },
      { label: 'Vorhoeren', wert: 'vor' },
      { label: 'Zu Playlist hinzufuegen', wert: 'playlist' },
      { label: 'Stop', wert: 'stop' },
    ],
  });
  // Escape schliesst das Fenster (liefert null) — kein Abbrechen-Knopf noetig.
  if (wahl === 'einmal') tuAbspielen(d, false);
  else if (wahl === 'schleife') tuAbspielen(d, true);
  else if (wahl === 'hg') tuHintergrund(d, false);
  else if (wahl === 'hgschleife') tuHintergrund(d, true);
  else if (wahl === 'ein') tuEinspielen(d);
  else if (wahl === 'vor') tuVorhoeren(d);
  else if (wahl === 'playlist') zuPlaylistHinzufuegen(d);
  else if (wahl === 'stop') tuStop(d);
}

// Eine Datei-Zeile. Die ganze Zeile ist EIN fokussierbarer Punkt: mit den
// Pfeiltasten faehrt man die Titel ab (Sprachausgabe liest den Titel), Enter
// oeffnet das Fenster mit den drei Optionen. Fuer Sehende stehen zusaetzlich drei
// sichtbare Schaltflaechen in der Zeile (Abspielen, Vorhoeren, Einspielen), die
// per Maus direkt wirken; sie liegen bewusst NICHT im Screenreader-Fokus. Ein
// Klick auf den Titel (statt auf eine Schaltflaeche) oeffnet ebenfalls das Fenster.
function baueDateiZeile(d, kanal) {
  const zeile = document.createElement('div');
  zeile.className = 'db-btn db-menu__item audio-zeile';
  zeile.tabIndex = 0;
  zeile.setAttribute('role', 'button');
  zeile.setAttribute('aria-label', d.name);
  zeile.style.display = 'flex';
  zeile.style.alignItems = 'center';
  zeile.style.gap = '8px';
  zeile.style.flexWrap = 'wrap';

  const aktiviere = () => oeffneAudioDialog(d, kanal);
  zeile.addEventListener('keydown', (e) => {
    // Enter oeffnet das Optionen-Fenster. Leertaste startet/beendet direkt das
    // Vorhoeren (schnelles Probehoeren ohne Umweg ueber das Menue).
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); aktiviere(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); tuVorhoeren(d); }
  });
  zeile.addEventListener('click', (e) => {
    // Klick auf eine der drei Schaltflaechen: die macht ihre eigene Aktion.
    if (e.target.closest && e.target.closest('.audio-zeile__btn')) return;
    sounds.playClick(); aktiviere();
  });

  // Sichtbare Schaltflaechen fuer Sehende (Maus). Nicht im Screenreader-Fokus.
  const macheBtn = (text, aktion) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'db-btn audio-zeile__btn';
    b.textContent = text;
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.style.flex = '0 0 auto';
    b.addEventListener('click', (e) => { e.stopPropagation(); sounds.playClick(); aktion(); });
    return b;
  };
  zeile.appendChild(macheBtn('Abspielen', () => tuAbspielen(d, false)));
  zeile.appendChild(macheBtn('Schleife', () => tuAbspielen(d, true)));
  zeile.appendChild(macheBtn('Hintergrund', () => tuHintergrund(d, true)));
  zeile.appendChild(macheBtn('Vorhoeren', () => tuVorhoeren(d)));
  zeile.appendChild(macheBtn('Einspielen', () => tuEinspielen(d)));
  zeile.appendChild(macheBtn('Stop', () => tuStop(d)));

  const name = document.createElement('span');
  name.className = 'audio-zeile__name';
  name.setAttribute('aria-hidden', 'true');
  name.style.flex = '1 1 auto';
  name.textContent = d.name;
  zeile.appendChild(name);
  return zeile;
}

/**
 * Ein Audio-Ordner: Unterordner zum Weiterblaettern und Dateien mit je drei
 * Schaltflaechen (Abspielen, Vorhoeren, Einspielen). kanal bestimmt den
 * Schleifen-Kanal (Hintergrundstimmung getrennt von Musik).
 */
function ordnerScreen(pfad, kanal, titel) {
  const scr = {
    title: titel,
    _inhalt: null,
    __filter: '',
    async lade() {
      try { scr._inhalt = await ipc.audioInhalt(pfad); }
      catch { scr._inhalt = { ordner: [], dateien: [] }; }
      screen.refresh();
    },
    build() {
      const inhalt = scr._inhalt || { ordner: [], dateien: [] };
      const q = (scr.__filter || '').toLowerCase();
      const dateien = q ? inhalt.dateien.filter(d => d.name.toLowerCase().includes(q)) : inhalt.dateien;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';

      const h = document.createElement('div');
      h.className = 'db-menu__title';
      h.setAttribute('aria-hidden', 'true');
      h.textContent = scr.__filter ? `${titel}, Filter ${scr.__filter}, ${dateien.length} Treffer` : titel;
      wrap.appendChild(h);

      const sub = document.createElement('p');
      sub.className = 'db-menu__sub';
      sub.setAttribute('aria-hidden', 'true');
      sub.textContent = 'Mit den Pfeiltasten die Titel abhoeren, Eingabetaste oeffnet die Optionen (Abspielen, Abspielen in Schleife, Vorhoeren, Einspielen, Stop). Sehende koennen die Schaltflaechen anklicken. Escape zurueck.';
      wrap.appendChild(sub);

      // Filter ganz oben: in jedem Pfad, der Audiodateien enthaelt, damit man
      // schnell durchsuchen kann (steht vor den Unterordnern und Titeln).
      if (inhalt.dateien.length > 0) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'die Liste durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${inhalt.dateien.length}`));
        }
      }

      // Unterordner (jeweils ein Schalter zum Oeffnen).
      for (const o of inhalt.ordner) {
        wrap.appendChild(aktionZeile(`${o.name} (Ordner)`, () => screen.push(ordnerScreen(o.pfad, kanal, o.name)), 'Ordner oeffnen'));
      }

      // Dateien als Titel-Zeilen (Enter oeffnet das Optionen-Fenster).
      for (const d of dateien) wrap.appendChild(baueDateiZeile(d, kanal));

      if (!inhalt.ordner.length && !inhalt.dateien.length) {
        const leer = document.createElement('div');
        leer.className = 'db-menu__empty';
        leer.tabIndex = 0;
        leer.setAttribute('aria-label', 'Dieser Ordner ist leer. Lege Audio-Dateien hinein.');
        leer.textContent = 'Dieser Ordner ist leer. Lege Audio-Dateien hinein.';
        wrap.appendChild(leer);
      } else if (scr.__filter && !dateien.length) {
        const leer = document.createElement('div');
        leer.className = 'db-menu__empty';
        leer.tabIndex = 0;
        leer.setAttribute('aria-label', 'Keine Treffer.');
        leer.textContent = 'Keine Treffer.';
        wrap.appendChild(leer);
      }

      verbindeDetail(wrap);

      if (screen.tiefe() > 1) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'db-btn ed-zurueck';
        back.textContent = 'Zurueck';
        back.setAttribute('aria-label', 'Zurueck');
        back.tabIndex = -1;
        back.addEventListener('click', () => { screen.zurueck(); });
        wrap.appendChild(back);
      }
      return wrap;
    },
    onShow() { if (scr._inhalt === null) scr.lade(); },
    // Verlaesst man den Ordner, ein laufendes Vorhoeren beenden (sonst bliebe der
    // Live-Ton fuer den Meister stumm). Der Spieler-Stream ist davon unberuehrt.
    onBack() { if (player.istVorhoeren()) player.beendeVorhoeren(); return true; },
  };
  return scr;
}

// --- Playlists (nur Verweise auf Bibliotheks-Sounds) --------------------

async function ladePlaylists() {
  if (_playlists) return;
  try {
    const r = await ipc.playlistsLaden();
    const d = r && r.inhalt ? JSON.parse(r.inhalt) : null;
    _playlists = (d && Array.isArray(d.listen)) ? d : { auto: false, listen: [] };
  } catch { _playlists = { auto: false, listen: [] }; }
  _autoWeiter = !!_playlists.auto;
}

function speicherePlaylists() {
  _playlists = _playlists || { auto: false, listen: [] };
  _playlists.auto = _autoWeiter;
  try { ipc.playlistsSpeichern(JSON.stringify(_playlists)); } catch { /* egal */ }
}

/** Alles stoppen: laufende Klaenge, Vorhoeren, Playlist und das Radio (Uebertragung). */
export function alleStoppen() {
  _plToken += 1;
  try { player.stoppeAlles(); } catch { /* egal */ }
  try { if (player.istVorhoeren()) player.beendeVorhoeren(); } catch { /* egal */ }
  try { radio.stopp(); } catch { /* egal */ }
  _verbunden = false;
}

/**
 * NUR die Klaenge stoppen: laufende Kanaele, Vorhoeren und Playlist. Das Radio
 * (Senden bzw. Zuhoeren) laeuft weiter. Fuer Strg und F12: schneller Panik-Stopp
 * der Sounds, OHNE die Uebertragung zu beenden.
 */
export function klaengeStoppen() {
  _plToken += 1;
  try { player.stoppeAlles(); } catch { /* egal */ }
  try { if (player.istVorhoeren()) player.beendeVorhoeren(); } catch { /* egal */ }
}

// Einen Sound zu einer Playlist hinzufuegen (nur ein Verweis auf die Datei).
async function zuPlaylistHinzufuegen(d) {
  await ladePlaylists();
  const knoepfe = (_playlists.listen || []).map((pl, i) => ({ label: pl.name, wert: `p${i}` }));
  knoepfe.push({ label: 'Neue Playlist', wert: 'neu' });
  const wahl = await knopfDialog({ titel: `${d.name} zu Playlist`, knoepfe });
  if (wahl === null) return;
  let pl;
  if (wahl === 'neu') {
    const n = await textDialog({ titel: 'Neue Playlist', label: 'Name der Playlist' });
    if (n === null || !n.trim()) return;
    pl = { name: n.trim(), sounds: [] };
    _playlists.listen.push(pl);
  } else {
    pl = _playlists.listen[parseInt(wahl.slice(1), 10)];
  }
  if (!pl) return;
  pl.sounds.push({ name: d.name, pfad: d.pfad });
  speicherePlaylists();
  sprache.sage(`${d.name} zu ${pl.name} hinzugefuegt.`);
}

// Eine Playlist ab einem Titel sequenziell abspielen (nur bei Auto weiter).
function spielePlaylist(pl, startIndex) {
  const liste = pl.sounds || [];
  const token = ++_plToken;
  const los = async (i) => {
    if (i < 0 || i >= liste.length || token !== _plToken) return;
    try {
      await player.spieleEinmal(liste[i], () => { if (token === _plToken && _autoWeiter) los(i + 1); });
      sprache.sage(`${liste[i].name}.`);
    } catch (e) { console.error('Playlist:', e); if (token === _plToken && _autoWeiter) los(i + 1); }
  };
  los(startIndex);
}

function playlistTitelAbspielen(pl, sIndex) {
  if (_autoWeiter) spielePlaylist(pl, sIndex);
  else tuAbspielen(pl.sounds[sIndex], false);
}

// Die GANZE Playlist der Reihe nach auf EINEM Kanal spielen. Jeder Titel läuft
// ganz durch, dann folgt der nächste (auf demselben Kanal, also blendet sauber
// über). loop: nach dem letzten Titel wieder von vorn. kanal/pegel wie bei den
// Einzeltiteln (Abspielen normal, Hintergrund leiser).
function spielePlaylistGesamt(pl, { kanal = 'abspielen', loop = false, pegel } = {}) {
  const liste = pl.sounds || [];
  if (!liste.length) { sprache.sage('Diese Playlist ist leer.'); return; }
  const token = ++_plToken;
  const p = pegel != null ? pegel : (kanal === 'hintergrund' ? player.getHintergrundPegel() : 1);
  const los = (i) => {
    if (token !== _plToken) return;
    if (i >= liste.length) { if (loop) i = 0; else return; }
    player.spieleKanal(kanal, liste[i], { loop: false, pegel: p, onEnde: () => { if (token === _plToken) los(i + 1); } })
      .catch((e) => { console.error('Playlist gesamt:', e); if (token === _plToken) los(i + 1); });
  };
  los(0);
}

// Untermenü "Playlist vollständig wiedergeben" — dieselben Möglichkeiten wie bei
// einem einzelnen Titel, nur auf die ganze Playlist bezogen.
async function oeffnePlaylistGesamtDialog(pl) {
  const wahl = await knopfDialog({
    titel: `${pl.name}, vollständig`,
    knoepfe: [
      { label: 'Abspielen', wert: 'ab' },
      { label: 'Abspielen als Schleife', wert: 'abschleife' },
      { label: 'Hintergrund', wert: 'hg' },
      { label: 'Hintergrund als Schleife', wert: 'hgschleife' },
      { label: 'Stop', wert: 'stop' },
    ],
  });
  if (wahl === 'ab') { spielePlaylistGesamt(pl, { kanal: 'abspielen', loop: false }); sprache.sage(`${pl.name} läuft, ${pl.sounds.length} Titel.`); }
  else if (wahl === 'abschleife') { spielePlaylistGesamt(pl, { kanal: 'abspielen', loop: true }); sprache.sage(`${pl.name} läuft in Schleife.`); }
  else if (wahl === 'hg') { spielePlaylistGesamt(pl, { kanal: 'hintergrund', loop: false }); sprache.sage(`${pl.name} läuft leise als Hintergrund.`); }
  else if (wahl === 'hgschleife') { spielePlaylistGesamt(pl, { kanal: 'hintergrund', loop: true }); sprache.sage(`${pl.name} läuft leise als Hintergrund in Schleife.`); }
  else if (wahl === 'stop') { _plToken += 1; player.stoppeKanal('abspielen'); player.stoppeKanal('hintergrund'); sprache.sage('Playlist gestoppt.'); }
}

// Kleiner Zurueck-Knopf (nur fuer die Maus; Blinde nutzen Escape).
function rueckKnopf(wrap) {
  if (screen.tiefe() > 1) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'db-btn ed-zurueck';
    back.textContent = 'Zurueck';
    back.setAttribute('aria-label', 'Zurueck');
    back.tabIndex = -1;
    back.addEventListener('click', () => { screen.zurueck(); });
    wrap.appendChild(back);
  }
}

// --- Hauptschirm Meister: klare Reihenfolge -----------------------------

function meisterScreen() {
  return menuScreen({
    title: 'Audio',
    subtitle: 'Bibliothek, Playlists, Verbindung, Lautstaerken. Strg und F12 stoppt alles. Escape zurueck.',
    items: [
      { label: 'Bibliothek', hint: 'deine Klaenge nach Ordnern', onSelect: () => screen.push(bibliothekScreen()) },
      { label: 'Kurztasten', hint: 'Strg-Tasten mit Klaengen dieses Abenteuers belegen', onSelect: () => screen.push(kurztastenScreen()) },
      { label: 'Playlists', hint: 'eigene Zusammenstellungen, Auto abspielen', onSelect: () => screen.push(playlistsScreen()) },
      { label: 'Verbindung', hint: 'Schluessel und Senden ans Radio', onSelect: () => screen.push(verbindungScreen()) },
      { label: 'Lautstaerken', hint: 'eigene Audio-Lautstaerke', onSelect: () => screen.push(lautstaerkenScreen()) },
      { label: 'Alles stoppen', hint: 'alle Klaenge und das Senden beenden', onSelect: () => { alleStoppen(); sprache.sage('Alles gestoppt.'); } },
    ],
  });
}

// Aus einem Ordnernamen den passenden Schleifen-Kanal raten. So bleibt die
// Struktur frei: neue oder umbenannte Ordner funktionieren ohne feste Vorgabe.
function kanalFuer(name) {
  const n = String(name || '').toLowerCase();
  if (/musik/.test(n)) return 'musik';
  if (/spontan|effekt|foley|interface|jingle|geraeusch/.test(n)) return 'spontan';
  return 'stimmung'; // Hintergrund/Atmosphaere: Schleifen-Kanal Hintergrundstimmung
}

// --- Kurztasten (Audio-Schnelltasten Strg+1 bis Strg+´) -----------------
//
// Belegung je EINZELNEM Meisterabenteuer (getMeister().kurztasten). Die Tasten
// selbst sind global und in den Optionen umbelegbar (kurztasten.js).

function kurzSpeichern() { try { speichereMeister(); } catch { /* egal */ } }

function kurzSlotLabel(a, i) {
  const d = a.kurztasten && a.kurztasten[i];
  const combo = kurztasten.comboFuer(i + 1);
  if (!d || !d.pfad) return { label: `Schnelltaste ${i + 1}, ${combo}: frei`, detail: 'Enter: eine Audiodatei auf diese Taste legen.' };
  const lv = (typeof d.lautstaerke === 'number') ? `${d.lautstaerke} Prozent` : 'Standard';
  return {
    label: `Schnelltaste ${i + 1}, ${combo}: ${d.name}`,
    detail: `Modus ${kurztasten.modusName(d.modus)}${d.loop ? ', Schleife' : ''}. Lautstaerke ${lv}. Enter: aendern.`,
  };
}

function kurztastenScreen() {
  const scr = {
    title: 'Kurztasten',
    build() {
      const a = getMeister();
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Kurztasten'));
      if (!a) { wrap.appendChild(infoZeile('Kein Meisterabenteuer geladen.', 'Oeffne zuerst ein Meisterabenteuer.')); rueckKnopf(wrap); return wrap; }
      wrap.appendChild(infoZeile('Belege die Schnelltasten mit Klaengen dieses Abenteuers.',
        'Block 1: Strg+1 bis Strg+´. Block 2: Strg+Shift+1 bis Strg+Shift+´. Im Spiel spielt ein Druck auf die Taste den Klang sofort, ohne Menue. Die Belegung gilt nur fuer dieses Meisterabenteuer; ein neues Abenteuer startet leer. Welche Taste welchen Platz ausloest, aenderst du in den Optionen unter "Tasten neu belegen".'));
      for (let i = 0; i < 24; i++) {
        const b = kurzSlotLabel(a, i);
        wrap.appendChild(aktionZeile(b.label, () => screen.push(kurztastenSlotScreen(i)), 'aendern', b.detail));
      }
      // Ganz unten: alle Schnelltasten auf einmal freimachen (mit Rueckfrage).
      wrap.appendChild(aktionZeile('Alle leeren', async () => {
        if (!await jaNeinDialog({ titel: 'Alle leeren', frage: 'Bist du sicher? Alle 24 Schnelltasten dieses Abenteuers werden zurueckgesetzt.' })) return;
        a.kurztasten = Array.from({ length: 24 }, () => null);
        kurzSpeichern();
        screen.refresh();
        sprache.sage('Alle Schnelltasten geleert.');
      }, 'alle 24 Schnelltasten zuruecksetzen'));
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Kurztasten.'); },
  };
  return scr;
}

function kurztastenSlotScreen(i) {
  const scr = {
    title: `Schnelltaste ${i + 1}`,
    build() {
      const a = getMeister();
      const d = a && a.kurztasten ? a.kurztasten[i] : null;
      const combo = kurztasten.comboFuer(i + 1);
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(`Schnelltaste ${i + 1}, ${combo}`));
      if (!a) { wrap.appendChild(infoZeile('Kein Meisterabenteuer geladen.', '')); rueckKnopf(wrap); return wrap; }
      if (!d || !d.pfad) {
        wrap.appendChild(infoZeile('Diese Taste ist frei.', 'Waehle eine Audiodatei aus der Bibliothek.'));
        wrap.appendChild(aktionZeile('Datei waehlen', () => kurztastenDateiWaehlen(i), 'eine Audiodatei auf diese Taste legen'));
        verbindeDetail(wrap); rueckKnopf(wrap); return wrap;
      }
      const lv = (typeof d.lautstaerke === 'number') ? `${d.lautstaerke} Prozent` : 'Standard (Kanal)';
      wrap.appendChild(infoZeile(`Belegt mit ${d.name}.`, `Modus ${kurztasten.modusName(d.modus)}${d.loop ? ', Schleife' : ''}. Lautstaerke ${lv}.`));
      wrap.appendChild(aktionZeile('Testen', () => kurztasten.spiele(i), 'den Klang wie mit der Taste abspielen'));
      wrap.appendChild(aktionZeile('Modus waehlen', () => kurzModusWaehlen(i), `Einspielen, Abspielen oder Hintergrund. Aktuell ${kurztasten.modusName(d.modus)}.`));
      wrap.appendChild(aktionZeile(`Schleife: ${d.loop ? 'an' : 'aus'}`, () => kurzSchleifeUmschalten(i), 'wiederholt den Klang (bei Abspielen und Hintergrund)'));
      wrap.appendChild(aktionZeile('Individuelle Lautstaerke festlegen', () => kurzLautstaerke(i), `eigene Lautstaerke fuer diese Taste. Aktuell ${lv}.`));
      wrap.appendChild(aktionZeile('Neu belegen', () => kurztastenDateiWaehlen(i), 'eine andere Audiodatei auf diese Taste legen'));
      wrap.appendChild(aktionZeile('Loeschen', () => kurzLoeschen(i), 'die Taste wieder frei machen'));
      verbindeDetail(wrap); rueckKnopf(wrap); return wrap;
    },
    onShow() { sprache.sage(`Schnelltaste ${i + 1}.`); },
  };
  return scr;
}

async function kurzModusWaehlen(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  const wahl = await knopfDialog({
    titel: 'Modus', knoepfe: [
      { label: 'Einspielen', wert: 'einspielen' },
      { label: 'Abspielen', wert: 'abspielen' },
      { label: 'Hintergrund', wert: 'hintergrund' },
    ],
  });
  if (!wahl) return;
  d.modus = wahl; kurzSpeichern(); screen.refresh(); sprache.sage(`Modus ${kurztasten.modusName(wahl)}.`);
}

function kurzSchleifeUmschalten(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  d.loop = !d.loop; kurzSpeichern(); screen.refresh();
  sprache.sage(d.loop ? 'Schleife an.' : 'Schleife aus.');
}

async function kurzLautstaerke(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  const wahl = await knopfDialog({
    titel: 'Lautstaerke', frage: 'Eigene Lautstaerke fuer diese Taste?', knoepfe: [
      { label: 'Wert eingeben', wert: 'wert' },
      { label: 'Auf Standard (Kanal)', wert: 'std' },
    ],
  });
  if (wahl === 'std') { d.lautstaerke = null; kurzSpeichern(); screen.refresh(); sprache.sage('Lautstaerke auf Standard.'); return; }
  if (wahl !== 'wert') return;
  const e = await textDialog({ titel: 'Lautstaerke', label: 'Zahl von 0 bis 100', wert: (typeof d.lautstaerke === 'number' ? String(d.lautstaerke) : '') });
  if (e === null) return;
  const n = parseInt(String(e).replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) { sprache.sage('Keine gueltige Zahl.'); return; }
  d.lautstaerke = Math.max(0, Math.min(100, n)); kurzSpeichern(); screen.refresh();
  sprache.sage(`Lautstaerke ${d.lautstaerke} Prozent.`);
}

async function kurzLoeschen(i) {
  const a = getMeister(); if (!a || !a.kurztasten[i]) return;
  if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Schnelltaste ${i + 1} wieder frei machen?` })) return;
  a.kurztasten[i] = null; kurzSpeichern(); screen.pop(); sprache.sage(`Schnelltaste ${i + 1} geloescht.`);
}

// Datei fuer eine Schnelltaste waehlen: durch den Audio-Baum blaettern und eine
// Datei antippen. Danach zurueck zum Schnelltasten-Untermenue (das sich neu baut).
function kurztastenDateiWaehlen(i) {
  const start = (_wurzeln && _wurzeln.audioDaten) ? _wurzeln.audioDaten : null;
  if (!start) { sprache.sage('Die Audio-Bibliothek ist noch nicht geladen.'); return; }
  const ziel = screen.current(); // das Schnelltasten-Untermenue
  screen.push(kurztastenOrdnerScreen(start, 'Datei waehlen', i, ziel));
}

function kurzDateiZuweisen(i, d) {
  const a = getMeister(); if (!a) return;
  const alt = a.kurztasten[i];
  a.kurztasten[i] = {
    name: d.name, pfad: d.pfad,
    modus: (alt && alt.modus) || 'einspielen',
    loop: alt ? !!alt.loop : false,
    lautstaerke: (alt && typeof alt.lautstaerke === 'number') ? alt.lautstaerke : null,
  };
  kurzSpeichern();
}

function kurztastenOrdnerScreen(pfad, titel, slotIndex, ziel) {
  const scr = {
    title: titel,
    _inhalt: null,
    __filter: '',
    async lade() {
      try { scr._inhalt = await ipc.audioInhalt(pfad); }
      catch { scr._inhalt = { ordner: [], dateien: [] }; }
      screen.refresh();
    },
    build() {
      const inhalt = scr._inhalt || { ordner: [], dateien: [] };
      const q = (scr.__filter || '').toLowerCase();
      const dateien = q ? inhalt.dateien.filter(d => d.name.toLowerCase().includes(q)) : inhalt.dateien;
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(scr.__filter ? `${titel}, Filter ${scr.__filter}, ${dateien.length} Treffer` : titel));
      wrap.appendChild(infoZeile('Waehle eine Datei fuer die Schnelltaste.',
        'Ordner oeffnen ihre Unterordner. Enter auf einer Datei legt sie auf die Taste. Escape zurueck.'));
      if (inhalt.dateien.length > 0) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'die Liste durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${inhalt.dateien.length}`));
        }
      }
      for (const o of inhalt.ordner) {
        wrap.appendChild(aktionZeile(`${o.name} (Ordner)`, () => screen.push(kurztastenOrdnerScreen(o.pfad, o.name, slotIndex, ziel)), 'Ordner oeffnen'));
      }
      for (const d of dateien) {
        wrap.appendChild(aktionZeile(d.name, () => {
          kurzDateiZuweisen(slotIndex, d);
          sprache.sage(`${d.name} auf Schnelltaste ${slotIndex + 1} gelegt.`);
          if (ziel && screen.imStack(ziel)) screen.zurueckBis(ziel); else screen.pop();
        }, 'auf die Schnelltaste legen'));
      }
      if (!inhalt.ordner.length && !inhalt.dateien.length) {
        wrap.appendChild(infoZeile('Dieser Ordner ist leer.', 'Lege Audio-Dateien hinein oder waehle einen anderen Ordner.'));
      } else if (scr.__filter && !dateien.length) {
        wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zuruecksetzen.'));
      }
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { if (scr._inhalt === null) scr.lade(); },
  };
  return scr;
}

function bibliothekScreen() {
  const scr = {
    title: 'Bibliothek',
    _ordner: null, // tatsaechlich vorhandene Ordner unter Audio-Dateien (flexibel)
    async ladeOrdner() {
      if (!_wurzeln || !_wurzeln.audioDaten) return;
      try { const inhalt = await ipc.audioInhalt(_wurzeln.audioDaten); scr._ordner = inhalt.ordner || []; }
      catch { scr._ordner = []; }
      screen.refresh();
    },
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Bibliothek'));
      // (Kurztasten stehen jetzt eine Ebene hoeher, direkt unter "Bibliothek".)
      const meine = _wurzeln && _wurzeln.meineAudios;
      wrap.appendChild(aktionZeile(
        meine ? `Meine Audios, ${ordnerName(meine)}` : 'Meine Audios, Ordner waehlen',
        async () => {
          if (meine) { screen.push(ordnerScreen(meine, 'musik', 'Meine Audios')); return; }
          const r = await ipc.audioMeineWaehlen();
          if (!r || !r.pfad) return;
          _wurzeln = await ipc.audioWurzeln();
          screen.refresh();
          sprache.sage(`Ordner ${ordnerName(r.pfad)} gewaehlt.`);
        }, meine ? 'deine eigene Sammlung' : 'einen Ordner mit deinen Audios waehlen'));
      // Flexibel: alle Ordner anzeigen, die wirklich in Audio-Dateien liegen —
      // so kann man Ordner frei umbenennen oder neue anlegen, sie erscheinen von
      // selbst. Solange die Liste noch laedt, die drei Standard-Ordner zeigen.
      if (scr._ordner && scr._ordner.length) {
        for (const o of scr._ordner) {
          wrap.appendChild(aktionZeile(o.name, () => screen.push(ordnerScreen(o.pfad, kanalFuer(o.name), o.name)), 'oeffnen'));
        }
      } else if (_wurzeln) {
        wrap.appendChild(aktionZeile('Musik', () => screen.push(ordnerScreen(_wurzeln.musik, 'musik', 'Musik')), 'oeffnen'));
        wrap.appendChild(aktionZeile('Hintergrundstimmung', () => screen.push(ordnerScreen(_wurzeln.stimmung, 'stimmung', 'Hintergrundstimmung')), 'oeffnen'));
        wrap.appendChild(aktionZeile('Spontansounds', () => screen.push(ordnerScreen(_wurzeln.spontan, 'spontan', 'Spontansounds')), 'oeffnen'));
      }
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() {
      if (!_wurzeln) { ladeGrunddaten().then(() => scr.ladeOrdner()); }
      else if (scr._ordner === null) { scr.ladeOrdner(); }
      sprache.sage('Bibliothek.');
    },
  };
  return scr;
}

function lautstaerkenScreen() {
  return {
    title: 'Lautstaerken',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Lautstaerken'));
      wrap.appendChild(wertZeile({
        label: 'Meine Audio-Lautstaerke', get: () => player.getMonitorLautstaerke(),
        set: (v) => { player.setMonitorLautstaerke(v); merke('audio_monitor_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut du die Klaenge selbst hoerst. Aendert nicht, wie laut die Spieler hoeren. Am Ziffernblock regeln Plus und Minus das ueberall.',
      }));
      wrap.appendChild(wertZeile({
        label: 'Hintergrund-Lautstaerke (wie gesendet)', get: () => player.getHintergrundLautstaerke(),
        set: (v) => { player.setHintergrundLautstaerke(v); merke('audio_hintergrund_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut der Hintergrund-Kanal in den Radio-Stream geht. Stell ihn leiser, wenn die Spieler den Hintergrund zu laut finden. Wirkt sofort auf einen laufenden Hintergrund und auf alles Neue.',
      }));
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Lautstaerken.'); },
  };
}

function verbindungScreen() {
  const scr = {
    title: 'Verbindung',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Verbindung, Radio senden'));
      const senden = radio.istAktiv() && radio.rolle() === 'sender';
      const status = infoZeile(senden ? `Sende. ${radio.hoererAnzahl()} Hoerer verbunden.` : 'Radio aus.',
        'Erzeuge einen Schluessel, gib ihn deinen Spielern, dann starte das Senden.');
      wrap.appendChild(status);
      _statusEl = status;
      const schluesselText = _schluessel ? `Schluessel: ${_schluessel.slice(0, 3)} ${_schluessel.slice(3)}` : 'Noch kein Schluessel';
      wrap.appendChild(infoZeile(schluesselText, schluesselDetail(_schluessel)));
      wrap.appendChild(aktionZeile('Schluessel erzeugen', () => {
        _schluessel = radio.generiereSchluessel();
        merke('radio_letzter_schluessel', _schluessel);
        screen.refresh();
        sprache.sage(`Neuer Schluessel erzeugt: ${_schluessel}. Zum Nachlesen steht er im Tooltip der Schluessel-Zeile, drei Zeichen je Zeile.`);
      }, 'einen neuen, zufaelligen Radio-Schluessel'));
      wrap.appendChild(aktionZeile(senden ? 'Senden beenden' : 'Senden starten',
        () => (senden ? sendenBeenden() : sendenStarten()),
        senden ? 'das Radio ausschalten' : 'ab jetzt hoeren verbundene Spieler mit'));
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Verbindung.'); },
  };
  return scr;
}

function playlistsScreen() {
  const scr = {
    title: 'Playlists',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Playlists'));
      // Ganz oben: Auto abspielen an/aus.
      wrap.appendChild(aktionZeile(`Auto abspielen: ${_autoWeiter ? 'an' : 'aus'}`, () => {
        _autoWeiter = !_autoWeiter; speicherePlaylists(); screen.refresh();
        sprache.sage(_autoWeiter ? 'Auto abspielen an. Die ganze Playlist laeuft durch.' : 'Auto abspielen aus. Es laeuft nur ein Titel.');
      }, 'an: ganze Playlist laeuft durch; aus: nur ein Titel'));
      wrap.appendChild(aktionZeile('Neue Playlist', async () => {
        const n = await textDialog({ titel: 'Neue Playlist', label: 'Name der Playlist' });
        if (n === null || !n.trim()) return;
        _playlists.listen.push({ name: n.trim(), sounds: [] });
        speicherePlaylists(); screen.refresh(); sprache.sage(`Playlist ${n.trim()} angelegt.`);
      }, 'eine neue Zusammenstellung anlegen'));
      const listen = (_playlists && _playlists.listen) || [];
      if (!listen.length) {
        wrap.appendChild(infoZeile('Noch keine Playlists.', 'Lege oben eine an, oder fuege in der Bibliothek Sounds ueber "Zu Playlist hinzufuegen" hinzu.'));
      }
      listen.forEach((pl, i) => {
        wrap.appendChild(aktionZeile(`${pl.name}, ${pl.sounds.length} Titel`, () => screen.push(playlistScreen(i)), 'oeffnen'));
      });
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { if (!_playlists) { ladePlaylists().then(() => screen.refresh()); } sprache.sage('Playlists.'); },
  };
  return scr;
}

function playlistScreen(index) {
  const scr = {
    title: 'Playlist',
    __filter: '',
    build() {
      const pl = _playlists.listen[index];
      if (!pl) { screen.pop(); return document.createElement('div'); }
      this.title = pl.name;
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(pl.name));
      wrap.appendChild(infoZeile(`Auto abspielen: ${_autoWeiter ? 'an' : 'aus'}`, 'Umschalten in der Playlist-Uebersicht. An: der naechste Titel folgt von selbst.'));

      // Ganz oben: die komplette Playlist starten — wie bei einem einzelnen Titel,
      // nur auf die ganze Liste bezogen (Abspielen, Schleife, Hintergrund, Stop).
      if ((pl.sounds || []).length > 0) {
        wrap.appendChild(aktionZeile('Playlist vollständig wiedergeben', () => oeffnePlaylistGesamtDialog(pl),
          'die ganze Playlist starten',
          'Öffnet ein Fenster mit Abspielen, Abspielen als Schleife, Hintergrund, Hintergrund als Schleife und Stop — für die komplette Playlist der Reihe nach.'));
      }

      // Filter oben: wie in der Bibliothek, in jedem Pfad mit Titeln.
      const q = (scr.__filter || '').toLowerCase();
      const treffer = (pl.sounds || []).map((s, si) => ({ s, si })).filter(x => !q || x.s.name.toLowerCase().includes(q));
      if ((pl.sounds || []).length > 0) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'die Titel durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${pl.sounds.length}`));
        }
      }

      treffer.forEach((x) => wrap.appendChild(bauePlaylistZeile(pl, index, x.si)));
      if (!pl.sounds.length) wrap.appendChild(infoZeile('Diese Playlist ist leer.', 'Fuege in der Bibliothek Sounds ueber "Zu Playlist hinzufuegen" hinzu.'));
      else if (scr.__filter && !treffer.length) wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zuruecksetzen.'));
      wrap.appendChild(aktionZeile('Playlist umbenennen', async () => {
        const v = await textDialog({ titel: 'Playlist umbenennen', label: 'Name', wert: pl.name });
        if (v === null || !v.trim()) return; pl.name = v.trim(); speicherePlaylists(); screen.refresh(); sprache.sage(`Heisst jetzt ${v.trim()}.`);
      }));
      wrap.appendChild(aktionZeile('Playlist loeschen', async () => {
        if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Playlist ${pl.name} wirklich loeschen? Die Sounds bleiben in der Bibliothek.` })) return;
        _playlists.listen.splice(index, 1); speicherePlaylists(); screen.pop(); sprache.sage('Playlist geloescht.');
      }));
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Playlist.'); },
    onBack() { if (player.istVorhoeren()) player.beendeVorhoeren(); return true; },
  };
  return scr;
}

function bauePlaylistZeile(pl, plIndex, sIndex) {
  const s = pl.sounds[sIndex];
  const zeile = document.createElement('div');
  zeile.className = 'db-btn db-menu__item audio-zeile';
  zeile.tabIndex = 0;
  zeile.setAttribute('role', 'button');
  zeile.setAttribute('aria-label', s.name);
  zeile.style.display = 'flex';
  zeile.style.alignItems = 'center';
  zeile.style.gap = '8px';
  zeile.style.flexWrap = 'wrap';
  const aktiviere = () => oeffnePlaylistDialog(pl, plIndex, sIndex);
  zeile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); aktiviere(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); tuVorhoeren(s); }
  });
  zeile.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.audio-zeile__btn')) return; sounds.playClick(); aktiviere(); });
  const mk = (t, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'db-btn audio-zeile__btn'; b.textContent = t;
    b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); b.style.flex = '0 0 auto';
    b.addEventListener('click', (e) => { e.stopPropagation(); sounds.playClick(); fn(); });
    return b;
  };
  zeile.appendChild(mk('Abspielen', () => playlistTitelAbspielen(pl, sIndex)));
  zeile.appendChild(mk('Schleife', () => tuAbspielen(s, true)));
  zeile.appendChild(mk('Vorhoeren', () => tuVorhoeren(s)));
  zeile.appendChild(mk('Einspielen', () => tuEinspielen(s)));
  zeile.appendChild(mk('Stop', () => { _plToken += 1; tuStop(s); }));
  const name = document.createElement('span');
  name.setAttribute('aria-hidden', 'true'); name.style.flex = '1 1 auto'; name.textContent = s.name;
  zeile.appendChild(name);
  return zeile;
}

async function oeffnePlaylistDialog(pl, plIndex, sIndex) {
  const s = pl.sounds[sIndex];
  const wahl = await knopfDialog({
    titel: s.name,
    knoepfe: [
      { label: 'Abspielen', wert: 'ab' },
      { label: 'Abspielen in Schleife', wert: 'schleife' },
      { label: 'Vorhoeren', wert: 'vor' },
      { label: 'Einspielen', wert: 'ein' },
      { label: 'Stop', wert: 'stop' },
      { label: 'Aus Playlist entfernen', wert: 'weg' },
    ],
  });
  if (wahl === 'ab') playlistTitelAbspielen(pl, sIndex);
  else if (wahl === 'schleife') tuAbspielen(s, true);
  else if (wahl === 'vor') tuVorhoeren(s);
  else if (wahl === 'ein') tuEinspielen(s);
  else if (wahl === 'stop') { _plToken += 1; tuStop(s); }
  else if (wahl === 'weg') { pl.sounds.splice(sIndex, 1); speicherePlaylists(); screen.refresh(); sprache.sage(`${s.name} aus der Playlist entfernt.`); }
}

function sendenStarten() {
  if (!_schluessel) {
    _schluessel = radio.generiereSchluessel();
    merke('radio_letzter_schluessel', _schluessel);
  }
  const strom = player.getSendeStrom();
  radio.starteSenden(_schluessel, strom, {
    onBereit: () => { setzeStatus('Sende. 0 Hoerer verbunden.'); sprache.sage(`Radio sendet. Schluessel ${_schluessel.split('').join(' ')}.`); },
    onHoererNeu: (n) => { sounds.playBing(); setzeStatus(`Sende. ${n} Hoerer verbunden.`); sprache.sage(`Ein Hoerer verbunden. Insgesamt ${n}.`); },
    onHoererWeg: (n) => { setzeStatus(`Sende. ${n} Hoerer verbunden.`); sprache.sage(`Ein Hoerer getrennt. Noch ${n}.`); },
    onFehler: (t) => { setzeStatus('Radio-Fehler.'); sprache.sage(t); },
  });
  screen.refresh();
}

function sendenBeenden() {
  radio.stopp();
  setzeStatus('Radio aus.');
  screen.refresh();
  sprache.sage('Senden beendet.');
}

// --- Hauptschirm Spieler -------------------------------------------------

function spielerScreen() {
  const scr = {
    title: 'Audio und Radio',
    _input: null,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';

      // NICHT verbunden: das Menue schrumpft auf Schluessel-Eingabe und Verbinden.
      if (!_verbunden) {
        wrap.appendChild(abschnittTitel('Tisch anhoeren'));

        const lbl = document.createElement('label');
        lbl.setAttribute('for', 'radio-schluessel');
        lbl.textContent = 'Schluessel eingeben:';
        lbl.style.display = 'block';
        wrap.appendChild(lbl);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'radio-schluessel';
        input.className = 'db-input';
        input.setAttribute('aria-label', 'Schluessel eingeben');
        input.value = (_config && _config.radio_letzter_schluessel) || '';
        input.style.display = 'block';
        input.style.width = '100%';
        input.style.maxWidth = '320px';
        input.style.margin = '6px 0 12px';
        input.style.padding = '8px';
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); starteVerbinden(input.value); } });
        wrap.appendChild(input);
        scr._input = input;

        wrap.appendChild(aktionZeile('Verbinden', () => starteVerbinden(scr._input ? scr._input.value : ''),
          'mit dem Tisch des Meisters verbinden'));

        verbindeDetail(wrap);
        return wrap;
      }

      // VERBUNDEN: das ganze Menue.
      wrap.appendChild(abschnittTitel('Radio, Tisch anhoeren'));
      const status = infoZeile('Mit dem Tisch verbunden.', 'Du hoerst jetzt den Ton des Meisters.');
      wrap.appendChild(status);
      _statusEl = status;

      wrap.appendChild(wertZeile({
        label: 'Radio-Lautstaerke', get: () => radio.getHoererLautstaerke(),
        set: (v) => { radio.setHoererLautstaerke(v); merke('radio_hoerer_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut du den Ton des Meisters hoerst. Ein eigener Kanal. Am Ziffernblock stellen Plus und Minus die Radio-Lautstaerke ueberall.',
      }));

      wrap.appendChild(aktionZeile('Verbindung trennen', () => {
        radio.stopp(); _verbunden = false; screen.refresh(); sprache.sage('Verbindung getrennt.');
      }));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      if (!_config) { ladeGrunddaten().then(() => screen.refresh()); }
      if (!_verbunden && scr._input) { try { scr._input.focus(); scr._input.select(); } catch { /* egal */ } }
      sprache.sage(_verbunden ? 'Mit dem Tisch verbunden.' : 'Radio. Schluessel eingeben und verbinden.');
    },
  };
  return scr;
}

function starteVerbinden(rohKey) {
  const key = String(rohKey || '').trim().toLowerCase();
  if (!key) { sprache.sage('Bitte zuerst den Schluessel eingeben.'); return; }
  merke('radio_letzter_schluessel', key);
  sprache.sage('Verbinde mit dem Tisch, einen Moment.');
  radio.starteHoeren(key, {
    onVerbunden: () => { _verbunden = true; screen.refresh(); sprache.sage('Verbunden. Du hoerst jetzt den Tisch.'); },
    onGetrennt: () => { _verbunden = false; screen.refresh(); sprache.sage('Verbindung getrennt.'); },
    onFehler: (t) => { _verbunden = false; screen.refresh(); sprache.sage(t); },
  });
}

// --- Einstieg ------------------------------------------------------------

/**
 * Den Audio-Bereich oeffnen.
 * @param {'meister'|'spieler'} rolle
 */
export function audioBereichScreen(rolle) {
  // Grunddaten frueh laden (Ordner, gespeicherte Lautstaerken); der Screen
  // aktualisiert sich per onShow, sobald sie da sind.
  ladeGrunddaten();
  return rolle === 'spieler' ? spielerScreen() : meisterScreen();
}
