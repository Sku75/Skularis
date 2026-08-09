/**
 * Skularistool — Meistertisch: Postkasten (Meisterpost).
 *
 * Der Meister startet die Post-Verbindung unter einem Code. Danach:
 *  - Nachricht senden: an alle oder ein Einzelziel, dann Text -> Posteingang des Ziels.
 *  - Pop-up auslösen: wie senden, löst beim Empfänger sofort ein Pop-up mit Ton aus.
 *  - Verlauf: Kopien aller gesendeten und empfangenen Nachrichten.
 *  - Posteingang: eingegangene Nachrichten (antworten, löschen, in Notizen ablegen).
 * Zusätzlich empfängt er die F2-Live-Werte der Spieler (nur Meldung hier; angezeigt
 * werden sie in der Charakteransicht).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { getMeister, speichere } from './state.js';
import { generiereSchluessel } from '../net/radio.js';
import * as post from '../net/post.js';

let _code = '';
const _letzterStatus = new Map(); // name -> werte (fuer die Aenderungs-Ansage)

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }

function verlaufEintrag(a, richtung, wer, text, typ) {
  a.postVerlauf = a.postVerlauf || [];
  a.postVerlauf.unshift({ richtung, wer, text, zeit: Date.now(), typ });
}

function empfangePost(m) {
  const a = getMeister();
  if (!a) return;
  const typ = m.typ === 'popup' ? 'popup' : 'msg';
  const eintrag = { id: m.id, von: m.von || 'Spieler', text: String(m.text || ''), zeit: m.zeit || Date.now(), typ, gelesen: false };
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

/** Nur die geänderten F2-Werte ansagen (gebündelt), damit es kein Dauerfeuer wird. */
function statusAenderung(name, werte) {
  const alt = _letzterStatus.get(name) || {};
  const teile = [];
  const az = (k) => (werte[k] && typeof werte[k].aktuell === 'number') ? werte[k].aktuell : null;
  const azAlt = (k) => (alt[k] && typeof alt[k].aktuell === 'number') ? alt[k].aktuell : null;
  const feld = (k, wort) => { const n = az(k); if (n !== null && n !== azAlt(k)) teile.push(`${wort} ${n}`); };
  feld('Wunden', 'Wunden'); feld('Erschoepfung', 'Erschöpfung'); feld('SchiP', 'Schicksalspunkte');
  feld('AsP', 'Astralpunkte'); feld('KaP', 'Karmapunkte'); feld('GuP', 'Gunstpunkte');
  feld('AstralspeicherStab', 'Astralspeicher');
  _letzterStatus.set(name, werte);
  if (teile.length) { sounds.playBing(); sprache.sage(`${name}: ${teile.join(', ')}.`); }
}

function starteVerbindung() {
  _code = generiereSchluessel();
  post.starteMeisterPost(_code, {
    onBereit: () => { sprache.sage(`Post-Verbindung bereit. Code ${_code.split('').join(' ')}.`); screen.refresh(); },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerNeu: (name) => { sounds.playPost(); sprache.sage(`${name} ist mit der Post verbunden.`); },
    onSpielerWeg: (name) => { sprache.sage(`${name} hat die Post-Verbindung verlassen.`); },
    onNachricht: (m) => empfangePost(m),
    onStatus: (name, werte) => statusAenderung(name, werte),
  });
}

async function schreibeInhalt(ziel, typ) {
  const zielName = ziel === '*' ? 'alle' : ziel;
  const wort = typ === 'popup' ? 'Pop-up' : 'Post';
  const text = await textDialog({ titel: `${wort} an ${zielName}`, label: 'Nachricht schreiben', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  if (post.meisterSende(ziel, text.trim(), typ)) {
    verlaufEintrag(getMeister(), 'aus', zielName, text.trim(), typ);
    speichere();
    sounds.playSpeichern(); screen.pop(); sprache.sage(`${wort} an ${zielName} gesendet.`);
  } else sprache.sage('Nicht gesendet. Kein passender Spieler verbunden.');
}

function zieleScreen(typ) {
  const wort = typ === 'popup' ? 'Pop-up auslösen' : 'Nachricht senden';
  return {
    title: wort,
    build() {
      const namen = post.verbundeneSpieler();
      const items = [{ label: 'An alle', hint: 'an alle verbundenen Spieler', onSelect: () => schreibeInhalt('*', typ) }];
      for (const n of namen) items.push({ label: n, hint: 'an diesen Spieler', onSelect: () => schreibeInhalt(n, typ) });
      return menuScreen({ title: wort, subtitle: 'Erst An alle, dann die Einzelziele. Enter öffnet das Textfeld. Escape zurück.', items, leer: 'Kein Spieler verbunden.' }).build();
    },
    onShow() { sprache.sage(`${wort}. An wen?`); },
  };
}

function verlaufScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
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
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeInhalt(m.von, 'msg') },
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
        label: `Post von ${m.von}${m.typ === 'popup' ? ' (Pop-up)' : ''}: ${kurz(m.text)}`,
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
        items.push({ label: `Verbundene Spieler, ${post.verbundeneSpieler().length}`, hint: 'wer gerade verbunden ist', onSelect: () => sprache.sage(post.verbundeneSpieler().length ? ('Verbunden: ' + post.verbundeneSpieler().join(', ') + '.') : 'Niemand verbunden.') });
      } else {
        items.push({ label: 'Post-Verbindung starten', hint: 'einen Code erzeugen, den die Spieler eingeben', onSelect: () => starteVerbindung() });
      }
      items.push({ label: 'Nachricht senden', hint: aktiv ? 'an alle oder einen Spieler' : 'zuerst Verbindung starten', onSelect: () => screen.push(zieleScreen('msg')) });
      items.push({ label: 'Pop-up auslösen', hint: aktiv ? 'löst beim Empfänger ein Pop-up aus' : 'zuerst Verbindung starten', onSelect: () => screen.push(zieleScreen('popup')) });
      items.push({ label: 'Verlauf', hint: 'Kopien aller Nachrichten', onSelect: () => screen.push(verlaufScreen()) });
      items.push({ label: `Posteingang, ${liste.length}`, hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) });
      return menuScreen({
        title: 'Postkasten',
        subtitle: aktiv ? 'Verbindung läuft. Senden, Pop-up, Verlauf, Posteingang. Escape zurück.' : 'Verbindung starten, dann können die Spieler mit dem Code verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(post.istAktiv() ? 'Postkasten. Verbindung läuft.' : 'Postkasten. Verbindung noch nicht gestartet.'); },
  };
}
