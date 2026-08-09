/**
 * Skularistool — Abenteuertisch (Spieler): Meisterpost.
 *
 * Verbinden mit Code + Namen (net/post.js). Danach:
 *  - Nachricht senden: an alle oder ein Einzelziel, dann Text -> Posteingang des Ziels.
 *  - Pop-up auslösen: wie senden, löst beim Empfänger sofort ein Pop-up mit Ton aus.
 *  - Verlauf: Kopien aller gesendeten und empfangenen Nachrichten.
 *  - Mein Posteingang: eingegangene Nachrichten (antworten, löschen, verschieben).
 * Beim Verbinden und bei jeder F2-Änderung wird der Charakterstatus an den Meister
 * übertragen (status-sync.js).
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

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }

function verlaufEintrag(a, richtung, wer, text, typ) {
  a.postVerlauf = a.postVerlauf || [];
  a.postVerlauf.unshift({ richtung, wer, text, zeit: Date.now(), typ });
}

/** Eingehende Post/Pop-up ablegen, Ton und Ansage (kein Fokuswechsel). */
function empfangePost(m) {
  const a = getAbenteuer();
  if (!a) return;
  const typ = m.typ === 'popup' ? 'popup' : 'msg';
  const eintrag = { id: m.id, von: m.von || 'Meister', text: String(m.text || ''), zeit: m.zeit || Date.now(), typ, gelesen: false };
  verlaufEintrag(a, 'ein', eintrag.von, eintrag.text, typ);
  a.posteingang = a.posteingang || [];
  if (!(m.id && a.posteingang.some(x => x.id === m.id))) a.posteingang.unshift(eintrag);
  speichere();
  if (typ === 'popup') { sounds.playPopup(); zeigePopup(eintrag.von, eintrag.text); }
  else { sounds.playPost(); sprache.sage(`Neue Post von ${eintrag.von}.`); }
}

function zeigePopup(von, text) {
  knopfDialog({ titel: `Pop-up von ${von}`, frage: 'Annehmen?', knoepfe: [{ label: 'Annehmen', wert: 'ja' }, { label: 'Ablehnen', wert: 'nein' }] })
    .then((w) => { if (w === 'ja') sprache.sage(`Pop-up von ${von}. ${text || 'Kein Text.'}`); });
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
    // Auto-Reconnect (sparsame Ansagen); bei Erfolg den F2-Stand neu senden.
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
    verlaufEintrag(getAbenteuer(), 'aus', zielName, text.trim(), typ);
    speichere();
    sounds.playSpeichern(); screen.pop(); sprache.sage(`${wort} an ${zielName} gesendet.`);
  } else sprache.sage('Nicht gesendet. Keine Verbindung.');
}

function zieleScreen(typ) {
  const wort = typ === 'popup' ? 'Pop-up auslösen' : 'Nachricht senden';
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

function verlaufScreen() {
  return {
    title: '',
    build() {
      const a = getAbenteuer();
      const v = a.postVerlauf || [];
      this.title = `Verlauf, ${v.length}`;
      const items = v.map((e) => {
        const kopf = e.richtung === 'aus' ? `An ${e.wer}` : `Von ${e.wer}`;
        const art = e.typ === 'popup' ? ' (Pop-up)' : '';
        return { label: `${kopf}${art}: ${kurz(e.text)}`, detail: `${kopf}. ${e.text}`, onSelect: () => sprache.sage(`${kopf}. ${e.text}`) };
      });
      return menuScreen({ title: this.title, subtitle: 'Kopien aller gesendeten und empfangenen Nachrichten. Escape zurück.', items, leer: 'Noch nichts.' }).build();
    },
    onShow() { sprache.sage('Verlauf.'); },
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
    title: '',
    build() {
      const a = getAbenteuer();
      const liste = a.posteingang || [];
      this.title = `Mein Posteingang, ${liste.length}`;
      const items = liste.map((m, i) => ({
        label: `Post von ${m.von}${m.typ === 'popup' ? ' (Pop-up)' : ''}: ${kurz(m.text)}`,
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
      if (verbunden) items.push({ label: 'Verbindung trennen', hint: 'die Post-Verbindung zum Meister beenden', onSelect: () => { post.stopp(); sprache.sage('Verbindung getrennt.'); screen.refresh(); } });
      else items.push({ label: 'Mit dem Meister verbinden', hint: 'Code und Namen eingeben', onSelect: () => verbinde() });
      items.push({ label: 'Nachricht senden', hint: verbunden ? 'an alle oder ein Ziel' : 'zuerst verbinden', onSelect: () => screen.push(zieleScreen('msg')) });
      items.push({ label: 'Pop-up auslösen', hint: verbunden ? 'löst beim Empfänger ein Pop-up aus' : 'zuerst verbinden', onSelect: () => screen.push(zieleScreen('popup')) });
      items.push({ label: 'Verlauf', hint: 'Kopien aller Nachrichten', onSelect: () => screen.push(verlaufScreen()) });
      items.push({ label: `Mein Posteingang, ${liste.length}`, hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) });
      return menuScreen({
        title: 'Meisterpost',
        subtitle: verbunden ? 'Verbunden. Nachricht senden, Pop-up, Verlauf, Posteingang. Escape zurück.' : 'Nicht verbunden. Oben verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(post.istVerbunden() ? 'Meisterpost. Verbunden.' : 'Meisterpost. Nicht verbunden.'); },
  };
}
