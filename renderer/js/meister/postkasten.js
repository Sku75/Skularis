/**
 * Skularistool — Meistertisch: Postkasten (Meisterpost).
 *
 * Der Meister startet die Post-Verbindung unter einem Code (den die Spieler
 * eingeben). Er sieht die verbundenen Spieler, kann Post an sie schicken und
 * bekommt eingehende Post in seinen Posteingang, mit Ton und Sprachmeldung.
 * Nachrichten lassen sich beantworten, löschen oder in die Notizen des jeweiligen
 * Charakters verschieben (Postablage), wo sie mit "Post von XY" erscheinen.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getMeister, speichere } from './state.js';
import { generiereSchluessel } from '../net/radio.js';
import * as post from '../net/post.js';

let _code = '';

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }

/** Eingehende Post ablegen, Ton und kurze Ansage (kein Fokuswechsel/Refresh). */
function empfangePost(m) {
  const a = getMeister();
  if (!a) return;
  a.posteingang = a.posteingang || [];
  if (m.id && a.posteingang.some(x => x.id === m.id)) return; // kein Doppel
  a.posteingang.unshift({ id: m.id, von: m.von || 'Spieler', text: String(m.text || ''), zeit: m.zeit || Date.now(), gelesen: false });
  speichere();
  sounds.playPost();
  sprache.sage(`Neue Post von ${m.von || 'Spieler'}.`);
}

function starteVerbindung() {
  _code = generiereSchluessel();
  post.starteMeisterPost(_code, {
    onBereit: () => { sprache.sage(`Post-Verbindung bereit. Code ${_code.split('').join(' ')}.`); screen.refresh(); },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerNeu: (name) => { sounds.playPost(); sprache.sage(`${name} ist mit der Post verbunden.`); },
    onSpielerWeg: (name) => { sprache.sage(`${name} hat die Post-Verbindung verlassen.`); },
    onNachricht: (m) => empfangePost(m),
  });
}

async function schreibeAn(ziel) {
  const text = await textDialog({ titel: `Post an ${ziel}`, label: 'Nachricht schreiben', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  if (post.meisterSende(ziel, text.trim())) { sounds.playSpeichern(); screen.pop(); sprache.sage(`Post an ${ziel} gesendet.`); }
  else sprache.sage('Nicht gesendet. Dieser Spieler ist nicht verbunden.');
}

function versendenScreen() {
  return {
    title: 'Post versenden',
    build() {
      const namen = post.verbundeneSpieler();
      const items = namen.map(n => ({ label: n, hint: 'Nachricht an diesen Spieler', onSelect: () => schreibeAn(n) }));
      return menuScreen({ title: 'Post versenden', subtitle: 'An wen? Enter öffnet das Textfeld, Enter sendet. Escape zurück.', items, leer: 'Kein Spieler verbunden.' }).build();
    },
    onShow() { sprache.sage('Post versenden. An welchen Spieler?'); },
  };
}

/** Post in die Notizen des Charakters (Name = Absender) ablegen. */
function inNotizen(a, von, text) {
  a.charNotizen = a.charNotizen || {};
  let v = a.charNotizen[von];
  if (typeof v === 'string') v = v.trim() ? [{ text: v.trim(), spieltag: a.spieltag || 1 }] : [];
  if (!Array.isArray(v)) v = [];
  v.unshift({ text: `Post von ${von}: ${text}`, spieltag: a.spieltag || 1 });
  a.charNotizen[von] = v;
}

function nachrichtMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const m = (a.posteingang || [])[index];
      if (!m) { screen.pop(); return document.createElement('div'); }
      m.gelesen = true;
      this.title = `Post von ${m.von}`;
      const items = [
        { label: 'Vorlesen', onSelect: () => sprache.sage(`Post von ${m.von}. ${m.text || 'Kein Text.'}`) },
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeAn(m.von) },
        {
          label: 'In Notizen verschieben (Postablage)',
          hint: `in die Notizen von ${m.von}`,
          onSelect: async () => {
            inNotizen(a, m.von, m.text);
            a.posteingang.splice(index, 1);
            await speichere(); screen.pop(); sprache.sage(`In die Notizen von ${m.von} verschoben.`);
          },
        },
        {
          label: 'Löschen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Löschen', frage: 'Diese Nachricht löschen?' })) return;
            a.posteingang.splice(index, 1);
            await speichere(); screen.pop(); sprache.sage('Gelöscht.');
          },
        },
      ];
      return menuScreen({ title: this.title, subtitle: 'Escape zurück.', items }).build();
    },
  };
}

function posteingangScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      const liste = a.posteingang || [];
      this.title = `Posteingang, ${liste.length}`;
      const items = liste.map((m, i) => ({
        label: `Post von ${m.von}: ${kurz(m.text)}`,
        detail: `Post von ${m.von}. ${m.text}`,
        hint: 'öffnen: vorlesen, antworten, verschieben, löschen',
        onSelect: () => screen.push(nachrichtMenuScreen(i)),
      }));
      return menuScreen({ title: this.title, subtitle: 'Shift und Pfeil-runter liest die Nachricht, Enter öffnet sie. Escape zurück.', items, leer: 'Noch keine Post.' }).build();
    },
    onShow() { sprache.sage('Posteingang.'); },
  };
}

export function postkastenScreen() {
  return {
    title: 'Postkasten',
    build() {
      const a = getMeister();
      const liste = (a && a.posteingang) || [];
      const aktiv = post.istAktiv();
      const items = [];
      if (aktiv) {
        items.push({ label: `Post-Verbindung läuft, Code ${_code}`, hint: 'Enter beendet die Post-Verbindung', onSelect: () => { post.stopp(); sprache.sage('Post-Verbindung beendet.'); screen.refresh(); } });
        items.push({ label: `Verbundene Spieler, ${post.verbundeneSpieler().length}`, hint: 'wer gerade mit der Post verbunden ist', onSelect: () => sprache.sage(post.verbundeneSpieler().length ? ('Verbunden: ' + post.verbundeneSpieler().join(', ') + '.') : 'Niemand verbunden.') });
      } else {
        items.push({ label: 'Post-Verbindung starten', hint: 'einen Code erzeugen, den die Spieler eingeben', onSelect: () => starteVerbindung() });
      }
      items.push({ label: 'Post versenden', hint: aktiv ? 'an einen verbundenen Spieler' : 'zuerst Verbindung starten', onSelect: () => screen.push(versendenScreen()) });
      items.push({ label: `Posteingang, ${liste.length}`, hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) });
      return menuScreen({
        title: 'Postkasten',
        subtitle: aktiv ? 'Verbindung läuft. Post versenden oder Posteingang. Escape zurück.' : 'Verbindung starten, dann können die Spieler mit dem Code verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(post.istAktiv() ? 'Postkasten. Verbindung läuft.' : 'Postkasten. Verbindung noch nicht gestartet.'); },
  };
}
