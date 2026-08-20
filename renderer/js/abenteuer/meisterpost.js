/**
 * Skularistool — Abenteuertisch (Spieler): Meisterpost (seit 1.20 auf Abruf).
 *
 * Die Post laeuft nicht mehr als Push ueber den Datenkanal, sondern als Ablage
 * auf ntfy (accountlos): Der Absender legt die Nachricht unter dem Tisch-Code
 * plus Empfaengername (oder "alle") online ab, der Empfaenger holt sie AKTIV mit
 * Strg B ab. Post kommt also nur an, wenn man danach fragt — kein flatternder
 * Kanal mehr, der Absender darf laengst offline sein. Nachrichten halten dort
 * rund 12 Stunden. Pop-ups gibt es seit 1.20 nicht mehr.
 *
 * Der PeerJS-Datenkanal bleibt fuer Spielerliste, Wuerfelprotokoll und den
 * Herzschlag bestehen; die Verbindung (Radio und Post) haengt am Abenteuertisch
 * und endet mit ihm (Modul-Registry).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';
import * as sitzung from '../net/sitzung.js';
import { comboText } from '../shortcuts.js';

const ipc = window.skularis?.ipc;

let _mitspieler = [];
let _eigenerName = '';

/** Datum und Uhrzeit einer Nachricht lesbar (oder leer). */
function zeitText(m) { try { return (m && m.zeit) ? new Date(m.zeit).toLocaleString('de-DE') : ''; } catch { return ''; } }

// --- Gesehen-Gedaechtnis (verhindert Doppel-Zustellung ueber Neustarts) ---

function gesehen(a) { a.postGesehen = Array.isArray(a.postGesehen) ? a.postGesehen : []; return a.postGesehen; }
function merkeGesehen(a, id) {
  if (!id) return;
  const g = gesehen(a);
  if (!g.includes(id)) { g.push(id); if (g.length > 300) g.splice(0, g.length - 300); }
}

/** Post-Callbacks fuer die Spieler-Verbindung (Mitspielerliste, Verbindungslage). */
export function postCallbacks() {
  return {
    onVerbunden: () => { sprache.sage('Mit dem Meister verbunden.'); try { screen.refresh(); } catch { /* egal */ } },
    onGetrennt: () => { sprache.sage('Verbindung zum Meister getrennt.'); },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerListe: (namen) => { _mitspieler = (namen || []).filter(n => n !== _eigenerName); },
    onReconnectStart: () => { sprache.sage('Verbindung zum Meister verloren. Ich versuche, wieder zu verbinden.'); },
    onReconnectErfolg: () => { sprache.sage('Wieder mit dem Meister verbunden.'); },
    onAufgegeben: () => { sprache.sage(`Wiederverbinden aufgegeben. ${comboText('ab_reconnect') || 'Strg R'} verbindet neu.`); },
  };
}

/** Vorschlagsname fuer die Post (der Charaktername). */
export function vorschlagName() { const a = getAbenteuer(); return (a && a.charakter && a.charakter.name) || ''; }

/**
 * Die Spieler-Sitzung (Post UND Radio) unter EINEM Code aufbauen. Wird beim
 * Oeffnen des Abenteuers, ueber F12 und von Strg R (Reconnect) genutzt.
 */
export function verbindeSitzung(code, name, radioCb) {
  _eigenerName = String(name || '').trim() || 'Spieler';
  return sitzung.verbindeSpieler(String(code || '').trim(), _eigenerName, postCallbacks(),
    radioCb || {
      onVerbunden: () => { sprache.sage('Ton des Meisters verbunden.'); },
      onAufgegeben: () => { sprache.sage(`Wiederverbinden aufgegeben. ${comboText('ab_reconnect') || 'Strg R'} verbindet neu.`); },
    });
}

async function verbinde() {
  const code = await textDialog({ titel: 'Verbinden', label: 'Code vom Meister eingeben (Radio und Post)' });
  if (code === null || !code.trim()) return;
  const name = await textDialog({ titel: 'Dein Name', label: 'Dein Name, wie dein Charakter heißt', wert: vorschlagName() });
  if (name === null || !name.trim()) return;
  verbindeSitzung(code.trim(), name.trim());
  sprache.sage('Verbinde …');
}

// --- Senden (Ablage auf ntfy) --------------------------------------------

/** Der Tisch-Code fuer die Post-Ablage (aus der laufenden Sitzung). */
function tischCode() { return sitzung.code() || ''; }

/** Eigener Name fuer Abruf und Absender. */
function eigenerName() { return _eigenerName || vorschlagName() || 'Spieler'; }

async function schreibeInhalt(ziel) {
  const code = tischCode();
  if (!code) { sprache.sage('Nicht verbunden. Erst mit dem Tisch-Code verbinden.'); return; }
  const zielName = ziel === '*' ? 'alle' : ziel;
  const text = await textDialog({ titel: `Post an ${zielName}`, label: 'Nachricht schreiben. Post bleibt etwa 12 Stunden abrufbar.', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  const daten = { von: eigenerName(), an: zielName, text: text.trim(), zeit: Date.now() };
  const r = await ipc.postSenden(code, ziel === '*' ? 'alle' : ziel, daten);
  if (r && r.ok) {
    const a = getAbenteuer();
    a.postAusgang = a.postAusgang || [];
    a.postAusgang.unshift({ an: zielName, text: daten.text, zeit: daten.zeit });
    // Eigene Rundpost sofort als gesehen markieren, sonst holt man sie sich
    // beim naechsten Abruf selbst ab.
    merkeGesehen(a, r.id);
    speichere();
    sounds.playSpeichern(); screen.pop();
    sprache.sage(`Post an ${zielName} abgelegt. Der Empfänger holt sie mit ${comboText('ab_postabruf') || 'Strg B'} ab.`);
  } else {
    sprache.sage(`Nicht gesendet. ${r && r.fehler ? r.fehler : 'Keine Verbindung ins Internet?'}`);
  }
}

/** Empfaengerliste: Meister, alle, dazu Mitspieler (live verbundene UND die im
 *  Abenteuer gespeicherten — senden geht auch an Offline-Spieler). */
function empfaengerListe() {
  const a = getAbenteuer();
  const namen = new Set(_mitspieler);
  for (const m of ((a && a.mitspieler) || [])) { if (m && m.name) namen.add(m.name); }
  namen.delete(eigenerName());
  return [...namen];
}

function zieleScreen() {
  return {
    title: 'Post senden',
    build() {
      const code = tischCode();
      if (!code) return menuScreen({ title: 'Post senden', subtitle: 'Zuerst verbinden. Escape zurück.', items: [], leer: 'Nicht verbunden.' }).build();
      const items = [
        { label: 'An alle', hint: 'für Meister und alle Mitspieler abrufbar', onSelect: () => schreibeInhalt('*') },
        { label: 'Meister', hint: 'nur für den Meister', onSelect: () => schreibeInhalt('Meister') },
      ];
      for (const n of empfaengerListe()) items.push({ label: n, hint: 'an diesen Mitspieler, auch wenn er gerade offline ist', onSelect: () => schreibeInhalt(n) });
      return menuScreen({ title: 'Post senden', subtitle: 'Erst An alle, dann die Einzelziele. Enter öffnet das Textfeld. Escape zurück.', items }).build();
    },
    onShow() { sprache.sage('Post senden. An wen?'); },
  };
}

// --- Abruf (Strg B) -------------------------------------------------------

let _letzterAbruf = 0;

/** Post aktiv abrufen: eigener Name plus "alle" unter dem Tisch-Code. */
export async function postAbrufen() {
  const a = getAbenteuer();
  if (!a) return;
  if (Date.now() - _letzterAbruf < 2000) { sounds.playGrenze(); return; }
  _letzterAbruf = Date.now();
  const code = tischCode();
  if (!code) { sprache.sage('Nicht verbunden. Erst mit dem Tisch-Code verbinden.'); return; }
  sprache.sage('Rufe Post ab.');
  const ich = eigenerName();
  const [r1, r2] = await Promise.all([ipc.postAbrufen(code, ich), ipc.postAbrufen(code, 'alle')]);
  if ((!r1 || !r1.ok) && (!r2 || !r2.ok)) {
    sprache.sage(`Abruf fehlgeschlagen. ${(r1 && r1.fehler) || (r2 && r2.fehler) || 'Keine Verbindung ins Internet?'}`);
    return;
  }
  const alle = [...((r1 && r1.nachrichten) || []), ...((r2 && r2.nachrichten) || [])];
  const g = gesehen(a);
  const neu = [];
  for (const n of alle) {
    if (!n || !n.id || g.includes(n.id)) continue;
    if (n.daten && n.daten.von === ich) { merkeGesehen(a, n.id); continue; } // eigene Rundpost
    merkeGesehen(a, n.id);
    neu.push(n);
  }
  neu.sort((x, y) => (x.zeit || 0) - (y.zeit || 0));
  a.posteingang = a.posteingang || [];
  for (const n of neu) {
    a.posteingang.unshift({ id: n.id, von: (n.daten && n.daten.von) || 'Unbekannt', text: String((n.daten && n.daten.text) || ''), zeit: (n.daten && n.daten.zeit) || n.zeit, gelesen: false });
  }
  speichere();
  if (!neu.length) { sprache.sage('Keine neue Post.'); return; }
  sounds.playPost();
  const absender = [...new Set(neu.map(n => (n.daten && n.daten.von) || 'Unbekannt'))];
  sprache.sage(`${neu.length === 1 ? 'Eine neue Nachricht' : `${neu.length} neue Nachrichten`}. Von ${absender.join(', ')}. Im Posteingang.`);
  try { screen.refresh(); } catch { /* egal */ }
}

// --- Posteingang / Postausgang -------------------------------------------

function nachrichtMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getAbenteuer();
      const m = (a.posteingang || [])[index];
      if (!m) { screen.pop(); return document.createElement('div'); }
      m.gelesen = true;
      const z = zeitText(m);
      this.title = `Post von ${m.von}${z ? ', ' + z : ''}`;
      const verschiebe = (typ, wort) => async () => {
        a.journal = a.journal || [];
        a.journal.push({ typ, titel: `Post von ${m.von}`, inhalt: m.text, spieltag: a.spieltag || 1 });
        a.posteingang.splice(index, 1);
        await speichere(); screen.pop(); sprache.sage(`In ${wort} verschoben.`);
      };
      const items = [
        // Nachrichtentext als ERSTE, fokussierte Zeile — sofort auffindbar und vorlesbar.
        { label: m.text || 'Kein Text.', hint: `Post von ${m.von}${z ? ', ' + z : ''}`, detail: `Post von ${m.von}${z ? ', ' + z : ''}. ${m.text || 'Kein Text.'}`, onSelect: () => sprache.sage(m.text || 'Kein Text.') },
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeInhalt(m.von) },
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
      const items = liste.map((m, i) => { const z = zeitText(m); return {
        label: `Post von ${m.von}${z ? ', ' + z : ''}`,
        detail: `Post von ${m.von}${z ? ', ' + z : ''}. ${m.text}`,
        hint: 'öffnen: Text lesen, antworten, verschieben, löschen',
        onSelect: () => screen.push(nachrichtMenuScreen(i)),
      }; });
      return menuScreen({ title: 'Posteingang', subtitle: 'Shift und Pfeil-runter liest die Nachricht, Enter öffnet sie. Escape zurück.', items, leer: 'Noch keine Post. Neue Post holst du oben mit Post abrufen.' }).build();
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
      const verbunden = sitzung.aktiv();
      const abrufTaste = comboText('ab_postabruf') || 'Strg B';
      const items = [
        { label: 'Post abrufen', taste: abrufTaste, hint: 'holt neue Post für dich und für alle', onSelect: () => postAbrufen() },
        { label: 'Post senden', hint: verbunden ? 'Nachricht online ablegen, Empfänger ruft sie ab' : 'zuerst verbinden', onSelect: () => screen.push(zieleScreen()) },
        { label: 'Posteingang', hint: 'abgerufene Nachrichten', onSelect: () => screen.push(posteingangScreen()) },
        { label: 'Postausgang', hint: 'was du gesendet hast', onSelect: () => screen.push(postausgangScreen()) },
      ];
      // Verbinden ganz unten (braucht man nur einmal).
      if (verbunden) items.push({ label: 'Verbindung trennen', hint: 'Post und Radio zum Meister beenden', onSelect: () => { sitzung.trenne(); sprache.sage('Verbindung getrennt.'); screen.refresh(); } });
      else items.push({ label: 'Mit dem Meister verbinden', hint: 'Code und Namen eingeben', onSelect: () => verbinde() });
      return menuScreen({
        title: 'Meisterpost',
        subtitle: verbunden ? `Verbunden. Post kommt nur auf Abruf (${abrufTaste}). Escape zurück.` : 'Nicht verbunden. Unten verbinden. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage(sitzung.aktiv() ? 'Meisterpost. Verbunden.' : 'Meisterpost. Nicht verbunden.'); },
  };
}
