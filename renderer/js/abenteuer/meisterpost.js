/**
 * Skularistool — Abenteuertisch (Spieler): Meisterpost.
 *
 * Der Spieler verbindet sich mit einem Code des Meisters und seinem Namen zum
 * Post-Kanal (net/post.js). Danach kann er Post an den Meister oder an verbundene
 * Mitspieler schicken und bekommt eingehende Post in seinen Posteingang, mit Ton
 * und Sprachmeldung. Nachrichten lassen sich beantworten, löschen oder ins
 * Notizbuch bzw. Tagebuch verschieben (dann erscheinen sie dort mit "Post von XY").
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';
import * as post from '../net/post.js';

let _mitspieler = [];   // andere verbundene Spieler (für "Post versenden")
let _eigenerName = '';

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }

/** Eingehende Post ablegen, Ton und kurze Ansage (kein Fokuswechsel/Refresh). */
function empfangePost(m) {
  const a = getAbenteuer();
  if (!a) return;
  a.posteingang = a.posteingang || [];
  if (m.id && a.posteingang.some(x => x.id === m.id)) return; // kein Doppel
  a.posteingang.unshift({ id: m.id, von: m.von || 'Meister', text: String(m.text || ''), zeit: m.zeit || Date.now(), gelesen: false });
  speichere();
  sounds.playPost();
  sprache.sage(`Neue Post von ${m.von || 'Meister'}.`);
}

async function verbinde() {
  const a = getAbenteuer();
  const code = await textDialog({ titel: 'Meisterpost verbinden', label: 'Code vom Meister eingeben' });
  if (code === null || !code.trim()) return;
  const vorschlag = (a && a.charakter && a.charakter.name) || '';
  const name = await textDialog({ titel: 'Dein Name', label: 'Dein Name, wie dein Charakter heißt', wert: vorschlag });
  if (name === null || !name.trim()) return;
  _eigenerName = name.trim();
  post.verbindeSpielerPost(code.trim(), _eigenerName, {
    onVerbunden: () => { sprache.sage('Mit dem Meister verbunden.'); screen.refresh(); },
    onGetrennt: () => { sprache.sage('Verbindung zum Meister getrennt.'); },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerListe: (namen) => { _mitspieler = (namen || []).filter(n => n !== _eigenerName); },
    onNachricht: (m) => empfangePost(m),
  });
  sprache.sage('Verbinde …');
}

async function schreibeAn(ziel) {
  const text = await textDialog({ titel: `Post an ${ziel}`, label: 'Nachricht schreiben', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  if (post.spielerSende(ziel, text.trim())) { sounds.playSpeichern(); screen.pop(); sprache.sage(`Post an ${ziel} gesendet.`); }
  else sprache.sage('Nicht gesendet. Keine Verbindung.');
}

function versendenScreen() {
  return {
    title: 'Post versenden',
    build() {
      const items = [];
      if (!post.istVerbunden()) {
        return menuScreen({ title: 'Post versenden', subtitle: 'Zuerst oben verbinden. Escape zurück.', items: [], leer: 'Nicht verbunden. Erst mit dem Meister verbinden.' }).build();
      }
      items.push({ label: 'Meister', hint: 'Nachricht an den Meister schreiben', onSelect: () => schreibeAn('Meister') });
      for (const n of _mitspieler) items.push({ label: n, hint: 'Nachricht an diesen Mitspieler', onSelect: () => schreibeAn(n) });
      return menuScreen({ title: 'Post versenden', subtitle: 'An wen? Enter öffnet das Textfeld, Enter sendet. Escape zurück.', items, leer: 'Nur der Meister ist erreichbar.' }).build();
    },
    onShow() { sprache.sage('Post versenden. An wen?'); },
  };
}

function nachrichtMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getAbenteuer();
      const m = (a.posteingang || [])[index];
      if (!m) { screen.pop(); return document.createElement('div'); }
      m.gelesen = true;
      this.title = `Post von ${m.von}`;
      const verschiebe = (typ, wort) => async () => {
        a.journal = a.journal || [];
        a.journal.push({ typ, titel: `Post von ${m.von}`, inhalt: m.text, spieltag: a.spieltag || 1 });
        a.posteingang.splice(index, 1);
        await speichere(); screen.pop(); sprache.sage(`In ${wort} verschoben.`);
      };
      const items = [
        { label: 'Vorlesen', onSelect: () => sprache.sage(`Post von ${m.von}. ${m.text || 'Kein Text.'}`) },
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeAn(m.von) },
        { label: 'In Notizbuch verschieben', onSelect: verschiebe('notiz', 'das Notizbuch') },
        { label: 'In Tagebuch verschieben', onSelect: verschiebe('tagebuch', 'das Tagebuch') },
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
      const a = getAbenteuer();
      const liste = a.posteingang || [];
      this.title = `Mein Posteingang, ${liste.length}`;
      const items = liste.map((m, i) => ({
        label: `Post von ${m.von}: ${kurz(m.text)}`,
        detail: `Post von ${m.von}. ${m.text}`,
        hint: 'öffnen: vorlesen, antworten, verschieben, löschen',
        onSelect: () => screen.push(nachrichtMenuScreen(i)),
      }));
      return menuScreen({ title: this.title, subtitle: 'Shift und Pfeil-runter liest die Nachricht, Enter öffnet sie. Escape zurück.', items, leer: 'Noch keine Post.' }).build();
    },
    onShow() { sprache.sage('Mein Posteingang.'); },
  };
}

export function meisterpostScreen() {
  return {
    title: 'Meisterpost',
    build() {
      const a = getAbenteuer();
      const liste = (a && a.posteingang) || [];
      const verbunden = post.istVerbunden();
      const items = [];
      if (verbunden) {
        items.push({ label: 'Verbindung trennen', hint: 'die Post-Verbindung zum Meister beenden', onSelect: () => { post.stopp(); sprache.sage('Verbindung getrennt.'); screen.refresh(); } });
      } else {
        items.push({ label: 'Mit dem Meister verbinden', hint: 'Code und Namen eingeben', onSelect: () => verbinde() });
      }
      items.push({ label: 'Post versenden', hint: verbunden ? 'an Meister oder Mitspieler' : 'zuerst verbinden', onSelect: () => screen.push(versendenScreen()) });
      items.push({ label: `Mein Posteingang, ${liste.length}`, hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) });
      return menuScreen({
        title: 'Meisterpost',
        subtitle: verbunden ? 'Verbunden. Post versenden oder Posteingang. Escape zurück.' : 'Nicht verbunden. Oben verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(post.istVerbunden() ? 'Meisterpost. Verbunden.' : 'Meisterpost. Nicht verbunden.'); },
  };
}
