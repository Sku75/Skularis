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
import { textDialog, knopfDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, wertZeile, verbindeDetail } from '../editor/widgets.js';
import * as player from './audio-player.js';
import * as radio from '../net/radio.js';

const ipc = window.skularis?.ipc;

let _wurzeln = null;         // { audioDaten, musik, stimmung, spontan, meineAudios }
let _config = null;          // gespeicherte Werte (Lautstaerken, letzter Schluessel)
let _schluessel = '';        // aktueller Radio-Schluessel (Meister)
let _statusEl = null;        // Live-Statuszeile (wird von Radio-Rueckmeldungen aktualisiert)
let _verbunden = false;      // Spieler wirklich verbunden (Ton kommt an)

async function ladeGrunddaten() {
  if (!_config) {
    try { const r = await ipc.configLesen(); _config = (r && r.config) || {}; } catch { _config = {}; }
    if (_config.audio_monitor_vol != null) player.setMonitorLautstaerke(_config.audio_monitor_vol);
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

async function tuAbspielen(d, kanal) {
  const loopKanal = kanal === 'stimmung' ? 'stimmung' : 'musik';
  try {
    if (kanal === 'spontan') {
      // Spontansounds spielen einmal; laeuft er schon, anhalten.
      if (player.spontanAktiv(d.pfad)) { player.stoppeSpontan(d.pfad); sprache.sage(`${d.name} gestoppt.`); return; }
      await player.spieleEinmal(d); sprache.sage(`${d.name} abgespielt.`);
    } else {
      // Musik/Stimmung laufen in Schleife; laeuft es schon, anhalten.
      if (player.laeuftPfad(loopKanal) === d.pfad) { player.stoppeKanal(loopKanal); sprache.sage(`${d.name} gestoppt.`); return; }
      await player.spieleSchleife(loopKanal, d); sprache.sage(`${d.name} laeuft in Schleife.`);
    }
  } catch (e) { console.error('Audio abspielen:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
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
      { label: 'Abspielen', wert: 'ab' },
      { label: 'Vorhoeren', wert: 'vor' },
      { label: 'Einspielen', wert: 'ein' },
    ],
  });
  if (wahl === 'ab') tuAbspielen(d, kanal);
  else if (wahl === 'vor') tuVorhoeren(d);
  else if (wahl === 'ein') tuEinspielen(d);
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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); aktiviere(); }
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
  zeile.appendChild(macheBtn('Abspielen', () => tuAbspielen(d, kanal)));
  zeile.appendChild(macheBtn('Vorhoeren', () => tuVorhoeren(d)));
  zeile.appendChild(macheBtn('Einspielen', () => tuEinspielen(d)));

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
      sub.textContent = 'Mit den Pfeiltasten die Titel abhoeren, Eingabetaste oeffnet die drei Optionen (Abspielen, Vorhoeren, Einspielen). Sehende koennen die Schaltflaechen anklicken. Escape zurueck.';
      wrap.appendChild(sub);

      // Unterordner (jeweils ein Schalter zum Oeffnen).
      for (const o of inhalt.ordner) {
        wrap.appendChild(aktionZeile(`${o.name} (Ordner)`, () => screen.push(ordnerScreen(o.pfad, kanal, o.name)), 'Ordner oeffnen'));
      }

      // Filter bei vielen Dateien.
      if (inhalt.dateien.length >= 12) {
        if (!scr.__filter) {
          wrap.appendChild(aktionZeile('Filtern', async () => {
            const e = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
            if (e === null) return; scr.__filter = e.trim(); screen.refresh();
          }, 'die Liste durchsuchen'));
        } else {
          wrap.appendChild(aktionZeile('Filter aufheben', () => { scr.__filter = ''; screen.refresh(); }, `zeigt wieder alle ${inhalt.dateien.length}`));
        }
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

// --- Hauptschirm Meister -------------------------------------------------

function meisterScreen() {
  const scr = {
    title: 'Audio und Radio',
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Klaenge'));

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
        },
        meine ? 'deine eigene Sammlung, laeuft als Musik in Schleife' : 'einen Ordner mit deinen Audios waehlen'));

      if (_wurzeln) {
        wrap.appendChild(aktionZeile('Musik', () => screen.push(ordnerScreen(_wurzeln.musik, 'musik', 'Musik')), 'laeuft in Schleife'));
        wrap.appendChild(aktionZeile('Hintergrundstimmung', () => screen.push(ordnerScreen(_wurzeln.stimmung, 'stimmung', 'Hintergrundstimmung')), 'laeuft in Schleife'));
        wrap.appendChild(aktionZeile('Spontansounds', () => screen.push(ordnerScreen(_wurzeln.spontan, 'spontan', 'Spontansounds')), 'spielt einmal'));
      }

      const musikLaeuft = player.laeuftName('musik');
      const stimmungLaeuft = player.laeuftName('stimmung');
      wrap.appendChild(aktionZeile(musikLaeuft ? `Musik stoppen, laeuft ${musikLaeuft}` : 'Musik stoppen',
        () => { player.stoppeKanal('musik'); screen.refresh(); sprache.sage('Musik gestoppt.'); }));
      wrap.appendChild(aktionZeile(stimmungLaeuft ? `Hintergrundstimmung stoppen, laeuft ${stimmungLaeuft}` : 'Hintergrundstimmung stoppen',
        () => { player.stoppeKanal('stimmung'); screen.refresh(); sprache.sage('Hintergrundstimmung gestoppt.'); }));
      wrap.appendChild(aktionZeile('Alles stoppen', () => { player.stoppeAlles(); screen.refresh(); sprache.sage('Alle Klaenge gestoppt.'); }));

      wrap.appendChild(wertZeile({
        label: 'Meine Audio-Lautstaerke', get: () => player.getMonitorLautstaerke(),
        set: (v) => { player.setMonitorLautstaerke(v); merke('audio_monitor_vol', v); },
        min: 0, max: 100, ohneTon: true, nurWert: true,
        detail: 'Wie laut du die Klaenge selbst hoerst. Aendert nicht, wie laut die Spieler hoeren.',
      }));

      wrap.appendChild(abschnittTitel('Radio senden'));
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
        // Kurze Ansage; zum ruhigen Nachlesen steht der Schluessel im Tooltip der
        // Schluessel-Zeile (drei Zeichen je Zeile).
        sprache.sage(`Neuer Schluessel erzeugt: ${_schluessel}. Zum Nachlesen steht er im Tooltip der Schluessel-Zeile, drei Zeichen je Zeile.`);
      }, 'einen neuen, zufaelligen Radio-Schluessel'));

      wrap.appendChild(aktionZeile(senden ? 'Senden beenden' : 'Senden starten',
        () => (senden ? sendenBeenden() : sendenStarten()),
        senden ? 'das Radio ausschalten' : 'ab jetzt hoeren verbundene Spieler mit'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      if (!_wurzeln) { ladeGrunddaten().then(() => screen.refresh()); }
      sprache.sage('Audio und Radio. Klaenge oben, Radio unten.');
    },
  };
  return scr;
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
        min: 0, max: 100, ohneTon: true, nurWert: true,
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
