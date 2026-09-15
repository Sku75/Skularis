/**
 * Skularis — Optionen (seit 1.20 vierteilig).
 *
 * Vier Bereiche: Allgemein (Sprachausgabe, Lautstärke, Schrift, alle überall
 * gültigen Tasten — auch die festen, als lesbare Dokumentation),
 * Charakterverwaltung, Abenteuertisch und Meistertisch (je Bereich die dort
 * wirksamen Tasten und Einstellungen). Danach Neuerungen und Über Skularis.
 *
 * Tasten werden je Bereich angezeigt, angesagt und umbelegt; Anzeige, Ansage
 * und Auslösung kommen aus derselben Kürzel-Registry (shortcuts.js) — nach
 * einer Umbelegung stimmen alle drei sofort überein.
 */

import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import * as screen from '../ui/screen.js';
import * as einstellungen from './../daten/einstellungen.js';
import * as shortcuts from '../shortcuts.js';
import * as reiterTasten from '../ui/reiter-tasten.js';
import * as kurztasten from '../meister/kurztasten.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog, zahlDialog } from '../ui/dialog.js';

// "Über Skularis" — jede Zeile ist mit Pfeiltasten einzeln lesbar. Die
// Versionszeile kommt aus der App (VERSION), der Rest steht hier.
const UEBER_ZEILEN = [
  'Entwickler: Sku',
  'Skularis ist ein Werkzeug, um Charaktere nach dem Regelwerk Ilaris zu erstellen.',
  'Mit dem Abenteuer-Tisch und dem Meister-Tisch stehen beim Spielen Umgebungen bereit, in denen Regeln, Charakter- und Abenteuerinformationen sowie ergänzende Funktionen leicht und barrierefrei erreichbar sind.',
  'Ziel von Skularis ist es, Rollenspielrunden während des Spiels bestmöglich zu unterstützen. Der Entwickler legt besonderen Wert auf vollständige Barrierefreiheit und darauf, die Informationen so bereitzustellen, dass flüssiges und immersives Spielen möglich wird.',
  'Skularis ist ein Fanprojekt und befindet sich in Entwicklung.',
  'Grundlage ist das freie Fan-Regelwerk Ilaris, das kostenlos genutzt werden darf.',
  'Rechtliches:',
  'Skularis ist eine inoffizielle, nichtkommerzielle Fan-Spielhilfe und steht in keiner offiziellen Verbindung zu Ulisses Spiele.',
  'DAS SCHWARZE AUGE, AVENTURIEN und die zugehörigen Namen und Logos sind eingetragene Marken der Ulisses Spiele GmbH. Ihre Nennung erfolgt im Rahmen der Ulisses-Fanrichtlinie und ohne kommerzielle Absicht.',
  'Grundlage ist das freie Fan-Regelwerk Ilaris, Copyright Ulisses Spiele GmbH, das kostenlos genutzt werden darf. Regeltexte und Daten stammen aus Ilaris und dem offenen Werkzeug Sephrasto.',
  'Inhalte können von offiziellen Publikationen abweichen.',
];

async function zeigeUeber() {
  let version = '';
  try {
    const info = await window.skularis.ipc.appInfo();
    if (info && info.version) version = String(info.version).replace(/^Skularis\s*/i, '');
  } catch (_e) { /* ohne Versionsnummer weiter */ }

  const zeilen = [version ? `Skularis, Version ${version}` : 'Skularis', ...UEBER_ZEILEN];
  screen.push(menuScreen({
    title: 'Über Skularis',
    subtitle: 'Pfeiltasten lesen Zeile für Zeile. Escape kehrt zurück.',
    items: zeilen.map(z => ({ label: z, onSelect: () => {} })),
    filter: false,
  }));
}

// "Neuerungen" — die Patchnotes aus dem Programmordner, Absatz für Absatz mit
// Pfeiltasten lesbar. Kommt aus der laufenden Version, also immer aktuell.
async function zeigePatchnotes() {
  let text = '';
  try { text = await window.skularis.ipc.patchnotes(); } catch (_e) { /* leer weiter */ }
  const bloecke = String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map(b => b.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean);
  const items = bloecke.length
    ? bloecke.map(b => ({ label: b, onSelect: () => {} }))
    : [{ label: 'Keine Patchnotes gefunden.', onSelect: () => {} }];
  screen.push(menuScreen({
    title: 'Neuerungen',
    subtitle: 'Die Änderungen je Version, Absatz für Absatz lesbar. Escape kehrt zurück.',
    items, filter: false,
  }));
}

function setFont(neu) {
  neu = Math.max(-4, Math.min(8, neu));
  einstellungen.setWert('schrift_offset', neu);
  document.documentElement.style.setProperty('--db-font-offset', `${neu}px`);
  const anzeige = neu > 0 ? `plus ${neu}` : (neu < 0 ? `minus ${Math.abs(neu)}` : 'normal');
  sprache.sage(`Schriftgröße ${anzeige}.`);
}

async function aktuellerFont() {
  return (await einstellungen.get('schrift_offset')) || 0;
}

function setVolume(prozent) {
  const alt = sounds.getVolume();
  prozent = Math.max(0, Math.min(100, prozent));
  sounds.setVolume(prozent);
  const slider = document.getElementById('volume-slider');
  const anzeige = document.getElementById('volume-display');
  if (slider) slider.value = prozent;
  if (anzeige) anzeige.textContent = String(prozent);
  // Keine Ansage der neuen Position mehr (Nutzerwunsch). Nur am Rand (0/100 oder
  // schon am Anschlag) ein Anschlagklang.
  if (prozent === alt || prozent === 0 || prozent === 100) sounds.playGrenze();
}

/** Modal: den naechsten Tastendruck als Kombination erfassen (Escape bricht ab). */
function erfasseKombination() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'db-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Neue Tastenkombination');
    dlg.insertAdjacentHTML('beforeend',
      '<div class="db-dialog__header" aria-hidden="true"><span class="db-dialog__title">Neue Tastenkombination</span></div>'
      + '<div class="db-dialog__body"><p class="db-dialog__label">Druecke jetzt die gewuenschte Tastenkombination. Escape bricht ab.</p></div>');
    const live = document.createElement('div');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'assertive');
    dlg.appendChild(live);
    document.body.appendChild(dlg);
    const fertig = (v) => { try { dlg.close(); } catch { /* egal */ } dlg.remove(); resolve(v); };
    dlg.addEventListener('keydown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { fertig(null); return; }
      const combo = shortcuts.comboAusEvent(e);
      if (!combo) return; // reiner Modifier: weiter warten
      fertig(combo);
    }, true);
    dlg.showModal();
    requestAnimationFrame(() => { live.textContent = 'Druecke die neue Tastenkombination.'; });
  });
}

// Aus dem physischen Tastencode einen Namen machen, den man vorgelesen versteht.
// Der Code sagt, WELCHE Taste gedrueckt wurde, unabhaengig vom Zeichen, das dabei
// herauskommt. Auf der deutschen Tastatur liefert etwa Umschalt und 0 ein
// Gleichheitszeichen, der Code bleibt aber "Digit0".
function tastenName(code) {
  if (!code) return 'unbekannte Taste';
  let m = /^Digit(\d)$/.exec(code);
  if (m) return `Zifferntaste ${m[1]}`;
  m = /^Key([A-Z])$/.exec(code);
  if (m) return `Buchstabe ${m[1]}`;
  m = /^Numpad(.+)$/.exec(code);
  if (m) return `Ziffernblock ${m[1]}`;
  if (/^F\d+$/.test(code)) return `Taste ${code}`;
  const feste = {
    Minus: 'Taste ß', Equal: 'Taste Akut', BracketLeft: 'Taste ü', BracketRight: 'Taste Plus',
    Semicolon: 'Taste ö', Quote: 'Taste ä', Backquote: 'Taste Zirkumflex',
    Backslash: 'Taste Raute', Comma: 'Taste Komma', Period: 'Taste Punkt', Slash: 'Taste Minus',
    Space: 'Leertaste', Enter: 'Eingabetaste', Tab: 'Tabulator', Backspace: 'Rücktaste',
  };
  return feste[code] || `Taste ${code}`;
}

// Laeuft gerade ein Tastentest? Dann sammelt er hier, was die Seite selbst
// gesehen hat, und kann so melden, wenn ein Druck NUR ueber den zweiten Weg aus
// dem Hauptprozess hereinkam — das ist genau der Fall, in dem eine Kombination
// unterwegs verschluckt wird.
let _testLaeuft = null;
let _testRohAngemeldet = false;

function testSchluessel(code, ctrl, shift, alt) {
  return [code || '', ctrl ? 'c' : '', shift ? 's' : '', alt ? 'a' : ''].join('|');
}

function testRohAnmelden() {
  if (_testRohAngemeldet) return;
  const ipc = window.skularis && window.skularis.ipc;
  if (!ipc || typeof ipc.onTasteRoh !== 'function') return;
  _testRohAngemeldet = true;
  ipc.onTasteRoh((d) => {
    if (!_testLaeuft || !d) return;
    const k = testSchluessel(d.code, d.ctrl, d.shift, d.alt);
    // Kurz warten: Der normale Weg ist schneller, der Nachzuegler kommt hinterher.
    setTimeout(() => {
      if (!_testLaeuft || _testLaeuft.gesehen.has(k)) return;
      const teile = [];
      if (d.ctrl) teile.push('Strg');
      if (d.shift) teile.push('Umschalt');
      if (d.alt) teile.push('Alt');
      teile.push(tastenName(d.code));
      _testLaeuft.sage(`Nur ueber den zweiten Weg angekommen: ${teile.join(', ')}. Die Seite selbst hat diesen Druck nicht bekommen.`);
    }, 200);
  });
}

/** Modal: jeden Tastendruck ansagen, bis Escape. Zeigt, was bei Skularis ankommt.
 *  Gedacht für den Fall, dass eine Tastenkombination nichts auslöst — kommt gar
 *  keine Ansage, dann erreicht der Tastendruck Skularis nicht, und die Ursache
 *  liegt außerhalb (Windows, Screenreader, ein Hilfsprogramm). */
function tastentestDialog() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'db-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Tastentest');
    dlg.insertAdjacentHTML('beforeend',
      '<div class="db-dialog__header" aria-hidden="true"><span class="db-dialog__title">Tastentest</span></div>'
      + '<div class="db-dialog__body"><p class="db-dialog__label">Druecke eine beliebige Taste oder Tastenkombination. Skularis sagt an, was angekommen ist. Escape beendet den Test.</p></div>');
    const live = document.createElement('div');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'assertive');
    dlg.appendChild(live);
    document.body.appendChild(dlg);
    const ansagen = (t) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = t; }); };
    testRohAnmelden();
    _testLaeuft = { gesehen: new Set(), sage: ansagen };
    const fertig = () => { _testLaeuft = null; try { dlg.close(); } catch { /* egal */ } dlg.remove(); resolve(); };
    dlg.addEventListener('keydown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { fertig(); return; }
      const k = (e.key || '').toLowerCase();
      if (k === 'control' || k === 'shift' || k === 'alt' || k === 'meta') return; // reiner Modifier: weiter warten
      if (_testLaeuft) _testLaeuft.gesehen.add(testSchluessel(e.code, e.ctrlKey, e.shiftKey, e.altKey));
      const teile = [];
      if (e.ctrlKey) teile.push('Strg');
      if (e.shiftKey) teile.push('Umschalt');
      if (e.altKey) teile.push('Alt');
      teile.push(tastenName(e.code));
      let text = teile.join(', ');
      if (e.key && e.key.length === 1) text += `. Zeichen ${e.key}`;
      let nr = null;
      try { nr = kurztasten.platzFuer(e); } catch { /* egal */ }
      text += nr ? `. Schnelltaste ${nr}.` : '. Keiner Schnelltaste zugeordnet.';
      // Immer neu setzen, damit auch dieselbe Taste zweimal angesagt wird.
      ansagen(text);
    }, true);
    dlg.showModal();
    requestAnimationFrame(() => { live.textContent = 'Tastentest. Druecke eine Taste. Escape beendet.'; });
  });
}

/** Menü-Eintrag für EIN umbelegbares Kürzel aus der Registry (mit Konfliktprüfung). */
function kuerzelEintrag(k) {
  return {
    label: `${k.beschreibung}: ${shortcuts.kuerzelText(k.combo)}`,
    hint: 'Enter: neu belegen oder auf Standard zurücksetzen',
    onSelect: async () => {
      const w = await knopfDialog({
        titel: k.beschreibung,
        frage: `Aktuell ${shortcuts.kuerzelText(k.combo)}. Standard ${shortcuts.kuerzelText(k.standard)}.`,
        knoepfe: [
          { label: 'Neu belegen', wert: 'neu' },
          { label: 'Auf Standard zurücksetzen', wert: 'std' },
          { label: 'Abbrechen', wert: 'ab' },
        ],
      });
      if (w === 'neu') {
        const c = await erfasseKombination();
        if (!c) return;
        if (!shortcuts.istVergebbar(c)) { sprache.sage(`${shortcuts.kuerzelText(c)} ist für die Navigation reserviert und kann nicht vergeben werden.`); return; }
        const konflikt = shortcuts.konfliktFuer(k.id, c);
        if (konflikt) { sprache.sage(`${shortcuts.kuerzelText(c)} liegt schon auf ${konflikt}. Bitte eine andere Kombination wählen.`); return; }
        shortcuts.neuBelegen(k.id, c);
        screen.refresh();
        sprache.sage(`${k.beschreibung} liegt jetzt auf ${shortcuts.kuerzelText(c)}.`);
      } else if (w === 'std') {
        shortcuts.zuruecksetzen(k.id);
        screen.refresh();
        sprache.sage(`${k.beschreibung} auf Standard zurückgesetzt.`);
      }
    },
  };
}

/** Nicht umbelegbare Taste als lesbare Dokumentations-Zeile. */
function festeZeile(beschreibung, taste, detail) {
  return { label: `${beschreibung}: ${taste} (fest)`, detail: detail || `${beschreibung}. Diese Taste ist fest belegt und nicht umbelegbar.`, onSelect: () => sprache.sage(`${beschreibung}, ${taste}. Fest belegt.`) };
}

// --- Bereich Allgemein ----------------------------------------------------

function allgemeinScreen() {
  return {
    title: 'Allgemein',
    build() {
      const items = [
        {
          label: 'Sprachausgabe ein oder aus',
          taste: () => shortcuts.comboText('sprache'),
          hint: 'Schaltet die gesprochenen Ansagen um',
          onSelect: async () => { const m = await import('../app.js'); m.sprachausgabeUmschalten(); },
        },
        { label: 'Lautstärke erhöhen', taste: () => shortcuts.comboText('lautstaerke_plus'), hint: 'Software-Sounds lauter', onSelect: () => setVolume(sounds.getVolume() + 5) },
        { label: 'Lautstärke verringern', taste: () => shortcuts.comboText('lautstaerke_minus'), hint: 'Software-Sounds leiser', onSelect: () => setVolume(sounds.getVolume() - 5) },
        { label: 'Schrift vergrößern', taste: () => shortcuts.comboText('schrift_plus'), onSelect: async () => setFont((await aktuellerFont()) + 1) },
        { label: 'Schrift verkleinern', taste: () => shortcuts.comboText('schrift_minus'), onSelect: async () => setFont((await aktuellerFont()) - 1) },
        { label: 'Schrift auf Normalgröße', taste: () => shortcuts.comboText('schrift_reset'), onSelect: () => setFont(0) },
      ];
      // Alle umbelegbaren Allgemein-Kürzel als eigene Tastenzeilen.
      for (const k of shortcuts.belegbareListe('global')) items.push(kuerzelEintrag(k));
      // Feste Tasten als lesbare Dokumentation.
      items.push(festeZeile('Zurück', 'Escape oder Rücktaste'));
      items.push(festeZeile('Anwendungslautstärke', 'Numpad Plus und Minus', 'Ein Master über alles, was du hörst (Bedien-Töne, Player, Radio-Empfang). Mit Strg in 5er-Schritten.'));
      items.push(festeZeile('Tooltip lesen', 'Umschalt halten und Pfeil runter'));
      items.push(festeZeile('Zur nächsten Überschrift', 'Strg und Pfeil hoch oder runter'));
      // Diagnose: welche Dienste laufen gerade? Nach dem Verlassen eines Tisches
      // muss die Liste leer sein (Release-Prüfung gegen heimliche Dauerläufer).
      items.push({
        label: 'Diagnose: laufende Dienste',
        hint: 'zeigt registrierte Dienste des aktiven Moduls; nach Tischverlassen leer',
        onSelect: async () => {
          const m = await import('../core/modul.js');
          const liste = m.aktiveDienste();
          sprache.sage(liste.length ? `${liste.length} aktive Dienste: ${liste.join(', ')}.` : 'Keine aktiven Dienste. Alles ruhig.');
        },
      });
      return menuScreen({
        title: 'Allgemein',
        subtitle: 'Überall gültige Einstellungen und Tasten. Enter stellt um oder belegt neu. Escape zurück.',
        items, filter: false,
      }).build();
    },
    onShow() { sprache.sage('Allgemein. Einstellungen und Tasten, die überall gelten.'); },
  };
}

// --- Bereich Charakterverwaltung ------------------------------------------

function charakterBereichScreen() {
  return menuScreen({
    title: 'Charakterverwaltung',
    subtitle: 'Tasten des Charakter-Editors. Escape zurück.',
    items: [
      festeZeile('Editor-Bereiche', 'F1 bis F12', 'Im Editor springen die F-Tasten direkt zwischen den Bereichen (Attribute, Fertigkeiten, Ausrüstung und so weiter), in der Reihenfolge des Editor-Menüs.'),
      festeZeile('Bereich frisch oben öffnen', 'Umschalt und F-Taste'),
      festeZeile('Zum Hauptmenü des Editors', 'Strg Pos1'),
    ],
    filter: false,
  });
}

// --- Reiter-Tasten (bestehende Umbelegung je Tisch) -----------------------

function reiterEintrag(bereich, nr, name, frisch) {
  const combo = reiterTasten.comboFuer(bereich, nr, frisch);
  const bez = frisch ? `${name} Menü oben` : `${name} an Merkposition`;
  const std = frisch ? `Shift+F${nr}` : `F${nr}`;
  return {
    label: `${bez}: ${shortcuts.kuerzelText(combo)}`,
    hint: frisch
      ? 'springt in den Reiter und stellt den Fokus oben auf den ersten Punkt'
      : 'springt in den Reiter an die zuletzt verlassene Stelle',
    onSelect: async () => {
      const w = await knopfDialog({
        titel: bez,
        frage: `Aktuell ${shortcuts.kuerzelText(combo)}. Standard ${shortcuts.kuerzelText(std)}.`,
        knoepfe: [
          { label: 'Neu belegen', wert: 'neu' },
          { label: 'Auf Standard zurücksetzen', wert: 'std' },
          { label: 'Abbrechen', wert: 'ab' },
        ],
      });
      if (w === 'neu') {
        const c = await erfasseKombination();
        if (!c) return;
        if (!shortcuts.istVergebbar(c)) { sprache.sage(`${shortcuts.kuerzelText(c)} ist für die Navigation reserviert.`); return; }
        reiterTasten.setCombo(bereich, nr, frisch, c);
        screen.refresh();
        sprache.sage(`${bez} liegt jetzt auf ${shortcuts.kuerzelText(c)}.`);
      } else if (w === 'std') {
        reiterTasten.reset(bereich, nr, frisch);
        screen.refresh();
        sprache.sage(`${bez} auf Standard zurückgesetzt.`);
      }
    },
  };
}

function reiterBereichScreen(bereich) {
  return {
    title: '',
    build() {
      this.title = `Reiter-Tasten ${reiterTasten.bereichName(bereich)}`;
      const items = [];
      for (const r of reiterTasten.liste(bereich)) {
        items.push(reiterEintrag(bereich, r.nr, r.name, false));
        items.push(reiterEintrag(bereich, r.nr, r.name, true));
      }
      return menuScreen({
        title: this.title,
        subtitle: 'Jede Funktion hat eine eigene Taste. Enter belegt neu oder setzt auf Standard zurück. Escape zurück.',
        items, filter: false,
      }).build();
    },
  };
}

// --- Audio-Schnelltasten (Meistertisch) -----------------------------------

function kurztastenBelegungScreen() {
  return {
    title: 'Audio-Schnelltasten',
    build() {
      // Ganz oben das Messgerät: Löst eine Kombination nichts aus, zeigt der
      // Tastentest, ob der Tastendruck bei Skularis überhaupt ankommt.
      const items = [{
        label: 'Tastentest',
        hint: 'Enter: prüfen, was bei Skularis ankommt',
        detail: 'Drücke danach eine beliebige Taste oder Tastenkombination. Skularis sagt an, welche Taste angekommen ist und welcher Schnelltaste sie entspricht. Kommt gar keine Ansage, dann erreicht der Tastendruck Skularis nicht — die Ursache liegt dann außerhalb, etwa bei Windows, beim Screenreader oder bei einem anderen Programm. Escape beendet den Test.',
        onSelect: async () => { await tastentestDialog(); sprache.sage('Tastentest beendet.'); },
      }];
      kurztasten.liste().forEach(k => items.push({
        label: `Schnelltaste ${k.nr}: ${shortcuts.kuerzelText(k.combo)}`,
        hint: 'Enter: neu belegen oder auf Standard zurücksetzen',
        onSelect: async () => {
          const w = await knopfDialog({
            titel: `Schnelltaste ${k.nr}`,
            frage: `Aktuell ${shortcuts.kuerzelText(k.combo)}. Standard ${shortcuts.kuerzelText(k.std)}.`,
            knoepfe: [
              { label: 'Neu belegen', wert: 'neu' },
              { label: 'Auf Standard zurücksetzen', wert: 'std' },
              { label: 'Abbrechen', wert: 'ab' },
            ],
          });
          if (w === 'neu') {
            const c = await erfasseKombination();
            if (!c) return;
            if (!shortcuts.istVergebbar(c)) { sprache.sage(`${shortcuts.kuerzelText(c)} ist für die Navigation reserviert.`); return; }
            kurztasten.setCombo(k.nr, c);
            screen.refresh();
            sprache.sage(`Schnelltaste ${k.nr} liegt jetzt auf ${shortcuts.kuerzelText(c)}.`);
          } else if (w === 'std') {
            kurztasten.reset(k.nr);
            screen.refresh();
            sprache.sage(`Schnelltaste ${k.nr} auf Standard zurückgesetzt.`);
          }
        },
      }));
      return menuScreen({
        title: 'Audio-Schnelltasten (Meistertisch)',
        subtitle: 'Die 24 Tasten für die Audio-Schnelltasten (Block 1 mit Strg, Block 2 mit Strg und Umschalt). Was jede Taste abspielt, legst du im Meistertisch unter F12, Bibliothek, Kurztasten fest. Escape zurück.',
        items, filter: false,
      }).build();
    },
  };
}

// --- Übertragungseinstellungen (Meister-Radio) ----------------------------

function uebertragungScreen() {
  const scr = {
    title: 'Übertragungseinstellungen',
    _bitrate: 128,
    _mono: false,
    _geladen: false,
    async lade() {
      const b = await einstellungen.get('radio_bitrate');
      const m = await einstellungen.get('radio_mono');
      scr._bitrate = (typeof b === 'number' && b >= 32 && b <= 128) ? b : 128;
      scr._mono = m === true;
      scr._geladen = true;
      screen.refresh();
    },
    build() {
      const items = [
        {
          label: `Übertragungsqualität: ${scr._bitrate} kbit pro Sekunde`,
          hint: 'niedriger spart Daten, 32 bis 128',
          onSelect: async () => {
            const v = await zahlDialog({ titel: 'Übertragungsqualität', label: 'kbit pro Sekunde, 32 bis 128', wert: scr._bitrate, min: 32, max: 128 });
            if (v === null) return;
            scr._bitrate = v; einstellungen.setWert('radio_bitrate', v); screen.refresh();
            sprache.sage(`Übertragungsqualität ${v} kbit pro Sekunde. Gilt beim nächsten Senden.`);
          },
        },
        {
          label: `Ton: ${scr._mono ? 'Mono' : 'Stereo'}`,
          hint: 'Mono spart etwa die Hälfte der Daten',
          onSelect: () => {
            scr._mono = !scr._mono; einstellungen.setWert('radio_mono', scr._mono); screen.refresh();
            sprache.sage(scr._mono ? 'Mono. Gilt beim nächsten Senden.' : 'Stereo. Gilt beim nächsten Senden.');
          },
        },
      ];
      return menuScreen({
        title: 'Übertragungseinstellungen',
        subtitle: 'Gilt für das Meister-Radio. Niedriger spart Daten. Wirkt ab dem nächsten Senden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { if (!scr._geladen) scr.lade(); },
  };
  return scr;
}

// --- Bereiche Abenteuertisch und Meistertisch -----------------------------

function abenteuertischScreen() {
  return {
    title: 'Abenteuertisch',
    build() {
      const items = [
        { label: 'Reiter-Tasten (F1 bis F12)', hint: 'jede Reiter-Funktion einzeln umbelegen', onSelect: () => screen.push(reiterBereichScreen('abenteuer')) },
      ];
      for (const k of shortcuts.belegbareListe('abenteuer')) items.push(kuerzelEintrag(k));
      items.push(festeZeile('Spieler-Audio (Zuhören)', 'F12', 'Der Audio-Reiter des Abenteuertisches: Schlüssel eingeben und den Tisch des Meisters anhören.'));
      return menuScreen({
        title: 'Abenteuertisch',
        subtitle: 'Diese Tasten wirken nur am Abenteuertisch mit geladenem Abenteuer. Escape zurück.',
        items, filter: false,
      }).build();
    },
    onShow() { sprache.sage('Abenteuertisch. Diese Tasten wirken nur mit geladenem Abenteuer.'); },
  };
}

function meistertischScreen() {
  return {
    title: 'Meistertisch',
    build() {
      const items = [
        { label: 'Reiter-Tasten (F1 bis F12)', hint: 'jede Reiter-Funktion einzeln umbelegen', onSelect: () => screen.push(reiterBereichScreen('meister')) },
        { label: 'Audio-Schnelltasten', hint: 'Strg 1 bis Strg Akzent und mit Umschalt, frei umbelegbar', onSelect: () => screen.push(kurztastenBelegungScreen()) },
      ];
      for (const k of shortcuts.belegbareListe('meister')) items.push(kuerzelEintrag(k));
      items.push({ label: 'Übertragungseinstellungen', hint: 'Qualität und Stereo/Mono für das Meister-Radio (spart Daten)', onSelect: () => screen.push(uebertragungScreen()) });
      items.push(festeZeile('Meister-Audio (Senden)', 'F12', 'Der Audio-Reiter des Meistertisches: Bibliothek, Playlists, Schlüssel und Senden.'));
      items.push(festeZeile('Privates Vorhören', 'Strg und Eingabetaste', 'Im Audio-Bereich: Datei nur für den Meister anhören, der Spieler-Stream läuft unverändert weiter.'));
      items.push(festeZeile('Klänge stoppen', 'Strg F12', 'Stoppt alle laufenden Klänge (Kanäle, Playlist, Vorhören). Das Radio-Senden läuft weiter.'));
      return menuScreen({
        title: 'Meistertisch',
        subtitle: 'Diese Tasten wirken nur am Meistertisch mit geladenem Meisterabenteuer. Escape zurück.',
        items, filter: false,
      }).build();
    },
    onShow() { sprache.sage('Meistertisch. Diese Tasten wirken nur mit geladenem Meisterabenteuer.'); },
  };
}

// --- Einstieg -------------------------------------------------------------

export function build() {
  return menuScreen({
    title: 'Optionen',
    subtitle: 'Allgemein, Charakterverwaltung, Abenteuertisch, Meistertisch. Escape kehrt zurück.',
    items: [
      { label: 'Allgemein', hint: 'Sprachausgabe, Lautstärke, Schrift und alle überall gültigen Tasten', onSelect: () => screen.push(allgemeinScreen()) },
      { label: 'Charakterverwaltung', hint: 'Tasten des Charakter-Editors', onSelect: () => screen.push(charakterBereichScreen()) },
      { label: 'Abenteuertisch', hint: 'Reiter-Tasten und die Würfel-Kürzel (wirken nur am Tisch)', onSelect: () => screen.push(abenteuertischScreen()) },
      { label: 'Meistertisch', hint: 'Reiter-Tasten, Audio-Schnelltasten, Senden und Übertragung', onSelect: () => screen.push(meistertischScreen()) },
      { label: 'Neuerungen', hint: 'Was sich in dieser und den letzten Versionen geändert hat', onSelect: () => zeigePatchnotes() },
      { label: 'Über Skularis', hint: 'Programm-Informationen, Zeile für Zeile lesbar', onSelect: () => zeigeUeber() },
    ],
  });
}
