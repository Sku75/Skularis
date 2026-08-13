/**
 * Skularistool — Meistertisch F4: Charaktere (Spielerstatus).
 *
 * Zwei Punkte: "Charakteransicht meine Initiativephase" und "Charakterbögen".
 * Die Charakteransicht zeigt je Gruppen-Charakter eine Überschrift mit Status
 * (verbunden / offline / nicht übertragen), darunter die variablen F2-Werte des
 * Spielers (Wunden, Erschöpfung, Schicksals-/Astral-/Karma-/Gunstpunkte,
 * Astralspeicher des Magierstabs und der Zauberspeicher), dann die abgeleiteten
 * Werte ab Wundschwelle, und darunter die Initiative-Phase ab "Kämpfen" abwärts
 * (verdeckte Meister-Würfe). Verbundene Spieler liefern die Werte live; offline
 * werden die zuletzt übertragenen Werte gezeigt.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { infoZeile, abschnittTitel, aktionZeile, verbindeDetail } from '../editor/widgets.js';
import { baueCharakterbogen } from '../abenteuer/charakterbogen.js';
import { kampfwerteScreen } from '../abenteuer/live-spiel.js';
import { manoeverScreen, zauberScreen, zauberVorhanden } from '../abenteuer/kampf-menues.js';
import { zauberspeicherVorhanden, zauberspeicherScreen } from '../abenteuer/zauberspeicher.js';
import { setVerdeckt } from '../abenteuer/wuerfel-kern.js';
import { setAbenteuer, setDb } from '../abenteuer/state.js';
import { getDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { getMeister, speichere } from './state.js';
import * as post from '../net/post.js';

const ipc = window.skularis?.ipc;

/**
 * Meistertisch: ein vom Spieler gesendetes Charakterupdate abholen (Code) und, wenn
 * der Charakter in der Gruppe ist, dessen Bogen gleich hier live aktualisieren — ohne
 * den Meistertisch zu verlassen. Die eigentliche Abhol-/Ersetzen-Logik (per stabiler
 * ID, keine Dubletten) liegt in meine-charaktere.js.
 */
async function neueUpdatesSuchen() {
  let mc; try { mc = await import('../screens/meine-charaktere.js'); } catch (e) { console.error('Update-Modul:', e); return; }
  const info = await mc.charakterAbrufen(); // fragt Code, lädt, ersetzt in der Bibliothek per ID
  if (!info || !info.ok) return;            // abgebrochen oder nichts gefunden (bereits angesagt)
  const a = getMeister();
  if (!a || !Array.isArray(a.charaktere)) return;
  const treffer = a.charaktere.find(c => c.bogen && c.bogen.id === info.id);
  if (!treffer) { sprache.sage(`${info.name} ist noch nicht in deiner Gruppe. Füge ihn über die Gruppenzusammenstellung hinzu.`); return; }
  try {
    const db = getDb();
    const liste = await ipc.bibliothekListe();
    for (const x of liste) {
      const res = await ipc.dateiDirektLaden(x.pfad);
      const p = parse(res.inhalt, db);
      if (p && p.id === info.id) { treffer.bogen = p; treffer.name = p.name; treffer.pfad = x.pfad; break; }
    }
    await speichere();
    screen.refresh();
    sprache.sage(`${info.name} in der Gruppe aktualisiert.`);
  } catch (e) { console.error('Gruppen-Update:', e); }
}

/** Charakterbögen der Gruppe (nur ansehen). */
export function charakterboegenScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = 'Charakterbögen';
      const items = a.charaktere.map(c => ({
        label: c.name,
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

/** Eine F2-Wertzeile aus dem Live-Status (oder null, wenn nicht vorhanden). */
function statusZeile(werte, key, wort) {
  const v = werte[key];
  if (!v || typeof v.aktuell !== 'number') return null;
  const max = (v.max !== undefined && v.max !== null) ? ` von ${v.max}` : '';
  return infoZeile(`${wort}: ${v.aktuell}${max}`, `${wort} des Spielers, live übertragen. Nur Anzeige.`);
}

/** Kompakte, vorlesbare Zusammenfassung des Live-Stands (für "Aktualisieren"). */
function statusZusammenfassung(name, werte) {
  if (!werte || !Object.keys(werte).length) return `${name}: noch nichts übertragen.`;
  const teile = [];
  const paar = (k, wort) => { const v = werte[k]; if (v && typeof v.aktuell === 'number') teile.push(`${wort} ${v.aktuell}${(v.max != null ? ` von ${v.max}` : '')}`); };
  paar('Wunden', 'Wunden'); paar('Erschoepfung', 'Erschöpfung');
  paar('AsP', 'Astralpunkte'); paar('KaP', 'Karmapunkte'); paar('GuP', 'Gunstpunkte');
  paar('SchiP', 'Schicksalspunkte'); paar('AstralspeicherStab', 'Astralspeicher Stab');
  const zs = Array.isArray(werte.zauberspeicher) ? werte.zauberspeicher.filter(Boolean) : [];
  if (zs.length) teile.push(`Zauberspeicher ${zs.map(s => s.name).join(', ')}`);
  return `${name}: ${teile.length ? teile.join(', ') : 'keine Zähler übertragen'}.`;
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

/** Charakteransicht: Status-Überschrift, F2-Werte, abgeleitete Werte, dann ab Kämpfen. */
function charLiveScreen(c) {
  return {
    title: '',
    build() {
      // Zuordnung bevorzugt über die stabile Charakter-ID (auch nach Umbenennung),
      // sonst über den Namen wie bisher.
      const werte = (c.bogen && post.getStatusById(c.bogen.id)) || post.getStatus(c.name);
      const online = post.verbundeneSpieler().includes(c.name);
      const status = online ? 'verbunden' : (werte ? 'offline' : 'nicht übertragen');
      this.title = `${c.name} — ${status}`;
      setzeAnsicht(c);

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(this.title));

      // Aktualisieren GANZ OBEN: holt den aktuellen Live-Stand und liest ihn vor.
      // Bewusst manuell (kein Auto-Neuaufbau), damit der Fokus nicht wegspringt.
      wrap.appendChild(aktionZeile('Aktualisieren', () => {
        const frisch = post.getStatus(c.name) || {};
        sprache.sage('Aktualisiert. ' + statusZusammenfassung(c.name, frisch));
        screen.refresh();
      }, 'holt den aktuellen Stand des Spielers (Wunden, Energien, Zauberspeicher) und liest ihn vor'));

      wrap.appendChild(abschnittTitel('Werte'));
      if (werte) {
        if (typeof werte.einschraenkungen === 'number') wrap.appendChild(infoZeile(`Einschränkungen: ${werte.einschraenkungen}`, 'Wunden plus Erschöpfung. Live vom Spieler. Nur Anzeige.'));
        for (const [k, wort] of [['Wunden', 'Wunden'], ['Erschoepfung', 'Erschöpfung'], ['SchiP', 'Schicksalspunkte'], ['AsP', 'Astralpunkte'], ['KaP', 'Karmapunkte'], ['GuP', 'Gunstpunkte'], ['AstralspeicherStab', 'Astralspeicher Stab']]) {
          const z = statusZeile(werte, k, wort); if (z) wrap.appendChild(z);
        }
        const zs = Array.isArray(werte.zauberspeicher) ? werte.zauberspeicher : [];
        if (zs.length) {
          const txt = zs.map((s, i) => s ? `${i + 1}: ${s.name}, Qualität ${s.qualitaet}` : `${i + 1}: leer`).join('; ');
          wrap.appendChild(infoZeile(`Zauberspeicher: ${txt}`, 'Geladene Zauber im Magierstab, live vom Spieler.'));
        }
        const w2 = (k, wort) => { if (typeof werte[k] === 'number') wrap.appendChild(infoZeile(`${wort}: ${werte[k]}`, `${wort}, live vom Spieler. Nur Anzeige.`)); };
        w2('WS', 'Wundschwelle'); w2('MR', 'Magieresistenz'); w2('GS', 'Geschwindigkeit'); w2('INI', 'Initiative'); w2('SB', 'Schadensbonus'); w2('DH', 'Durchhaltevermögen'); w2('RS', 'Rüstungsschutz'); w2('BE', 'Behinderung');
      } else {
        wrap.appendChild(infoZeile('Nicht übertragen. Der Spieler war noch nicht verbunden.', 'Sobald der Spieler über die Meisterpost verbunden ist, erscheinen hier seine Werte.'));
      }

      // Initiative-Phase ab "Kämpfen" abwärts (verdeckt). Kein Würfelbecher, keine Aktionen.
      wrap.appendChild(abschnittTitel('Initiative-Phase (verdeckt)'));
      const db = getDb();
      wrap.appendChild(aktionZeile('Kämpfen', () => screen.push(kampfwerteScreen()), 'Attacke oder Parade und Schaden je Waffenset, verdeckt'));
      wrap.appendChild(aktionZeile('Manöver', () => screen.push(manoeverScreen()), 'Nahkampf-Manöver mit ihrer Wirkung'));
      if (zauberVorhanden(c.bogen, db)) wrap.appendChild(aktionZeile('Zauber und Rituale', () => screen.push(zauberScreen()), 'bekannte Zauber, verdeckt würfeln'));
      if (zauberspeicherVorhanden(c.bogen)) wrap.appendChild(aktionZeile('Zauberspeicher', () => screen.push(zauberspeicherScreen()), 'Magierstab-Zauberspeicher'));

      verbindeDetail(wrap);
      return wrap;
    },
    // Beim Verlassen den transienten Kontext + Verdeckt-Modus wieder löschen (true = normal zurück).
    onBack() { setVerdeckt(false); setAbenteuer(null); return true; },
    onShow() { sprache.sage(post.verbundeneSpieler().includes(c.name) ? `${c.name}, verbunden. Live-Werte oben.` : `${c.name}.`); },
  };
}

export function charAnsichtInitiativeScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      const gruppe = a.charaktere || [];
      const verbunden = new Set(post.verbundeneSpieler());
      const hatStatus = new Set(post.statusNamen());
      this.title = `Charakteransicht, ${gruppe.length}`;
      const items = gruppe.map(c => {
        const zus = verbunden.has(c.name) ? ' (verbunden)' : (hatStatus.has(c.name) ? ' (offline)' : '');
        return { label: `${c.name}${zus}`, hint: 'Status und Initiative-Phase dieses Charakters', onSelect: () => screen.push(charLiveScreen(c)) };
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

/** F4: Charaktere — Charakteransicht und Charakterbögen. */
export function charaktereScreen() {
  return menuScreen({
    title: 'Charaktere',
    subtitle: 'Charakteransicht und Charakterbögen. Escape zurück.',
    items: [
      { label: 'Charakteransicht meine Initiativephase', hint: 'Status und Werte der Helden, verdeckt würfeln', onSelect: () => screen.push(charAnsichtInitiativeScreen()) },
      { label: 'Charakterbögen', hint: 'die Bögen der Gruppe zum Nachlesen', onSelect: () => screen.push(charakterboegenScreen()) },
      { label: 'Neue Charakterupdates suchen', hint: 'einen vom Spieler gesendeten Code eingeben und den Charakter direkt hier aktualisieren', onSelect: () => neueUpdatesSuchen() },
    ],
  });
}
