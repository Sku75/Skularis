/**
 * Skularistool — Meistertisch F5: Post, Notizen und Ablageregal.
 *
 * Seit 1.20 laeuft die Post auf ABRUF: Nachrichten werden unter dem Tisch-Code
 * plus Empfaengername (oder "alle") accountlos auf ntfy abgelegt; der Meister
 * holt seine Post aktiv mit Strg B. Pop-ups und die F2-Live-Uebertragung der
 * Spielerwerte sind entfernt (Nutzer-Entscheidung 1.20) — der Meister nutzt
 * seine eigenen Zaehler und die Bogenwerte. Der PeerJS-Datenkanal bleibt fuer
 * Spielerliste, Wuerfelprotokoll und Herzschlag bestehen.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { getMeister, speichere } from './state.js';
import * as post from '../net/post.js';
import * as sitzung from '../net/sitzung.js';
import { diag } from '../core/diag.js';
import { comboText } from '../shortcuts.js';

const ipc = window.skularis?.ipc;

let _code = '';

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }
/** Datum und Uhrzeit einer Nachricht lesbar (oder leer). */
function zeitText(m) { try { return (m && m.zeit) ? new Date(m.zeit).toLocaleString('de-DE') : ''; } catch { return ''; } }

// --- Gesehen-Gedaechtnis und Abruf (seit 1.20) ---------------------------

function gesehen(a) { a.postGesehen = Array.isArray(a.postGesehen) ? a.postGesehen : []; return a.postGesehen; }
function merkeGesehen(a, id) {
  if (!id) return;
  const g = gesehen(a);
  if (!g.includes(id)) { g.push(id); if (g.length > 300) g.splice(0, g.length - 300); }
}

let _letzterAbruf = 0;

/** Post aktiv abrufen (Strg B): Topics "meister" und "alle" unter dem Tisch-Code. */
export async function postAbrufen() {
  const a = getMeister();
  if (!a) return;
  if (Date.now() - _letzterAbruf < 2000) { sounds.playGrenze(); return; }
  _letzterAbruf = Date.now();
  const code = sitzung.code() || sitzung.meisterCode();
  if (!code) { sprache.sage('Kein Tisch-Code vorhanden.'); return; }
  sprache.sage('Rufe Post ab.');
  const [r1, r2] = await Promise.all([ipc.postAbrufen(code, 'Meister'), ipc.postAbrufen(code, 'alle')]);
  if ((!r1 || !r1.ok) && (!r2 || !r2.ok)) {
    sprache.sage(`Abruf fehlgeschlagen. ${(r1 && r1.fehler) || (r2 && r2.fehler) || 'Keine Verbindung ins Internet?'}`);
    return;
  }
  const alle = [...((r1 && r1.nachrichten) || []), ...((r2 && r2.nachrichten) || [])];
  const g = gesehen(a);
  const neu = [];
  for (const n of alle) {
    if (!n || !n.id || g.includes(n.id)) continue;
    if (n.daten && n.daten.von === 'Meister') { merkeGesehen(a, n.id); continue; } // eigene Rundpost
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

// Live-Hook: ein offener "Meine Initiativephase"-Bildschirm meldet sich hier an und
// wird bei einer echten Werteänderung des Spielers sofort neu gezeichnet (Task 147).
let _liveHook = null;
export function setLiveHook(fn) { _liveHook = fn || null; }

// --- An-/Abmelde-Meldungen: komplett still -------------------------------
// Wunsch: KEINE Connect-/Disconnect-Ansagen mehr am Meistertisch (sie spammen und
// tragen keine verlässliche Info). Wer verbunden ist, sieht der Meister auf Abruf im
// Verbinden-Menü unter "Verbundene Spieler". Hier nur noch der stille Mitschnitt.
function meldeConnect(name) { diag(`Connect: ${name}`); }
function meldeDisconnect(name) { diag(`Disconnect: ${name}`); }

// --- Verbindung ----------------------------------------------------------

/** Meister-Post-Callbacks (Nachrichten, Spieler-An/-Abmeldung, F2-Status). Werden vom
 *  Verbinden-Knopf UND vom Radio-Start (audio-bereich) genutzt, damit die Post mit
 *  denselben Callbacks laeuft, egal was zuerst gestartet wird. */
export function postCallbacks() {
  return {
    onBereit: () => { _code = sitzung.code() || _code; sprache.sage(`Verbindung bereit. Code ${String(_code || '').split('').join(' ')}.`); try { screen.refresh(); } catch { /* egal */ } },
    onFehler: (t) => { sprache.sage(t); },
    onSpielerNeu: (name) => meldeConnect(name),
    onSpielerWeg: (name) => meldeDisconnect(name),
    onWurf: (name) => { if (_liveHook) { try { _liveHook(name); } catch { /* egal */ } } }, // offenes Protokoll neu zeichnen
  };
}

function starteVerbindung() {
  // Ein gemeinsamer Sitzungscode fuer Post UND Radio (sitzung.meisterCode). So hat,
  // wer den Code hat, Zugang zu beidem.
  _code = sitzung.starteMeisterPost(postCallbacks());
}

/** Code fuer den Tooltip aufbereiten: die vier Ziffern in einer Zeile, wie beim Radio. */
function codeTooltip() {
  if (!_code) return 'Noch kein Code.';
  return `Code zum Weitergeben: ${_code.split('').join(' ')}`;
}

// --- Senden --------------------------------------------------------------

async function schreibeInhalt(ziel) {
  const code = sitzung.code() || sitzung.meisterCode();
  if (!code) { sprache.sage('Kein Tisch-Code vorhanden.'); return; }
  const zielName = ziel === '*' ? 'alle' : ziel;
  const text = await textDialog({ titel: `Post an ${zielName}`, label: 'Nachricht schreiben. Post bleibt etwa 12 Stunden abrufbar.', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  const daten = { von: 'Meister', an: zielName, text: text.trim(), zeit: Date.now() };
  const r = await ipc.postSenden(code, ziel === '*' ? 'alle' : ziel, daten);
  if (r && r.ok) {
    const a = getMeister();
    a.postAusgang = a.postAusgang || [];
    a.postAusgang.unshift({ an: zielName, text: daten.text, zeit: daten.zeit });
    merkeGesehen(a, r.id); // eigene Rundpost nicht selbst wieder abholen
    speichere();
    sounds.playSpeichern(); screen.pop();
    sprache.sage(`Post an ${zielName} abgelegt. Der Empfänger holt sie mit seiner Abruf-Taste ab.`);
  } else {
    sprache.sage(`Nicht gesendet. ${r && r.fehler ? r.fehler : 'Keine Verbindung ins Internet?'}`);
  }
}

function zieleScreen() {
  return {
    title: 'Post senden',
    build() {
      const a = getMeister();
      // Empfaenger: alle, dazu die Gruppen-Charaktere (auch offline erreichbar)
      // und live verbundene Spieler, die (noch) nicht in der Gruppe stehen.
      const namen = new Set(((a && a.charaktere) || []).map(c => c.name).filter(Boolean));
      for (const n of post.verbundeneSpieler()) namen.add(n);
      const items = [{ label: 'An alle', hint: 'für alle Spieler abrufbar', onSelect: () => schreibeInhalt('*') }];
      for (const n of namen) items.push({ label: n, hint: 'an diesen Spieler, auch wenn er gerade offline ist', onSelect: () => schreibeInhalt(n) });
      return menuScreen({ title: 'Post senden', subtitle: 'Erst An alle, dann die Einzelziele. Enter öffnet das Textfeld. Escape zurück.', items, leer: 'Noch keine Helden in der Gruppe.' }).build();
    },
    onShow() { sprache.sage('Post senden. An wen?'); },
  };
}

// --- Posteingang / Postausgang / Ablage ----------------------------------

/** Post in die Notizen des Charakters (Name = Absender) ablegen. */
function inNotizen(a, von, text) {
  const v = charNotizen(a, von);
  v.unshift({ text: `Post von ${von}: ${text}`, spieltag: a.spieltag || 1 });
}

function nachrichtMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const m = (a.posteingang || [])[index];
      if (!m) { screen.pop(); return document.createElement('div'); }
      m.gelesen = true;
      const z = zeitText(m);
      this.title = `Post von ${m.von}${z ? ', ' + z : ''}`;
      const items = [
        // Der Nachrichtentext steht als ERSTE, fokussierte Zeile — sofort auffindbar
        // und vorlesbar (wie die Info-Seite). Enter liest ihn erneut vor.
        { label: m.text || 'Kein Text.', hint: `Post von ${m.von}${z ? ', ' + z : ''}`, detail: `Post von ${m.von}${z ? ', ' + z : ''}. ${m.text || 'Kein Text.'}`, onSelect: () => sprache.sage(m.text || 'Kein Text.') },
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeInhalt(m.von) },
        {
          label: 'In Ablage verschieben',
          onSelect: async () => {
            a.postAblage = a.postAblage || [];
            a.postAblage.unshift({ von: m.von, text: m.text, zeit: m.zeit || Date.now() });
            a.posteingang.splice(index, 1);
            await speichere(); screen.pop(); sprache.sage('In die Ablage verschoben.');
          },
        },
        {
          label: 'In Notizen verschieben',
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
    title: 'Posteingang',
    build() {
      const a = getMeister();
      const liste = a.posteingang || [];
      const items = liste.map((m, i) => { const z = zeitText(m); return {
        label: `Post von ${m.von}${z ? ', ' + z : ''}`,
        detail: `Post von ${m.von}${z ? ', ' + z : ''}. ${m.text}`,
        hint: 'öffnen: Text lesen, antworten, verschieben, löschen',
        onSelect: () => screen.push(nachrichtMenuScreen(i)),
      }; });
      return menuScreen({ title: 'Posteingang', subtitle: 'Shift und Pfeil-runter liest die Nachricht, Enter öffnet sie. Escape zurück.', items, leer: 'Noch keine Post.' }).build();
    },
    onShow() { sprache.sage('Posteingang.'); },
  };
}

function postausgangScreen() {
  return {
    title: 'Postausgang',
    build() {
      const a = getMeister();
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
      return menuScreen({ title: 'Postausgang', subtitle: 'Was du gesendet hast. Escape zurück.', items, leer: 'Noch nichts gesendet.' }).build();
    },
    onShow() { sprache.sage('Postausgang.'); },
  };
}

function ablageScreen() {
  return {
    title: 'Ablage',
    build() {
      const a = getMeister();
      const liste = a.postAblage || [];
      const items = liste.map((m, i) => ({
        label: `Post von ${m.von}`,
        detail: `Post von ${m.von}. ${m.text}`,
        hint: 'öffnen: vorlesen, löschen',
        onSelect: () => screen.push({
          title: `Post von ${m.von}`,
          build() {
            return menuScreen({
              title: `Post von ${m.von}`, subtitle: 'Escape zurück.',
              items: [
                { label: 'Vorlesen', onSelect: () => sprache.sage(`Post von ${m.von}. ${m.text}`) },
                { label: 'Löschen', onSelect: async () => { a.postAblage.splice(i, 1); await speichere(); screen.pop(); sprache.sage('Gelöscht.'); } },
              ],
            }).build();
          },
        }),
      }));
      return menuScreen({ title: 'Ablage', subtitle: 'Das Ablageregal für verschobene Post. Escape zurück.', items, leer: 'Ablage ist leer.' }).build();
    },
    onShow() { sprache.sage('Ablage.'); },
  };
}

// --- Notizen (je Charakter) ----------------------------------------------

function charNotizen(a, name) {
  a.charNotizen = a.charNotizen || {};
  let v = a.charNotizen[name];
  if (typeof v === 'string') v = v.trim() ? [{ text: v.trim(), spieltag: a.spieltag || 1 }] : [];
  if (!Array.isArray(v)) v = [];
  a.charNotizen[name] = v;
  return v;
}

async function bearbeiteNotiz(a, name, i) {
  const eintraege = charNotizen(a, name);
  const e = eintraege[i];
  if (!e) return;
  const w = await knopfDialog({ titel: 'Notiz', frage: e.text, knoepfe: [{ label: 'Bearbeiten', wert: 'edit' }, { label: 'Löschen', wert: 'del' }, { label: 'Zurück', wert: 'zur' }] });
  if (w === 'edit') {
    const t = await textDialog({ titel: 'Notiz bearbeiten', label: 'Notiz', wert: e.text, mehrzeilig: true });
    if (t === null) return;
    e.text = t.trim(); await speichere(); screen.refresh(); sprache.sage('Notiz geändert.');
  } else if (w === 'del') {
    eintraege.splice(i, 1); await speichere(); screen.refresh(); sprache.sage('Notiz gelöscht.');
  }
}

function charNotizScreen(name) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const eintraege = charNotizen(a, name);
      this.title = `Notizen zu ${name}`;
      const items = [
        {
          label: 'Neue Notiz', hint: 'schnell etwas zu diesem Charakter festhalten',
          onSelect: async () => {
            const t = await textDialog({ titel: `Notiz zu ${name}`, label: 'Notiz', mehrzeilig: true });
            if (t === null || !t.trim()) return;
            eintraege.unshift({ text: t.trim(), spieltag: a.spieltag || 1 });
            await speichere(); screen.refresh(); sprache.sage('Notiz gespeichert.');
          },
        },
      ];
      eintraege.forEach((e, i) => items.push({
        label: `Spieltag ${e.spieltag || 1}: ${kurz(e.text)}`,
        hint: 'Enter: bearbeiten oder löschen', detail: e.text,
        onSelect: () => bearbeiteNotiz(a, name, i),
      }));
      return menuScreen({ title: this.title, subtitle: 'Neueste oben. Escape zurück.', items, leer: 'Noch keine Notiz.' }).build();
    },
  };
}

function notizenScreen() {
  return {
    title: 'Notizen',
    build() {
      const a = getMeister();
      const items = (a.charaktere || []).map(c => ({
        label: c.name, hint: 'Notizen zu diesem Charakter',
        onSelect: () => screen.push(charNotizScreen(c.name)),
      }));
      return menuScreen({ title: 'Notizen', subtitle: 'Je Charakter. Hierhin verschiebst du auch Post. Escape zurück.', items, leer: 'Noch keine Helden in der Gruppe.' }).build();
    },
    onShow() { sprache.sage('Notizen. Wähle einen Charakter.'); },
  };
}

// --- Verbundene Spieler (Connectliste) -----------------------------------

/** Liste der aktuell verbundenen Spieler; einzeln oder alle trennen. */
function verbundeneSpielerScreen() {
  return {
    title: 'Verbundene Spieler',
    build() {
      const namen = post.verbundeneSpieler();
      const items = namen.map(n => ({
        label: n,
        hint: 'Enter: Verbindung zu diesem Spieler trennen',
        onSelect: async () => {
          if (!await jaNeinDialog({ titel: 'Trennen', frage: `Verbindung zu ${n} trennen? Der Spieler verbindet sich danach in der Regel automatisch neu.` })) return;
          post.trenneSpieler(n); sprache.sage(`${n} getrennt.`); screen.refresh();
        },
      }));
      if (namen.length > 1) {
        items.push({
          label: 'Alle trennen',
          hint: 'trennt alle Spieler (sie verbinden sich danach neu)',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Alle trennen', frage: 'Wirklich alle Spieler trennen? Sie verbinden sich danach in der Regel automatisch neu.' })) return;
            post.trenneAlleSpieler(); sprache.sage('Alle getrennt.'); screen.refresh();
          },
        });
      }
      return menuScreen({
        title: `Verbundene Spieler, ${namen.length}`,
        subtitle: 'Enter trennt die Verbindung. Escape zurück.',
        items,
        leer: 'Zurzeit ist kein Spieler verbunden.',
      }).build();
    },
    onShow() { sprache.sage('Verbundene Spieler.'); },
  };
}

// --- Hauptbildschirm F5 --------------------------------------------------

export function postkastenScreen() {
  return {
    title: 'Post, Notizen und Ablageregal',
    build() {
      const aktiv = post.istAktiv();
      const abrufTaste = comboText('me_postabruf') || 'Strg B';
      const items = [
        { label: 'Post abrufen', taste: abrufTaste, hint: 'holt neue Post für den Meister und für alle', onSelect: () => postAbrufen() },
        { label: 'Post senden', hint: 'Nachricht online ablegen, der Empfänger ruft sie ab', onSelect: () => screen.push(zieleScreen()) },
        { label: 'Posteingang', hint: 'abgerufene Nachrichten', onSelect: () => screen.push(posteingangScreen()) },
        { label: 'Postausgang', hint: 'was du gesendet hast', onSelect: () => screen.push(postausgangScreen()) },
        { label: 'Ablage', hint: 'Ablageregal für verschobene Post', onSelect: () => screen.push(ablageScreen()) },
        { label: 'Notizen', hint: 'je Charakter; Verschiebeziel für Post', onSelect: () => screen.push(notizenScreen()) },
      ];
      // Verbindung ganz unten (Code im Tooltip).
      if (aktiv) {
        items.push({ label: `Verbundene Spieler, ${post.verbundeneSpieler().length}`, hint: 'wer ist verbunden; einzeln oder alle trennen', onSelect: () => screen.push(verbundeneSpielerScreen()) });
        items.push({ label: 'Post-Verbindung läuft', hint: 'Code im Tooltip; Enter beendet die Verbindung', detail: codeTooltip(), onSelect: () => { post.stopp(); sprache.sage('Post-Verbindung beendet.'); screen.refresh(); } });
      } else {
        items.push({ label: 'Verbinden', hint: 'Post-Verbindung starten und Code erzeugen', onSelect: () => starteVerbindung() });
      }
      return menuScreen({
        title: 'Post, Notizen und Ablageregal',
        subtitle: 'Post senden, Ein- und Ausgang, Ablage, Notizen. Verbinden ganz unten. Escape zurück.',
        items,
      }).build();
    },
    onShow() { sprache.sage('Post, Notizen und Ablageregal.'); },
  };
}
