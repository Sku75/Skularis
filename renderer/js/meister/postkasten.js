/**
 * Skularistool — Meistertisch F5: Post, Notizen und Ablageregal.
 *
 * Aufbau: Post senden (Nachricht/Pop-up), Posteingang, Postausgang, Ablage
 * (Ablageregal), Notizen (je Charakter), ganz unten die Verbindung (Code im
 * Tooltip). Eingegangene Post laesst sich in die Ablage oder in die Notizen des
 * Absenders verschieben. Ein Pop-up geht beim Empfaenger sofort als Fenster auf
 * (Ton, Text, OK) und wird nirgends gespeichert.
 *
 * Zusaetzlich: F2-Live-Notifikation. Aendert ein verbundener Spieler einen Wert,
 * hoert der Meister einen Ton und eine Ansage der Aenderung ("Name, Wunden von 1
 * auf 2"). Ein Ueberlaufschutz bremst absichtliches Dauer-Umschalten.
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

let _code = '';
let _popupOffen = false;

function kurz(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 50 ? s.slice(0, 50) + '…' : s; }
/** Datum und Uhrzeit einer Nachricht lesbar (oder leer). */
function zeitText(m) { try { return (m && m.zeit) ? new Date(m.zeit).toLocaleString('de-DE') : ''; } catch { return ''; } }

// --- Eingang: Nachricht bzw. Pop-up -------------------------------------

function zeigePopup(von, text) {
  if (_popupOffen) return; // nur ein Pop-up-Fenster gleichzeitig
  _popupOffen = true;
  sounds.playPopup();
  sprache.sage(`Pop-up von ${von}. ${text || 'Kein Text.'}`);
  knopfDialog({ titel: `Pop-up von ${von}`, frage: text || '(kein Text)', knoepfe: [{ label: 'OK', wert: 'ok' }] })
    .then(() => { _popupOffen = false; })
    .catch(() => { _popupOffen = false; });
}

function empfangePost(m) {
  diag(`empfangePost: typ=${m && m.typ} id=${m && m.id} von=${m && m.von}`);
  if (m && m.typ === 'popup') { diag('-> PLAYPOPUP'); zeigePopup(m.von || 'Spieler', String(m.text || '')); return; }
  const a = getMeister();
  if (!a) return;
  const eintrag = { id: m.id, von: m.von || 'Spieler', text: String(m.text || ''), zeit: m.zeit || Date.now(), gelesen: false };
  a.posteingang = a.posteingang || [];
  if (m.id && a.posteingang.some(x => x.id === m.id)) { diag('-> Post-Dedup: schon im Eingang, kein Ton'); return; }
  a.posteingang.unshift(eintrag);
  speichere();
  diag('-> PLAYPOST (langer Post-Ton)');
  sounds.playPost();
  sprache.sage(`Neue Post von ${eintrag.von}.`);
}

// --- F2-Live-Notifikation + Ueberlaufschutz ------------------------------

const _letzterStatus = new Map(); // name -> zuletzt empfangene Werte (fuer Diff)
const _angesagt = new Map();      // name -> zuletzt ANGESAGTE Werte
const _statusTimer = new Map();   // name -> Timer: buendelt F2-Aenderungen zum Endstand

// Live-Hook: ein offener "Meine Initiativephase"-Bildschirm meldet sich hier an und
// wird bei einer echten Werteänderung des Spielers sofort neu gezeichnet (Task 147).
let _liveHook = null;
export function setLiveHook(fn) { _liveHook = fn || null; }

const FELD = { Wunden: 'Wunden', Erschoepfung: 'Erschöpfung', SchiP: 'Schicksalspunkte', AsP: 'Astralpunkte', KaP: 'Karmapunkte', GuP: 'Gunstpunkte', AstralspeicherStab: 'Astralspeicher' };
function az(werte, k) { return (werte && werte[k] && typeof werte[k].aktuell === 'number') ? werte[k].aktuell : null; }

/** Geaenderte variable Werte als Liste "Feld von X auf Y" (inkl. Zauberspeicher). */
function diffTeile(alt, neu) {
  const teile = [];
  for (const k of Object.keys(FELD)) {
    const n = az(neu, k); const a = az(alt, k);
    if (n !== null && n !== a) teile.push(`${FELD[k]} von ${a === null ? '—' : a} auf ${n}`);
  }
  // Zauberspeicher: ein Zauber wurde eingelegt oder verbraucht.
  const za = Array.isArray(alt && alt.zauberspeicher) ? alt.zauberspeicher : [];
  const zn = Array.isArray(neu && neu.zauberspeicher) ? neu.zauberspeicher : [];
  const zmax = Math.max(za.length, zn.length);
  for (let i = 0; i < zmax; i++) {
    const an = za[i] && za[i].name; const bn = zn[i] && zn[i].name;
    if (an === bn) continue;
    if (bn && !an) teile.push(`Zauberspeicher Platz ${i + 1}, ${bn} eingelegt`);
    else if (!bn && an) teile.push(`Zauberspeicher Platz ${i + 1}, ${an} verbraucht`);
    else teile.push(`Zauberspeicher Platz ${i + 1}, jetzt ${bn}`);
  }
  return teile;
}

// F2-Änderungen werden GEBÜNDELT: Statt jeder Zwischenänderung wird erst nach einer
// kurzen Ruhe (1,8 s ohne weitere Änderung) EINMAL der Endstand angesagt — also nur
// das, was die Person am Ende wirklich eingestellt hat. Mit einem weichen Ton.
const STATUS_RUHE_MS = 1800;
function statusAenderung(name, werte) {
  _letzterStatus.set(name, werte);
  // Der periodische Voll-Abgleich (alle 25 s) und ein Reconnect senden denselben
  // Stand erneut — das erzeugt keinen Diff und bleibt daher von selbst still.
  if (_statusTimer.has(name)) clearTimeout(_statusTimer.get(name));
  _statusTimer.set(name, setTimeout(() => {
    _statusTimer.delete(name);
    const aktuell = _letzterStatus.get(name) || {};
    const teile = diffTeile(_angesagt.get(name) || {}, aktuell); // Diff seit der letzten Ansage
    _angesagt.set(name, aktuell);
    if (teile.length) {
      sounds.play('click', 0.4); sprache.sage(`${name}, ${teile.join(', ')}.`);
      if (_liveHook) { try { _liveHook(name); } catch { /* egal */ } } // offenen Live-Bildschirm neu zeichnen
    }
  }, STATUS_RUHE_MS));
}

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
    onNachricht: (m) => empfangePost(m),
    onStatus: (name, werte) => statusAenderung(name, werte),
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

async function schreibeInhalt(ziel, typ) {
  const zielName = ziel === '*' ? 'alle' : ziel;
  const wort = typ === 'popup' ? 'Pop-up' : 'Post';
  const text = await textDialog({ titel: `${wort} an ${zielName}`, label: 'Nachricht schreiben', mehrzeilig: true });
  if (text === null || !text.trim()) return;
  if (post.meisterSende(ziel, text.trim(), typ)) {
    if (typ !== 'popup') { // Pop-ups werden nirgends gesammelt
      const a = getMeister();
      a.postAusgang = a.postAusgang || [];
      a.postAusgang.unshift({ an: zielName, text: text.trim(), zeit: Date.now() });
      speichere();
    }
    sounds.playSpeichern(); screen.pop(); sprache.sage(`${wort} an ${zielName} gesendet.`);
  } else sprache.sage('Nicht gesendet. Kein passender Spieler verbunden.');
}

function zieleScreen(typ) {
  const wort = typ === 'popup' ? 'Pop-up senden' : 'Nachricht senden';
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

function sendenScreen() {
  return {
    title: 'Post senden',
    build() {
      return menuScreen({
        title: 'Post senden',
        subtitle: 'Nachricht landet im Posteingang; ein Pop-up geht beim Empfänger sofort auf. Escape zurück.',
        items: [
          { label: 'Nachricht senden', hint: 'landet im Posteingang des Spielers', onSelect: () => screen.push(zieleScreen('msg')) },
          { label: 'Pop-up senden', hint: 'öffnet beim Spieler sofort ein Fenster', onSelect: () => screen.push(zieleScreen('popup')) },
        ],
      }).build();
    },
    onShow() { sprache.sage('Post senden. Nachricht oder Pop-up?'); },
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
        { label: 'Antworten', hint: `Antwort an ${m.von}`, onSelect: () => schreibeInhalt(m.von, 'msg') },
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
      const items = [
        { label: 'Post senden', hint: aktiv ? 'Nachricht oder Pop-up' : 'zuerst Verbindung starten', onSelect: () => screen.push(sendenScreen()) },
        { label: 'Posteingang', hint: 'eingegangene Nachrichten', onSelect: () => screen.push(posteingangScreen()) },
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
