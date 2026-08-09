/**
 * Skularistool — Abenteuertisch (Spieler): Meisterpost.
 *
 * Aufbau: oben Post senden (Nachricht oder Pop-up), darunter Posteingang und
 * Postausgang, ganz unten Verbinden (braucht man nur einmal). Nachrichten landen
 * im Posteingang; ein Pop-up geht beim Empfaenger sofort als Fenster auf (Ton, Text,
 * OK) und wird NICHT gespeichert. Eingegangene Post laesst sich ins Notizbuch oder
 * Tagebuch verschieben. Beim Verbinden und bei jeder F2-Aenderung wird der
 * Charakterstatus an den Meister uebertragen (status-sync.js).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';
import * as post from '../net/post.js';
import { sammleStatus } from './status-sync.js';

let _mitspieler = [];
let _eigenerName = '';
let _popupOffen = false; // nur EIN Pop-up-Fenster gleichzeitig (kein Spam-Stapel)

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }

/** Ein eingehendes Pop-up: sofort ein Fenster mit dem Text und OK. Nichts speichern. */
function zeigePopup(von, text) {
  if (_popupOffen) return; // ein neues Pop-up waehrend eines offenen wird verworfen
  _popupOffen = true;
  sounds.playPopup();
  sprache.sage(`Pop-up von ${von}. ${text || 'Kein Text.'}`);
  knopfDialog({ titel: `Pop-up von ${von}`, frage: text || '(kein Text)', knoepfe: [{ label: 'OK', wert: 'ok' }] })
    .then(() => { _popupOffen = false; })
    .catch(() => { _popupOffen = false; });
}

/** Eingehende Nachricht (kein Pop-up) ablegen, Ton und kurze Ansage. */
function empfangePost(m) {
  if (m && m.typ === 'popup') { zeigePopup(m.von || 'Meister', String(m.text || '')); return; }
  const a = getAbenteuer();
  if (!a) return;
  const eintrag = { id: m.id, von: m.von || 'Meister', text: String(m.text || ''), zeit: m.zeit || Date.now(), gelesen: false };
  a.posteingang = a.posteingang || [];
  if (m.id && a.posteingang.some(x => x.id === m.id)) return;
  a.posteingang.unshift(eintrag);
  speichere();
  sounds.playPost();
  sprache.sage(`Neue Post von ${eintrag.von}.`);
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
    onVerbunden: () => { sprache.sage('Mit dem Meister verbunden.'); try { post.spielerStatus(sammleStatus(getAbenteuer())); } catch { /* egal */ } screen.refresh(); },
    onGetrennt: () => { sprache.sage('Verbindung zum Meister getrennt.'); },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerListe: (namen) => { _mitspieler = (namen || []).filter(n => n !== _eigenerName); },
    onNachricht: (m) => empfangePost(m),
    onReconnectStart: () => { sprache.sage('Verbindung zum Meister verloren. Ich versuche, wieder zu verbinden.'); },
    onReconnectErfolg: () => { try { post.spielerStatus(sammleStatus(getAbenteuer())); } catch { /* egal */ } sprache.sage('Wieder mit dem Meister verbunden.'); },
    onAufgegeben: () => { sprache.sage('Wiederverbinden aufgegeben. Bitte bei Bedarf neu verbinden.'); },
  });
  sprache.sage('Verbinde …');
}

async function schreibeInhalt(ziel, typ) {
  const zielName = ziel === '*' ? 'alle' : ziel;
  const wort = typ === 'popup' ? 'Pop-up' : 'Post';
  const text = await textDialog({ titel: `${wort} an ${zielName}`, label: 'Nachricht schreiben', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  if (post.spielerSende(ziel, text.trim(), typ)) {
    if (typ !== 'popup') { // Pop-ups werden nirgends gesammelt
      const a = getAbenteuer();
      a.postAusgang = a.postAusgang || [];
      a.postAusgang.unshift({ an: zielName, text: text.trim(), zeit: Date.now() });
      speichere();
    }
    sounds.playSpeichern(); screen.pop(); sprache.sage(`${wort} an ${zielName} gesendet.`);
  } else sprache.sage('Nicht gesendet. Keine Verbindung.');
}

function zieleScreen(typ) {
  const wort = typ === 'popup' ? 'Pop-up senden' : 'Nachricht senden';
  return {
    title: wort,
    build() {
      if (!post.istVerbunden()) return menuScreen({ title: wort, subtitle: 'Zuerst verbinden. Escape zurück.', items: [], leer: 'Nicht verbunden.' }).build();
      const items = [
        { label: 'An alle', hint: 'an Meister und alle Mitspieler', onSelect: () => schreibeInhalt('*', typ) },
        { label: 'Meister', hint: 'nur an den Meister', onSelect: () => schreibeInhalt('Meister', typ) },
      ];
      for (const n of _mitspieler) items.push({ label: n, hint: 'an diesen Mitspieler', onSelect: () => schreibeInhalt(n, typ) });
      return menuScreen({ title: wort, subtitle: 'Erst An alle, dann die Einzelziele. Enter öffnet das Textfeld. Escape zurück.', items }).build();
    },
    onShow() { sprache.sage(`${wort}. An wen?`); },
  };
}

function sendenScreen() {
  return {
    title: 'Post senden',
    build() {
      return menuScreen({
        title: 'Post senden',
        subtitle: 'Nachricht landet im Posteingang; ein Pop-up geht beim Empfänger sofort auf. Escape zurück.',
        items: [
          { label: 'Nachricht senden', hint: 'landet im Posteingang des Ziels', onSelect: () => screen.push(zieleScreen('msg')) },
          { label: 'Pop-up senden', hint: 'öffnet beim Empfänger sofort ein Fenster', onSelect: () => screen.push(zieleScreen('popup')) },
        ],
      }).build();
    },
    onShow() { sprache.sage('Post senden. Nachricht oder Pop-up?'); },
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
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeInhalt(m.von, 'msg') },
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
    title: 'Posteingang',
    build() {
      const a = getAbenteuer();
      const liste = a.posteingang || [];
      const items = liste.map((m, i) => ({
        label: `Post von ${m.von}`,
        detail: `Post von ${m.von}. ${m.text}`,
        hint: 'öffnen: vorlesen, antworten, verschieben, löschen',
        onSelect: () => screen.push(nachrichtMenuScreen(i)),
      }));
      return menuScreen({ title: 'Posteingang', subtitle: 'Shift und Pfeil-runter liest die Nachricht, Enter öffnet sie. Escape zurück.', items, leer: 'Noch keine Post.' }).build();
    },
    onShow() { sprache.sage('Posteingang.'); },
  };
}

function postausgangScreen() {
  return {
    title: 'Postausgang',
    build() {
      const a = getAbenteuer();
      const liste = a.postAusgang || [];
      const items = liste.map((m, i) => ({
        label: `An ${m.an}`,
        detail: `An ${m.an}. ${m.text}`,
        hint: 'öffnen: vorlesen, löschen',
        onSelect: () => screen.push({
          title: `An ${m.an}`,
          build() {
            return menuScreen({
              title: `An ${m.an}`, subtitle: 'Escape zurück.',
              items: [
                { label: 'Vorlesen', onSelect: () => sprache.sage(`An ${m.an}. ${m.text}`) },
                { label: 'Löschen', onSelect: async () => { a.postAusgang.splice(i, 1); await speichere(); screen.pop(); sprache.sage('Gelöscht.'); } },
              ],
            }).build();
          },
        }),
      }));
      return menuScreen({ title: 'Postausgang', subtitle: 'Was du gesendet hast. Shift und Pfeil-runter liest den Text. Escape zurück.', items, leer: 'Noch nichts gesendet.' }).build();
    },
    onShow() { sprache.sage('Postausgang.'); },
  };
}

export function meisterpostScreen() {
  return {
    title: 'Meisterpost',
    build() {
      const verbunden = post.istVerbunden();
      const items = [
        { label: 'Post senden', hint: verbunden ? 'Nachricht oder Pop-up' : 'zuerst verbinden', onSelect: () => screen.push(sendenScreen()) },
        { label: 'Posteingang', hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) },
        { label: 'Postausgang', hint: 'was du gesendet hast', onSelect: () => screen.push(postausgangScreen()) },
      ];
      // Verbinden ganz unten (braucht man nur einmal).
      if (verbunden) items.push({ label: 'Verbindung trennen', hint: 'die Post-Verbindung zum Meister beenden', onSelect: () => { post.stopp(); sprache.sage('Verbindung getrennt.'); screen.refresh(); } });
      else items.push({ label: 'Mit dem Meister verbinden', hint: 'Code und Namen eingeben', onSelect: () => verbinde() });
      return menuScreen({
        title: 'Meisterpost',
        subtitle: verbunden ? 'Verbunden. Post senden, Posteingang, Postausgang. Escape zurück.' : 'Nicht verbunden. Unten verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(post.istVerbunden() ? 'Meisterpost. Verbunden.' : 'Meisterpost. Nicht verbunden.'); },
  };
}
