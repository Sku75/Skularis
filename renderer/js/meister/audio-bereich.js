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
import { textDialog } from '../ui/dialog.js';
import { abschnittTitel, aktionZeile, infoZeile, wertZeile, verbindeDetail } from '../editor/widgets.js';
import * as player from './audio-player.js';
import * as radio from '../net/radio.js';

const ipc = window.skularis?.ipc;

let _wurzeln = null;         // { audioDaten, musik, stimmung, spontan, meineAudios }
let _config = null;          // gespeicherte Werte (Lautstaerken, letzter Schluessel)
let _schluessel = '';        // aktueller Radio-Schluessel (Meister)
let _statusEl = null;        // Live-Statuszeile (wird von Radio-Rueckmeldungen aktualisiert)

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

/**
 * Ein Audio-Ordner als Menue: Unterordner zum Weiterblaettern, Dateien zum
 * Abspielen. kanal bestimmt das Verhalten: musik/stimmung laufen in Schleife
 * (mit Ueberblenden), spontan spielt einmal.
 */
function ordnerScreen(pfad, kanal, titel) {
  const scr = {
    title: titel,
    _inhalt: null,
    async lade() {
      try { scr._inhalt = await ipc.audioInhalt(pfad); }
      catch { scr._inhalt = { ordner: [], dateien: [] }; }
      screen.refresh();
    },
    build() {
      const inhalt = scr._inhalt || { ordner: [], dateien: [] };
      const items = [];
      for (const o of inhalt.ordner) {
        items.push({ label: o.name + ' (Ordner)', hint: 'Enter oeffnet den Ordner', onSelect: () => screen.push(ordnerScreen(o.pfad, kanal, o.name)) });
      }
      for (const d of inhalt.dateien) {
        items.push({
          label: d.name,
          hint: kanal === 'spontan' ? 'Enter spielt einmal, nochmal Enter stoppt' : 'Enter spielt in Schleife, nochmal Enter stoppt',
          onSelect: async () => {
            try {
              if (kanal === 'spontan') {
                // Nochmal Enter auf einem laufenden Spontansound haelt ihn an.
                if (player.spontanAktiv(d.pfad)) { player.stoppeSpontan(d.pfad); sprache.sage(`${d.name} gestoppt.`); }
                else { await player.spieleEinmal(d); sprache.sage(`${d.name} abgespielt.`); }
              } else {
                // Laeuft dieser Klang im Kanal schon, haelt Enter ihn an; sonst starten.
                if (player.laeuftPfad(kanal) === d.pfad) { player.stoppeKanal(kanal); sprache.sage(`${d.name} gestoppt.`); }
                else { await player.spieleSchleife(kanal, d); sprache.sage(`${d.name} laeuft.`); }
              }
            } catch (e) { console.error('Audio abspielen:', e); sprache.sage('Konnte nicht abgespielt werden.'); }
          },
        });
      }
      return menuScreen({
        title: this.title,
        subtitle: 'Enter spielt. Escape zurueck.',
        items,
        leer: 'Dieser Ordner ist leer. Lege Audio-Dateien hinein.',
        filter: items.length >= 10,
      }).build();
    },
    onShow() { if (scr._inhalt === null) scr.lade(); },
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
        min: 0, max: 100,
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
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Radio, Tisch anhoeren'));

      const verbunden = radio.istAktiv() && radio.rolle() === 'hoerer';
      const status = infoZeile(verbunden ? 'Mit dem Tisch verbunden.' : 'Nicht verbunden.',
        'Gib den Schluessel deines Meisters ein, um seinen Ton zu hoeren.');
      wrap.appendChild(status);
      _statusEl = status;

      wrap.appendChild(wertZeile({
        label: 'Radio-Lautstaerke', get: () => radio.getHoererLautstaerke(),
        set: (v) => { radio.setHoererLautstaerke(v); merke('radio_hoerer_vol', v); },
        min: 0, max: 100,
        detail: 'Wie laut du den Ton des Meisters hoerst. Ein eigener Kanal, getrennt von den uebrigen Toenen.',
      }));

      const letzter = (_config && _config.radio_letzter_schluessel) || '';
      wrap.appendChild(aktionZeile('Tisch anhoeren', () => tischAnhoeren(letzter),
        letzter ? `Schluessel eingeben (zuletzt ${letzter})` : 'Schluessel des Meisters eingeben'));

      if (letzter) {
        wrap.appendChild(aktionZeile(`Mit letztem Schluessel verbinden, ${letzter}`, () => verbinde(letzter),
          'ohne erneutes Eingeben verbinden'));
      }

      if (verbunden) {
        wrap.appendChild(aktionZeile('Verbindung trennen', () => { radio.stopp(); setzeStatus('Nicht verbunden.'); screen.refresh(); sprache.sage('Verbindung getrennt.'); }));
      }

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      if (!_config) { ladeGrunddaten().then(() => screen.refresh()); }
      sprache.sage('Radio. Tisch anhoeren.');
    },
  };
  return scr;
}

async function tischAnhoeren(vorgabe) {
  const key = await textDialog({ titel: 'Tisch anhoeren', label: 'Schluessel des Meisters', wert: vorgabe || '' });
  if (key === null || !key.trim()) return;
  verbinde(key.trim().toLowerCase());
}

function verbinde(key) {
  merke('radio_letzter_schluessel', key);
  sprache.sage('Verbinde mit dem Tisch, einen Moment.');
  radio.starteHoeren(key, {
    onVerbunden: () => { setzeStatus('Mit dem Tisch verbunden.'); screen.refresh(); sprache.sage('Verbunden. Du hoerst jetzt den Tisch.'); },
    onGetrennt: () => { setzeStatus('Nicht verbunden.'); screen.refresh(); sprache.sage('Verbindung getrennt.'); },
    onFehler: (t) => { setzeStatus('Nicht verbunden.'); sprache.sage(t); },
  });
  screen.refresh();
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
