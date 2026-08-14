/**
 * Skularis — Audio-Bereich (F12), für Meister und Spieler.
 *
 * Meister: eigene Audios und die drei Ordner Musik, Hintergrundstimmung,
 * Spontansounds durchsuchen und abspielen (Enter spielt, mit Ein- und
 * Überblenden); eigene Abhoer-Lautstärke; unten das Radio: Schlüssel erzeugen
 * und Senden starten oder beenden. Bei jedem neuen Hörer ein kurzer Ton und die
 * aktuelle Hörerzahl.
 *
 * Spieler: die Radio-Lautstärke (eigener Kanal) und "Tisch anhören": den
 * Schlüssel des Meisters eingeben und zuhören. Rückmeldung, sobald verbunden.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, knopfDialog, jaNeinDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, wertZeile, verbindeDetail } from '../editor/widgets.js';
import * as player from './audio-player.js';
import * as radio from '../net/radio.js';
import * as sitzung from '../net/sitzung.js';
import * as postkasten from './postkasten.js';
import * as kurztasten from './kurztasten.js';
import * as einstellungen from '../daten/einstellungen.js';
import { getMeister, speichere as speichereMeister } from './state.js';

const ipc = window.skularis?.ipc;

let _wurzeln = null;         // { audioDaten, musik, stimmung, spontan, meineAudios }
let _config = null;          // gespeicherte Werte (Lautstärken, letzter Schlüssel)
let _schluessel = '';        // aktueller Radio-Schlüssel (Meister)
let _statusEl = null;        // Live-Statuszeile (wird von Radio-Rückmeldungen aktualisiert)
let _verbunden = false;      // Spieler wirklich verbunden (Ton kommt an)
let _playlists = null;       // { auto:bool, listen:[{name, sounds:[{name,pfad}]}] }
let _autoWeiter = false;     // Playlist: automatisch zum nächsten Titel
let _plToken = 0;            // laufende Playlist-Wiedergabe (Abbruch-Marke)
let _kurzPlaylist = null;    // { name, kanal } der ueber eine Schnelltaste laufenden Playlist

async function ladeGrunddaten() {
  if (!_config) {
    try { const r = await ipc.configLesen(); _config = (r && r.config) || {}; } catch { _config = {}; }
    if (_config.audio_monitor_vol != null) player.setMonitorLautstaerke(_config.audio_monitor_vol);
    if (_config.audio_hintergrund_vol != null) player.setHintergrundLautstaerke(_config.audio_hintergrund_vol);
    if (_config.radio_hoerer_vol != null) radio.setHoererLautstaerke(_config.radio_hoerer_vol);
    if (_config.radio_letzter_schluessel) { _schluessel = _config.radio_letzter_schluessel; sitzung.setMeisterCode(_schluessel); }
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

// Den Schlüssel gut nachlesbar aufbereiten: die vier Ziffern einzeln durch
// Leerzeichen getrennt in einer Zeile. Als Tooltip-Detail bleibt er stehen und
// kann in Ruhe Ziffer für Ziffer gelesen werden.
function schluesselDetail(key) {
  if (!key) return 'Noch kein Schlüssel. Erzeuge unten einen.';
  return `Schlüssel: ${key.split('').join(' ')}`;
}

// --- Aktionen je Datei (von Tastatur UND Schaltflächen genutzt) ---------

// Hintergrund-Pegel: 75 Prozent leiser als normal (der Klang kommt schon leise
// in den Mix und damit in den Stream, ohne dass der Lautstärke-Regler wandert).
const HINTERGRUND_PEGEL = 0.25;

// Abspielen-Kanal (normale Lautstärke). Neues blendet das Alte dieses Kanals über.
async function tuAbspielen(d, loop = false) {
  try {
    player.stoppeKanal('hintergrund'); // Abspielen beendet den Hintergrund (kein störendes Parallellaufen), weiches Ausblenden
    await player.spieleKanal('abspielen', d, { loop });
    sprache.sage(loop ? `${d.name} läuft in Schleife.` : `${d.name} abgespielt.`);
  } catch (e) { console.error('Audio abspielen:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
}

// Hintergrund-Kanal (leiser). Eigener Kanal, überblendet ebenfalls sein Vorheriges.
async function tuHintergrund(d, loop = false) {
  try {
    await player.spieleKanal('hintergrund', d, { loop, pegel: player.getHintergrundPegel() });
    sprache.sage(loop ? `${d.name} läuft leise als Hintergrund in Schleife.` : `${d.name} als Hintergrund, leise.`);
  } catch (e) { console.error('Audio Hintergrund:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
}

// Diesen Klang anhalten, egal auf welchem Kanal er läuft (oder beim Vorhören).
function tuStop(d) {
  let gestoppt = false;
  if (player.vorhoerenPfad() === d.pfad) { player.beendeVorhoeren(); gestoppt = true; }
  if (player.stoppePfad(d.pfad)) gestoppt = true;
  sprache.sage(gestoppt ? `${d.name} gestoppt.` : `${d.name} läuft gerade nicht.`);
}

async function tuVorhoeren(d) {
  try {
    if (player.vorhoerenPfad() === d.pfad) { player.beendeVorhoeren(); sprache.sage('Vorhören beendet. Dein Live-Ton ist wieder da.'); }
    else { await player.starteVorhoeren(d); sprache.sage(`Vorhören ${d.name}. Nur du hörst das, die Spieler hören den Stream weiter.`); }
  } catch (e) { console.error('Vorhören:', e); sprache.sage('Vorhören nicht möglich.'); }
}

async function tuEinspielen(d) {
  try { await player.spieleEin(d); sprache.sage(`${d.name} wird eingespielt, die laufende Musik ist solange leiser.`); }
  catch (e) { console.error('Einspielen:', e); sprache.sage('Einspielen nicht möglich.'); }
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
      { label: 'Vorhören', wert: 'vor' },
      { label: 'Zu Playlist hinzufügen', wert: 'playlist' },
      { label: 'Stop', wert: 'stop' },
    ],
  });
  // Escape schließt das Fenster (liefert null) — kein Abbrechen-Knopf nötig.
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
// öffnet das Fenster mit den drei Optionen. Für Sehende stehen zusätzlich drei
// sichtbare Schaltflächen in der Zeile (Abspielen, Vorhören, Einspielen), die
// per Maus direkt wirken; sie liegen bewusst NICHT im Screenreader-Fokus. Ein
// Klick auf den Titel (statt auf eine Schaltfläche) öffnet ebenfalls das Fenster.
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
    // Enter öffnet das Optionen-Fenster. Leertaste startet/beendet direkt das
    // Vorhören (schnelles Probehören ohne Umweg über das Menü).
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); aktiviere(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); tuVorhoeren(d); }
  });
  zeile.addEventListener('click', (e) => {
    // Klick auf eine der drei Schaltflächen: die macht ihre eigene Aktion.
    if (e.target.closest && e.target.closest('.audio-zeile__btn')) return;
    sounds.playClick(); aktiviere();
  });

  // Sichtbare Schaltflächen für Sehende (Maus). Nicht im Screenreader-Fokus.
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
  zeile.appendChild(macheBtn('Vorhören', () => tuVorhoeren(d)));
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
 * Ein Audio-Ordner: Unterordner zum Weiterblättern und Dateien mit je drei
 * Schaltflächen (Abspielen, Vorhören, Einspielen). kanal bestimmt den
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
      sub.textContent = 'Mit den Pfeiltasten die Titel abhören, Eingabetaste öffnet die Optionen (Abspielen, Abspielen in Schleife, Vorhören, Einspielen, Stop). Sehende können die Schaltflächen anklicken. Escape zurück.';
      wrap.appendChild(sub);

      // Filter ganz oben: in jedem Pfad, der Audiodateien enthält, damit man
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

      // Unterordner (jeweils ein Schalter zum Öffnen).
      for (const o of inhalt.ordner) {
        wrap.appendChild(aktionZeile(`${o.name} (Ordner)`, () => screen.push(ordnerScreen(o.pfad, kanal, o.name)), 'Ordner öffnen'));
      }

      // Dateien als Titel-Zeilen (Enter öffnet das Optionen-Fenster).
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
        back.className = 'db-btn ed-zurück';
        back.textContent = 'Zurück';
        back.setAttribute('aria-label', 'Zurück');
        back.tabIndex = -1;
        back.addEventListener('click', () => { screen.zurueck(); });
        wrap.appendChild(back);
      }
      return wrap;
    },
    onShow() { if (scr._inhalt === null) scr.lade(); },
    // Verlässt man den Ordner, ein laufendes Vorhören beenden (sonst bliebe der
    // Live-Ton für den Meister stumm). Der Spieler-Stream ist davon unberührt.
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

/** Alles stoppen: laufende Klänge, Vorhören, Playlist und das Radio (Übertragung). */
export function alleStoppen() {
  _plToken += 1;
  _kurzPlaylist = null;
  try { player.stoppeAlles(); } catch { /* egal */ }
  try { if (player.istVorhoeren()) player.beendeVorhoeren(); } catch { /* egal */ }
  try { radio.stopp(); } catch { /* egal */ }
  _verbunden = false;
}

/**
 * NUR die Klänge stoppen: laufende Kanäle, Vorhören und Playlist. Das Radio
 * (Senden bzw. Zuhören) läuft weiter. Für Strg und F12: schneller Panik-Stopp
 * der Sounds, OHNE die Übertragung zu beenden.
 */
export function klaengeStoppen() {
  _plToken += 1;
  _kurzPlaylist = null;
  try { player.stoppeAlles(); } catch { /* egal */ }
  try { if (player.istVorhoeren()) player.beendeVorhoeren(); } catch { /* egal */ }
}

// Einen Sound zu einer Playlist hinzufügen (nur ein Verweis auf die Datei).
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
  sprache.sage(`${d.name} zu ${pl.name} hinzugefügt.`);
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
    if (i >= liste.length) { if (loop) i = 0; else { _kurzPlaylist = null; return; } }
    player.spieleKanal(kanal, liste[i], { loop: false, pegel: p, onEnde: () => { if (token === _plToken) los(i + 1); } })
      .catch((e) => { console.error('Playlist gesamt:', e); if (token === _plToken) los(i + 1); });
  };
  los(0);
}

/**
 * Eine ganze Playlist ueber eine Schnelltaste starten oder (bei erneutem Druck auf
 * dieselbe Playlist) wieder stoppen. modus 'hintergrund' spielt leiser, sonst
 * normal; loop wiederholt die ganze Liste. Wird aus kurztasten.js aufgerufen.
 */
export async function spielePlaylistFuerTaste(name, opts) {
  opts = opts || {};
  await ladePlaylists();
  const pl = ((_playlists && _playlists.listen) || []).find(p => p.name === name);
  if (!pl) { sprache.sage('Playlist nicht gefunden.'); return; }
  // Umschalten: laeuft genau diese Playlist schon -> stoppen.
  if (_kurzPlaylist && _kurzPlaylist.name === name) { stopPlaylistWiedergabe(); return; }
  if (!pl.sounds || !pl.sounds.length) { sprache.sage('Diese Playlist ist leer.'); return; }
  const loop = !!opts.loop;
  const kanal = opts.modus === 'hintergrund' ? 'hintergrund' : 'abspielen';
  const pegel = (typeof opts.pegel === 'number') ? opts.pegel : (kanal === 'hintergrund' ? player.getHintergrundPegel() : 1);
  spielePlaylistGesamt(pl, { kanal: kanal, loop: loop, pegel: pegel });
  _kurzPlaylist = { name: name, kanal: kanal };
}

/** Eine ueber eine Schnelltaste laufende Playlist beenden (falls eine laeuft). */
export function stopPlaylistWiedergabe() {
  _plToken += 1;
  if (_kurzPlaylist) { try { player.stoppeKanal(_kurzPlaylist.kanal); } catch { /* egal */ } _kurzPlaylist = null; }
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

// Kleiner Zurück-Knopf (nur für die Maus; Blinde nutzen Escape).
function rueckKnopf(wrap) {
  if (screen.tiefe() > 1) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'db-btn ed-zurück';
    back.textContent = 'Zurück';
    back.setAttribute('aria-label', 'Zurück');
    back.tabIndex = -1;
    back.addEventListener('click', () => { screen.zurueck(); });
    wrap.appendChild(back);
  }
}

// --- Hauptschirm Meister: klare Reihenfolge -----------------------------

function meisterScreen() {
  return menuScreen({
    title: 'Audio',
    subtitle: 'Bibliothek, Playlists, Verbindung, Lautstärken. Strg und F12 stoppt alles. Escape zurück.',
    items: [
      { label: 'Bibliothek', hint: 'deine Klänge nach Ordnern', onSelect: () => screen.push(bibliothekScreen()) },
      { label: 'Kurztasten', hint: 'Strg-Tasten mit Klängen dieses Abenteuers belegen', onSelect: () => screen.push(kurztastenScreen()) },
      { label: 'Playlists', hint: 'eigene Zusammenstellungen, Auto abspielen', onSelect: () => screen.push(playlistsScreen()) },
      { label: 'Verbindung', hint: 'Schlüssel und Senden ans Radio', onSelect: () => screen.push(verbindungScreen()) },
      { label: 'Lautstärken', hint: 'eigene Audio-Lautstärke', onSelect: () => screen.push(lautstaerkenScreen()) },
      { label: 'Alles stoppen', hint: 'alle Klänge und das Senden beenden', onSelect: () => { alleStoppen(); sprache.sage('Alles gestoppt.'); } },
    ],
  });
}

// Aus einem Ordnernamen den passenden Schleifen-Kanal raten. So bleibt die
// Struktur frei: neue oder umbenannte Ordner funktionieren ohne feste Vorgabe.
function kanalFuer(name) {
  const n = String(name || '').toLowerCase();
  if (/musik/.test(n)) return 'musik';
  if (/spontan|effekt|foley|interface|jingle|geraeusch/.test(n)) return 'spontan';
  return 'stimmung'; // Hintergrund/Atmosphäre: Schleifen-Kanal Hintergrundstimmung
}

// --- Kurztasten (Audio-Schnelltasten Strg+1 bis Strg+´) -----------------
//
// Belegung je EINZELNEM Meisterabenteuer (getMeister().kurztasten). Die Tasten
// selbst sind global und in den Optionen umbelegbar (kurztasten.js).

function kurzSpeichern() { try { speichereMeister(); } catch { /* egal */ } }

function kurzSlotLabel(a, i) {
  const d = a.kurztasten && a.kurztasten[i];
  const combo = kurztasten.comboFuer(i + 1);
  if (!kurztasten.istBelegt(d)) return { label: `Schnelltaste ${i + 1}, ${combo}: frei`, detail: 'Enter: eine Audiodatei oder eine Playlist auf diese Taste legen.' };
  const lv = (typeof d.lautstaerke === 'number') ? `${d.lautstaerke} Prozent` : 'Standard';
  const was = d.typ === 'playlist' ? `Playlist ${d.playlist || d.name}` : d.name;
  return {
    label: `Schnelltaste ${i + 1}, ${combo}: ${was}`,
    detail: `Modus ${kurztasten.modusName(d.modus)}${d.loop ? ', Schleife' : ''}. Lautstärke ${lv}. Enter: ändern.`,
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
      if (!a) { wrap.appendChild(infoZeile('Kein Meisterabenteuer geladen.', 'Öffne zuerst ein Meisterabenteuer.')); rueckKnopf(wrap); return wrap; }
      wrap.appendChild(infoZeile('Belege die Schnelltasten mit Klängen dieses Abenteuers.',
        'Block 1: Strg+1 bis Strg+´. Block 2: Strg+Shift+1 bis Strg+Shift+´. Im Spiel spielt ein Druck auf die Taste den Klang sofort, ohne Menü. Die Belegung gilt nur für dieses Meisterabenteuer; ein neues Abenteuer startet leer. Welche Taste welchen Platz auslöst, änderst du in den Optionen unter "Tasten neu belegen".'));
      for (let i = 0; i < 24; i++) {
        const b = kurzSlotLabel(a, i);
        wrap.appendChild(aktionZeile(b.label, () => screen.push(kurztastenSlotScreen(i)), 'ändern', b.detail));
      }
      // Ganz unten: alle Schnelltasten auf einmal freimachen (mit Rückfrage).
      wrap.appendChild(aktionZeile('Alle leeren', async () => {
        if (!await jaNeinDialog({ titel: 'Alle leeren', frage: 'Bist du sicher? Alle 24 Schnelltasten dieses Abenteuers werden zurückgesetzt.' })) return;
        a.kurztasten = Array.from({ length: 24 }, () => null);
        kurzSpeichern();
        screen.refresh();
        sprache.sage('Alle Schnelltasten geleert.');
      }, 'alle 24 Schnelltasten zurücksetzen'));
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
      if (!kurztasten.istBelegt(d)) {
        wrap.appendChild(infoZeile('Diese Taste ist frei.', 'Wähle eine Audiodatei oder eine ganze Playlist.'));
        wrap.appendChild(aktionZeile('Audiodatei wählen', () => kurztastenDateiWaehlen(i), 'eine Audiodatei auf diese Taste legen'));
        wrap.appendChild(aktionZeile('Playlist wählen', () => kurztastenPlaylistWaehlen(i), 'eine ganze Playlist auf diese Taste legen'));
        verbindeDetail(wrap); rueckKnopf(wrap); return wrap;
      }
      const istPl = d.typ === 'playlist';
      const lv = (typeof d.lautstaerke === 'number') ? `${d.lautstaerke} Prozent` : 'Standard (Kanal)';
      const was = istPl ? `Playlist ${d.playlist || d.name}` : d.name;
      const modusHinweis = istPl ? 'Abspielen oder Hintergrund' : 'Einspielen, Abspielen oder Hintergrund';
      wrap.appendChild(infoZeile(`Belegt mit ${was}.`, `Modus ${kurztasten.modusName(d.modus)}${d.loop ? ', Schleife' : ''}. Lautstärke ${lv}.`));
      wrap.appendChild(aktionZeile('Testen', () => kurztasten.spiele(i), istPl ? 'die Playlist wie mit der Taste starten' : 'den Klang wie mit der Taste abspielen'));
      wrap.appendChild(aktionZeile('Modus und Lautstärke wählen', () => kurzModusWaehlen(i), `${modusHinweis} oder Individuelle Lautstärke. Aktuell ${kurztasten.modusName(d.modus)}, Lautstärke ${lv}.`));
      wrap.appendChild(aktionZeile(`Schleife: ${d.loop ? 'an' : 'aus'}`, () => kurzSchleifeUmschalten(i), istPl ? 'wiederholt die ganze Playlist' : 'wiederholt den Klang (bei Abspielen und Hintergrund)'));
      wrap.appendChild(aktionZeile('Andere Audiodatei', () => kurztastenDateiWaehlen(i), 'stattdessen eine Audiodatei auf diese Taste legen'));
      wrap.appendChild(aktionZeile('Andere Playlist', () => kurztastenPlaylistWaehlen(i), 'stattdessen eine Playlist auf diese Taste legen'));
      wrap.appendChild(aktionZeile('Löschen', () => kurzLoeschen(i), 'die Taste wieder frei machen'));
      verbindeDetail(wrap); rueckKnopf(wrap); return wrap;
    },
    onShow() { sprache.sage(`Schnelltaste ${i + 1}.`); },
  };
  return scr;
}

async function kurzModusWaehlen(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  // Einspielen (Ducking) gibt es nur fuer einzelne Dateien, nicht fuer Playlists.
  const knoepfe = d.typ === 'playlist'
    ? [{ label: 'Abspielen', wert: 'abspielen' }, { label: 'Hintergrund', wert: 'hintergrund' }]
    : [{ label: 'Einspielen', wert: 'einspielen' }, { label: 'Abspielen', wert: 'abspielen' }, { label: 'Hintergrund', wert: 'hintergrund' }];
  // Vierter Eintrag: erst hier erscheint das Lautstaerke-Menue, und dann greift es.
  knoepfe.push({ label: 'Individuelle Lautstärke', wert: 'individuell' });
  const wahl = await knopfDialog({ titel: 'Modus und Lautstärke', knoepfe });
  if (!wahl) return;
  if (wahl === 'individuell') { await kurzLautstaerke(i); return; }
  // Einen Modus zu waehlen setzt die individuelle Lautstaerke zurueck -> es gilt
  // wieder der Kanal-Standard (Abspielen/Einspielen voll, Hintergrund leise).
  d.modus = wahl; d.lautstaerke = null; kurzSpeichern(); screen.refresh();
  sprache.sage(`Modus ${kurztasten.modusName(wahl)}. Lautstärke auf Standard.`);
}

// Eine ganze Playlist auf eine Schnelltaste legen.
async function kurztastenPlaylistWaehlen(i) {
  await ladePlaylists();
  const listen = (_playlists && _playlists.listen) || [];
  if (!listen.length) { sprache.sage('Es gibt noch keine Playlists. Lege zuerst unter Playlists eine an.'); return; }
  const wahl = await knopfDialog({
    titel: 'Playlist wählen',
    knoepfe: listen.map((pl, idx) => ({ label: `${pl.name}, ${pl.sounds.length} Titel`, wert: String(idx) })),
  });
  if (wahl === null) return;
  const pl = listen[parseInt(wahl, 10)]; if (!pl) return;
  const a = getMeister(); if (!a) return;
  const alt = a.kurztasten[i];
  a.kurztasten[i] = {
    typ: 'playlist', playlist: pl.name, name: pl.name,
    modus: (alt && alt.modus === 'hintergrund') ? 'hintergrund' : 'abspielen', // Einspielen gibt es fuer Playlists nicht
    loop: alt ? !!alt.loop : false,
    lautstaerke: (alt && typeof alt.lautstaerke === 'number') ? alt.lautstaerke : null,
  };
  kurzSpeichern(); screen.refresh();
  sprache.sage(`Playlist ${pl.name} auf Schnelltaste ${i + 1} gelegt.`);
}

function kurzSchleifeUmschalten(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  d.loop = !d.loop; kurzSpeichern(); screen.refresh();
  sprache.sage(d.loop ? 'Schleife an.' : 'Schleife aus.');
}

async function kurzLautstaerke(i) {
  const a = getMeister(); const d = a && a.kurztasten[i]; if (!d) return;
  const e = await textDialog({ titel: 'Individuelle Lautstärke', label: 'Zahl von 0 bis 100 (leer lassen für Standard)', wert: (typeof d.lautstaerke === 'number' ? String(d.lautstaerke) : '') });
  if (e === null) return;
  const roh = String(e).replace(/[^0-9]/g, '');
  // Leere Eingabe = zurueck auf Kanal-Standard.
  if (roh === '') { d.lautstaerke = null; kurzSpeichern(); screen.refresh(); sprache.sage('Lautstärke auf Standard.'); return; }
  const n = parseInt(roh, 10);
  if (isNaN(n)) { sprache.sage('Keine gültige Zahl.'); return; }
  d.lautstaerke = Math.max(0, Math.min(100, n)); kurzSpeichern(); screen.refresh();
  // Sofort auf einen gerade laufenden Klang dieser Taste anwenden (nicht erst beim nächsten Start).
  if (d.pfad) player.setzePegelFuer(d.pfad, d.lautstaerke / 100);
  sprache.sage(`Individuelle Lautstärke ${d.lautstaerke} Prozent.`);
}

async function kurzLoeschen(i) {
  const a = getMeister(); if (!a || !a.kurztasten[i]) return;
  if (!await jaNeinDialog({ titel: 'Löschen', frage: `Schnelltaste ${i + 1} wieder frei machen?` })) return;
  a.kurztasten[i] = null; kurzSpeichern(); screen.pop(); sprache.sage(`Schnelltaste ${i + 1} gelöscht.`);
}

// Datei für eine Schnelltaste wählen: durch den Audio-Baum blättern und eine
// Datei antippen. Danach zurück zum Schnelltasten-Untermenü (das sich neu baut).
function kurztastenDateiWaehlen(i) {
  const start = (_wurzeln && _wurzeln.audioDaten) ? _wurzeln.audioDaten : null;
  if (!start) { sprache.sage('Die Audio-Bibliothek ist noch nicht geladen.'); return; }
  const ziel = screen.current(); // das Schnelltasten-Untermenü
  screen.push(kurztastenOrdnerScreen(start, 'Datei wählen', i, ziel));
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
      wrap.appendChild(infoZeile('Wähle eine Datei für die Schnelltaste.',
        'Ordner öffnen ihre Unterordner. Enter auf einer Datei legt sie auf die Taste. Escape zurück.'));
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
        wrap.appendChild(aktionZeile(`${o.name} (Ordner)`, () => screen.push(kurztastenOrdnerScreen(o.pfad, o.name, slotIndex, ziel)), 'Ordner öffnen'));
      }
      for (const d of dateien) {
        wrap.appendChild(aktionZeile(d.name, () => {
          kurzDateiZuweisen(slotIndex, d);
          sprache.sage(`${d.name} auf Schnelltaste ${slotIndex + 1} gelegt.`);
          if (ziel && screen.imStack(ziel)) screen.zurueckBis(ziel); else screen.pop();
        }, 'auf die Schnelltaste legen'));
      }
      if (!inhalt.ordner.length && !inhalt.dateien.length) {
        wrap.appendChild(infoZeile('Dieser Ordner ist leer.', 'Lege Audio-Dateien hinein oder wähle einen anderen Ordner.'));
      } else if (scr.__filter && !dateien.length) {
        wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zurücksetzen.'));
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
    _ordner: null, // tatsächlich vorhandene Ordner unter Audio-Dateien (flexibel)
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
      // (Kurztasten stehen jetzt eine Ebene höher, direkt unter "Bibliothek".)
      const meine = _wurzeln && _wurzeln.meineAudios;
      wrap.appendChild(aktionZeile(
        meine ? `Meine Audios, ${ordnerName(meine)}` : 'Meine Audios, Ordner wählen',
        async () => {
          if (meine) { screen.push(ordnerScreen(meine, 'musik', 'Meine Audios')); return; }
          const r = await ipc.audioMeineWaehlen();
          if (!r || !r.pfad) return;
          _wurzeln = await ipc.audioWurzeln();
          screen.refresh();
          sprache.sage(`Ordner ${ordnerName(r.pfad)} gewählt.`);
        }, meine ? 'deine eigene Sammlung' : 'einen Ordner mit deinen Audios wählen'));
      // Flexibel: alle Ordner anzeigen, die wirklich in Audio-Dateien liegen —
      // so kann man Ordner frei umbenennen oder neue anlegen, sie erscheinen von
      // selbst. Solange die Liste noch lädt, die drei Standard-Ordner zeigen.
      if (scr._ordner && scr._ordner.length) {
        for (const o of scr._ordner) {
          wrap.appendChild(aktionZeile(o.name, () => screen.push(ordnerScreen(o.pfad, kanalFuer(o.name), o.name)), 'öffnen'));
        }
      } else if (_wurzeln) {
        wrap.appendChild(aktionZeile('Musik', () => screen.push(ordnerScreen(_wurzeln.musik, 'musik', 'Musik')), 'öffnen'));
        wrap.appendChild(aktionZeile('Hintergrundstimmung', () => screen.push(ordnerScreen(_wurzeln.stimmung, 'stimmung', 'Hintergrundstimmung')), 'öffnen'));
        wrap.appendChild(aktionZeile('Spontansounds', () => screen.push(ordnerScreen(_wurzeln.spontan, 'spontan', 'Spontansounds')), 'öffnen'));
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
    title: 'Lautstärken',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Lautstärken'));
      wrap.appendChild(wertZeile({
        label: 'Anwendungslautstärke', get: () => player.getAnwendungsLautstaerke(),
        set: (v) => { sounds.setAnwendungsLautstaerke(v); player.setAnwendungsLautstaerke(v); radio.setAnwendungsLautstaerke(v); merke('app_master_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut Skularis insgesamt bei dir klingt — alle Töne zusammen. Damit stellst du schnell deine Hörlautstärke und die Balance zu Discord ein. Am Ziffernblock regeln das Plus und Minus überall. Verschiebt NICHT das Verhältnis von Hintergrund und Abhören und ändert NICHT, wie laut die Spieler hören.',
      }));
      wrap.appendChild(wertZeile({
        label: 'Meine Audio-Lautstärke', get: () => player.getMonitorLautstaerke(),
        set: (v) => { player.setMonitorLautstaerke(v); merke('audio_monitor_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut du die Klänge selbst hörst. Ändert nicht, wie laut die Spieler hören. Am Ziffernblock regeln Plus und Minus das überall.',
      }));
      wrap.appendChild(wertZeile({
        label: 'Hintergrund-Lautstärke (wie gesendet)', get: () => player.getHintergrundLautstaerke(),
        set: (v) => { player.setHintergrundLautstaerke(v); merke('audio_hintergrund_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut der Hintergrund-Kanal in den Radio-Stream geht. Stell ihn leiser, wenn die Spieler den Hintergrund zu laut finden. Wirkt sofort auf einen laufenden Hintergrund und auf alles Neue.',
      }));
      verbindeDetail(wrap);
      rueckKnopf(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Lautstärken.'); },
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
      const status = infoZeile(senden ? `Sende. ${radio.hoererAnzahl()} Hörer verbunden.` : 'Radio aus.',
        'Erzeuge einen Schlüssel, gib ihn deinen Spielern, dann starte das Senden.');
      wrap.appendChild(status);
      _statusEl = status;
      const schluesselText = _schluessel ? `Schlüssel: ${_schluessel}` : 'Noch kein Schlüssel';
      wrap.appendChild(infoZeile(schluesselText, schluesselDetail(_schluessel)));
      wrap.appendChild(aktionZeile('Schlüssel erzeugen', () => {
        _schluessel = sitzung.neuerMeisterCode(); // EIN Code für Anzeige, Radio UND Post
        merke('radio_letzter_schluessel', _schluessel);
        screen.refresh();
        sprache.sage(`Neuer Schlüssel erzeugt: ${_schluessel}. Zum Nachlesen steht er im Tooltip der Schlüssel-Zeile, drei Zeichen je Zeile.`);
      }, 'einen neuen, zufälligen Radio-Schlüssel'));
      wrap.appendChild(aktionZeile(senden ? 'Senden beenden' : 'Senden starten',
        () => (senden ? sendenBeenden() : sendenStarten()),
        senden ? 'das Radio ausschalten' : 'ab jetzt hören verbundene Spieler mit'));
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
        sprache.sage(_autoWeiter ? 'Auto abspielen an. Die ganze Playlist läuft durch.' : 'Auto abspielen aus. Es läuft nur ein Titel.');
      }, 'an: ganze Playlist läuft durch; aus: nur ein Titel'));
      wrap.appendChild(aktionZeile('Neue Playlist', async () => {
        const n = await textDialog({ titel: 'Neue Playlist', label: 'Name der Playlist' });
        if (n === null || !n.trim()) return;
        _playlists.listen.push({ name: n.trim(), sounds: [] });
        speicherePlaylists(); screen.refresh(); sprache.sage(`Playlist ${n.trim()} angelegt.`);
      }, 'eine neue Zusammenstellung anlegen'));
      const listen = (_playlists && _playlists.listen) || [];
      if (!listen.length) {
        wrap.appendChild(infoZeile('Noch keine Playlists.', 'Lege oben eine an, oder füge in der Bibliothek Sounds über "Zu Playlist hinzufügen" hinzu.'));
      }
      listen.forEach((pl, i) => {
        wrap.appendChild(aktionZeile(`${pl.name}, ${pl.sounds.length} Titel`, () => screen.push(playlistScreen(i)), 'öffnen'));
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
      wrap.appendChild(infoZeile(`Auto abspielen: ${_autoWeiter ? 'an' : 'aus'}`, 'Umschalten in der Playlist-Übersicht. An: der nächste Titel folgt von selbst.'));

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
      if (!pl.sounds.length) wrap.appendChild(infoZeile('Diese Playlist ist leer.', 'Füge in der Bibliothek Sounds über "Zu Playlist hinzufügen" hinzu.'));
      else if (scr.__filter && !treffer.length) wrap.appendChild(infoZeile('Keine Treffer.', 'Filter mit "Filter aufheben" zurücksetzen.'));
      wrap.appendChild(aktionZeile('Playlist umbenennen', async () => {
        const v = await textDialog({ titel: 'Playlist umbenennen', label: 'Name', wert: pl.name });
        if (v === null || !v.trim()) return; pl.name = v.trim(); speicherePlaylists(); screen.refresh(); sprache.sage(`Heißt jetzt ${v.trim()}.`);
      }));
      wrap.appendChild(aktionZeile('Playlist löschen', async () => {
        if (!await jaNeinDialog({ titel: 'Löschen', frage: `Playlist ${pl.name} wirklich löschen? Die Sounds bleiben in der Bibliothek.` })) return;
        _playlists.listen.splice(index, 1); speicherePlaylists(); screen.pop(); sprache.sage('Playlist gelöscht.');
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
  zeile.appendChild(mk('Vorhören', () => tuVorhoeren(s)));
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
      { label: 'Abspielen als Schleife', wert: 'schleife' },
      { label: 'Hintergrund', wert: 'hg' },
      { label: 'Hintergrund als Schleife', wert: 'hgschleife' },
      { label: 'Einspielen', wert: 'ein' },
      { label: 'Vorhören', wert: 'vor' },
      { label: 'Stop', wert: 'stop' },
      { label: 'Aus Playlist entfernen', wert: 'weg' },
    ],
  });
  if (wahl === 'ab') playlistTitelAbspielen(pl, sIndex);
  else if (wahl === 'schleife') tuAbspielen(s, true);
  else if (wahl === 'hg') tuHintergrund(s, false);
  else if (wahl === 'hgschleife') tuHintergrund(s, true);
  else if (wahl === 'vor') tuVorhoeren(s);
  else if (wahl === 'ein') tuEinspielen(s);
  else if (wahl === 'stop') { _plToken += 1; tuStop(s); }
  else if (wahl === 'weg') { pl.sounds.splice(sIndex, 1); speicherePlaylists(); screen.refresh(); sprache.sage(`${s.name} aus der Playlist entfernt.`); }
}

async function sendenStarten() {
  // Ein gemeinsamer Sitzungscode fuer Radio UND Post. Das Starten des Radios bringt
  // auch die Post hoch (wer im Radio ist, hat auch Post), falls sie noch nicht laeuft.
  _schluessel = sitzung.meisterCode();
  merke('radio_letzter_schluessel', _schluessel);
  // Übertragungseinstellungen aus den Optionen: Bitrate-Deckel + Mono/Stereo.
  let bitrate = 128;
  let mono = false;
  try {
    const b = await einstellungen.get('radio_bitrate');
    const m = await einstellungen.get('radio_mono');
    if (typeof b === 'number' && b >= 32 && b <= 128) bitrate = b;
    mono = m === true;
  } catch { /* Standard 128/Stereo */ }
  player.setSendeMono(mono);
  const strom = player.getSendeStrom();
  sitzung.starteMeisterRadio(strom, {
    onBereit: () => { setzeStatus('Sende. 0 Hörer verbunden.'); sprache.sage(`Radio sendet. Schlüssel ${_schluessel.split('').join(' ')}.`); },
    onHoererNeu: (n) => { sounds.playBing(); setzeStatus(`Sende. ${n} Hörer verbunden.`); sprache.sage(`Ein Hörer verbunden. Insgesamt ${n}.`); },
    onHoererWeg: (n) => { setzeStatus(`Sende. ${n} Hörer verbunden.`); sprache.sage(`Ein Hörer getrennt. Noch ${n}.`); },
    onFehler: (t) => { setzeStatus('Radio-Fehler.'); sprache.sage(t); },
  }, { maxBitrate: bitrate }, postkasten.postCallbacks());
  screen.refresh();
}

function sendenBeenden() {
  sitzung.stoppeMeisterRadio(); // nur das Radio; die Post bleibt bestehen
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

      // Verbunden-Zustand aus der Sitzung ableiten, damit F12 auch dann "verbunden"
      // zeigt, wenn schon beim Öffnen des Abenteuers verbunden wurde.
      _verbunden = sitzung.radioAn();

      // NICHT verbunden: das Menü schrumpft auf Schlüssel-Eingabe und Verbinden.
      if (!_verbunden) {
        wrap.appendChild(abschnittTitel('Tisch anhören'));

        const lbl = document.createElement('label');
        lbl.setAttribute('for', 'radio-schlüssel');
        lbl.textContent = 'Schlüssel eingeben:';
        lbl.style.display = 'block';
        wrap.appendChild(lbl);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'radio-schlüssel';
        input.className = 'db-input';
        input.setAttribute('aria-label', 'Schlüssel eingeben');
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

      // VERBUNDEN: das ganze Menü.
      wrap.appendChild(abschnittTitel('Radio, Tisch anhören'));
      const status = infoZeile('Mit dem Tisch verbunden.', 'Du hörst jetzt den Ton des Meisters.');
      wrap.appendChild(status);
      _statusEl = status;

      wrap.appendChild(wertZeile({
        label: 'Radio-Lautstärke', get: () => radio.getHoererLautstaerke(),
        set: (v) => { radio.setHoererLautstaerke(v); merke('radio_hoerer_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true, stumm: true,
        detail: 'Wie laut du den Ton des Meisters hörst. Ein eigener Kanal. Am Ziffernblock stellen Plus und Minus die Radio-Lautstärke überall.',
      }));

      wrap.appendChild(aktionZeile('Verbindung trennen', () => {
        sitzung.trenne(); _verbunden = false; screen.refresh(); sprache.sage('Verbindung getrennt.');
      }, 'beendet Radio und Post zum Tisch'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      if (!_config) { ladeGrunddaten().then(() => screen.refresh()); }
      if (!_verbunden && scr._input) { try { scr._input.focus(); scr._input.select(); } catch { /* egal */ } }
      sprache.sage(_verbunden ? 'Mit dem Tisch verbunden.' : 'Radio. Schlüssel eingeben und verbinden.');
    },
  };
  return scr;
}

async function starteVerbinden(rohKey) {
  const key = String(rohKey || '').trim().toLowerCase();
  if (!key) { sprache.sage('Bitte zuerst den Schlüssel eingeben.'); return; }
  merke('radio_letzter_schluessel', key);
  sprache.sage('Verbinde mit dem Tisch, einen Moment.');
  const radioCb = {
    onVerbunden: () => { _verbunden = true; try { screen.refresh(); } catch { /* egal */ } sprache.sage('Verbunden. Du hörst jetzt den Tisch.'); },
    onGetrennt: () => { _verbunden = false; try { screen.refresh(); } catch { /* egal */ } },
    onFehler: (t) => { _verbunden = false; try { screen.refresh(); } catch { /* egal */ } sprache.sage(t); },
  };
  // Ist ein Abenteuer offen (Spielertisch), wird die Post gleich mitverbunden — ein
  // Code für beides. Ohne Abenteuer (globales F12) nur das Radio zum Zuhören.
  try {
    const st = await import('../abenteuer/state.js');
    if (st.getAbenteuer && st.getAbenteuer()) {
      const mp = await import('../abenteuer/meisterpost.js');
      const name = (mp.vorschlagName && mp.vorschlagName()) || 'Spieler';
      mp.verbindeSitzung(key, name, radioCb);
      return;
    }
  } catch { /* fällt unten auf reines Radio zurück */ }
  sitzung.verbindeNurRadio(key, radioCb);
}

// --- Einstieg ------------------------------------------------------------

/**
 * Den Audio-Bereich öffnen.
 * @param {'meister'|'spieler'} rolle
 */
export function audioBereichScreen(rolle) {
  // Grunddaten früh laden (Ordner, gespeicherte Lautstärken); der Screen
  // aktualisiert sich per onShow, sobald sie da sind.
  ladeGrunddaten();
  return rolle === 'spieler' ? spielerScreen() : meisterScreen();
}
