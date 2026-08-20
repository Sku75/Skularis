/**
 * Skularistool — Meistertisch F4: Charaktere.
 *
 * Drei Punkte: Charakteransicht (Initiative-Phase je Held, verdeckt würfeln),
 * Charakterbögen und Würfelprotokoll. Die frühere F2-Live-Übertragung der
 * Spielerwerte (Wunden, Energien) wurde in 1.20 entfernt — der Meister führt
 * seine eigenen Zähler im Meister-Datensatz und liest die Bogenwerte; die
 * Verbunden-Markierung kommt weiter aus der Spielerliste des Datenkanals.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { infoZeile, abschnittTitel, aktionZeile, verbindeDetail } from '../editor/widgets.js';
import { baueCharakterbogen } from '../abenteuer/charakterbogen.js';
import { kampfwerteScreen } from '../abenteuer/live-spiel.js';
import { manoeverScreen, zauberScreen, zauberVorhanden, attributsprobenScreen, profanScreen } from '../abenteuer/kampf-menues.js';
import { zauberspeicherVorhanden, zauberspeicherScreen } from '../abenteuer/zauberspeicher.js';
import { setVerdeckt } from '../abenteuer/wuerfel-kern.js';
import { setAbenteuer, setDb } from '../abenteuer/state.js';
import { getDb } from '../core/db-laden.js';
import { parse, serialisiere } from '../core/sephrasto-xml.js';
import { holeBogenPerCode, uebernahmeScreen, gesamtEP } from '../core/bogen-uebernahme.js';
import { getMeister, speichere } from './state.js';
import * as post from '../net/post.js';

const ipc = window.skularis?.ipc;

/**
 * Einen (frisch geladenen) Bogen in die Bibliothek schreiben und seinen Pfad
 * ermitteln — damit der Meistertisch-Eintrag beim nächsten Öffnen frisch vom Bogen
 * liest ("Bogen ist König"). @returns {Promise<{name, pfad}>}
 */
async function inBibliothek(neuChar, db) {
  const name = (neuChar.name || 'Charakter').trim() || 'Charakter';
  await ipc.bibliothekSpeichern({ name, inhalt: serialisiere(neuChar, db) });
  let pfad = '';
  try { const l = await ipc.bibliothekListe(); const t = l.find(x => (x.name || '').toLowerCase() === name.toLowerCase()); if (t) pfad = t.pfad; } catch { /* egal */ }
  return { name, pfad };
}

/**
 * F11 „Charakterupdate": den vom Spieler genannten Code eingeben, dann im
 * Übernahme-Fenster wählen, welchen Gruppen-Bogen er ersetzt — oder ihn neu in die
 * Gruppe aufnehmen. Ersetzen/Annehmen schreibt den Bogen in die Bibliothek und
 * aktualisiert die Gruppe.
 */
export async function starteGruppenUpdate() {
  const r = await holeBogenPerCode();
  if (!r) return;
  const { neuChar, db } = r;
  const a = getMeister();
  if (!a) return;
  a.charaktere = a.charaktere || [];
  const ziele = a.charaktere.map(c => ({ name: c.name, ep: gesamtEP(c.bogen), id: c.bogen && c.bogen.id, _ref: c }));
  screen.push(uebernahmeScreen({
    neuChar, ziele,
    onErsetzen: async (z) => {
      const { name, pfad } = await inBibliothek(neuChar, db);
      const alt = z._ref;
      if (alt.pfad && pfad && alt.pfad !== pfad && (alt.name || '').toLowerCase() !== name.toLowerCase()) {
        try { await ipc.bibliothekLoeschen(alt.pfad); } catch { /* egal */ }
      }
      alt.name = name; alt.pfad = pfad; alt.bogen = neuChar;
      await speichere();
      screen.refresh();
    },
    onNeuAnnehmen: async () => {
      const { name, pfad } = await inBibliothek(neuChar, db);
      const vorhanden = a.charaktere.find(c => (c.name || '').toLowerCase() === name.toLowerCase());
      if (vorhanden) { vorhanden.name = name; vorhanden.pfad = pfad; vorhanden.bogen = neuChar; }
      else a.charaktere.push({ name, pfad, bogen: neuChar });
      await speichere();
      screen.refresh();
    },
  }));
}


/** Charakterbögen der Gruppe (nur ansehen). */
export function charakterboegenScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = 'Charakterbögen';
      const items = a.charaktere.map(c => ({
        label: `${c.name}, ${gesamtEP(c.bogen)} EP`,
        hint: 'Bogen ansehen',
        onSelect: () => screen.push(baueCharakterbogen(c.bogen, getDb(), `Charakterbogen ${c.name}`)),
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter öffnet den Bogen. Escape zurück.',
        items,
        leer: 'Noch keine Helden in der Gruppe.',
      }).build();
    },
  };
}

/** Transienten Ansicht-Kontext setzen (Bogen als Charakter, verdeckt, keine Persistenz). */
function setzeAnsicht(c) {
  setAbenteuer({
    name: `Ansicht ${c.name}`, charakter: c.bogen,
    ressourcen: {}, inventar: { geldboerse: {}, rucksack: [], guertel: [] },
    journal: [], protokoll: [], mitspieler: [], zauberspeicher: [], _transient: true,
  });
  setDb(getDb());
  setVerdeckt(true);
}

/** Charakteransicht: Initiative-Phase des Helden ab Kämpfen (verdeckt würfeln). */
function charLiveScreen(c) {
  const self = {
    title: '',
    build() {
      const online = post.verbundeneSpieler().includes(c.name);
      this.title = online ? `${c.name} — verbunden` : c.name;
      setzeAnsicht(c);

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(this.title));

      // Initiative-Phase ab "Kämpfen" abwärts (verdeckt). Kein Würfelbecher, keine Aktionen.
      wrap.appendChild(abschnittTitel('Initiative-Phase (verdeckt)'));
      const db = getDb();
      wrap.appendChild(aktionZeile('Kämpfen', () => screen.push(kampfwerteScreen()), 'Attacke oder Parade und Schaden je Waffenset, verdeckt'));
      wrap.appendChild(aktionZeile('Manöver', () => screen.push(manoeverScreen()), 'Nahkampf-Manöver mit ihrer Wirkung'));
      wrap.appendChild(aktionZeile('Attributsproben', () => screen.push(attributsprobenScreen()), 'je Attribut eine Probe (Attribut mal zwei), verdeckt'));
      wrap.appendChild(aktionZeile('Profane Fertigkeiten und Talente', () => screen.push(profanScreen()), 'auf jede Fertigkeit und jedes Talent würfeln, auch nicht gelernte, verdeckt'));
      if (zauberVorhanden(c.bogen, db)) wrap.appendChild(aktionZeile('Zauber und Rituale', () => screen.push(zauberScreen()), 'bekannte Zauber, verdeckt würfeln'));
      if (zauberspeicherVorhanden(c.bogen)) wrap.appendChild(aktionZeile('Zauberspeicher', () => screen.push(zauberspeicherScreen()), 'Magierstab-Zauberspeicher'));

      verbindeDetail(wrap);
      return wrap;
    },
    // Beim Verlassen den transienten Kontext + Verdeckt-Modus wieder löschen (true = normal zurück).
    onBack() { setVerdeckt(false); setAbenteuer(null); return true; },
    // KEIN automatisches Neuzeichnen bei jeder Spieler-Änderung mehr: das erzeugte
    // sonst bei jedem Wert/Wurf erneut "Name verbunden, Live-Werte oben" und las die
    // fokussierte Zeile neu vor. Die eigentliche Änderung wird ohnehin einmal
    // angesagt ("Name, Wunden von 2 auf 0"). Zum Auffrischen gibt es oben den Punkt
    // "Aktualisieren".
    onShow() {
      sprache.sage(post.verbundeneSpieler().includes(c.name) ? `${c.name}, verbunden.` : `${c.name}.`);
    },
  };
  return self;
}

export function charAnsichtInitiativeScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      const gruppe = a.charaktere || [];
      const verbunden = new Set(post.verbundeneSpieler());
      this.title = `Charakteransicht, ${gruppe.length}`;
      const items = gruppe.map(c => {
        const zus = verbunden.has(c.name) ? ' (verbunden)' : '';
        return { label: `${c.name}, ${gesamtEP(c.bogen)} EP${zus}`, hint: 'Initiative-Phase dieses Charakters, verdeckt würfeln', onSelect: () => screen.push(charLiveScreen(c)) };
      });
      return menuScreen({
        title: this.title,
        subtitle: 'Enter öffnet Werte und Initiative-Phase des Charakters. Escape zurück.',
        items,
        leer: 'Noch keine Helden in der Gruppe. Erst unter Gruppenzusammenstellung hinzufügen.',
      }).build();
    },
    onShow() { sprache.sage('Charakteransicht. Verbundene Spieler sind markiert.'); },
  };
}

// --- Würfelprotokoll (Meisterwürfe + je Held) ----------------------------

function wurfZeit(w) { try { return (w && w.zeit) ? new Date(w.zeit).toLocaleTimeString('de-DE') : ''; } catch { return ''; } }

/** Alle Würfe eines Namens, neueste oben. */
function wurfListeScreen(name) {
  return {
    title: '',
    build() {
      const liste = post.getWuerfe(name);
      this.title = name === 'Meister' ? 'Meisterwürfe' : `Würfe: ${name}`;
      const items = liste.map(w => ({
        label: `${w.was}: ${w.ergebnis}`,
        hint: wurfZeit(w),
        detail: w.detail || `${w.was}. ${w.ergebnis}.`,
        onSelect: () => sprache.sage(w.detail || `${w.was}, ${w.ergebnis}.`),
      }));
      return menuScreen({ title: this.title, subtitle: 'Neueste oben. Shift und Pfeil-runter liest den Wurf vor. Escape zurück.', items, leer: 'Noch keine Würfe.' }).build();
    },
    onShow() { sprache.sage(this.title || 'Würfe.'); },
  };
}

/** Würfelprotokoll: Meisterwürfe und je Held; Tooltip zeigt den letzten Wurf. */
export function wurfProtokollScreen() {
  return {
    title: 'Würfelprotokoll',
    build() {
      const a = getMeister();
      const namen = ['Meister', ...((a && a.charaktere) || []).map(c => c.name)];
      const items = namen.map(n => {
        const lw = post.letzterWurf(n);
        const anzahl = post.getWuerfe(n).length;
        return {
          label: n === 'Meister' ? `Meisterwürfe (${anzahl})` : `${n} (${anzahl})`,
          hint: lw ? `letzter: ${lw.was}: ${lw.ergebnis}` : 'noch keine Würfe',
          detail: lw ? (lw.detail || `${lw.was}. ${lw.ergebnis}.`) : 'Noch keine Würfe.',
          onSelect: () => screen.push(wurfListeScreen(n)),
        };
      });
      return menuScreen({ title: 'Würfelprotokoll', subtitle: 'Meisterwürfe und je Held. Tooltip zeigt den letzten Wurf, Enter öffnet die Liste. Escape zurück.', items }).build();
    },
    onShow() { sprache.sage('Würfelprotokoll.'); },
  };
}

/** F4: Charaktere — Charakteransicht, Charakterbögen und Würfelprotokoll. */
export function charaktereScreen() {
  return menuScreen({
    title: 'Charaktere',
    subtitle: 'Charakteransicht, Charakterbögen und Würfelprotokoll. Escape zurück.',
    items: [
      { label: 'Charakteransicht meine Initiativephase', hint: 'Status und Werte der Helden, verdeckt würfeln', onSelect: () => screen.push(charAnsichtInitiativeScreen()) },
      { label: 'Charakterbögen', hint: 'die Bögen der Gruppe zum Nachlesen', onSelect: () => screen.push(charakterboegenScreen()) },
      { label: 'Würfelprotokoll', hint: 'Meisterwürfe und die Würfe jedes Helden, neueste oben', onSelect: () => screen.push(wurfProtokollScreen()) },
    ],
  });
}
