/**
 * Skularistool — Meister-Tisch: Spielerinfos (F4).
 *
 * Baut auf JEDEM geladenen Charakter der Gruppe auf. Drei Unterbereiche:
 *   1. Vitalitaet-Tracker — je Charakter eine Karte mit Wunden und Erschoepfung
 *      (verstellbar) sowie der Einschraenkungs-Summe und den wichtigsten Werten.
 *      Die Wunden/Erschoepfung stehen in a.vitalitaet und sind damit DIESELBE
 *      Quelle wie im Spieltisch-Kampf: aendert sich dort eine Wunde, steht sie
 *      hier, und umgekehrt. Der Stand wird mit dem Abenteuer gespeichert.
 *   2. Charakterboegen — die Boegen der Gruppe zum Nachlesen.
 *   3. Notizen zu den Charakteren — je Charakter eine freie Notiz.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { wertZeile, infoZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { textDialog, knopfDialog } from '../ui/dialog.js';
import { abgeleiteteWerte, wundabzug } from '../core/regeln.js';
import { baueCharakterbogen } from '../abenteuer/charakterbogen.js';
import { liveSpielScreen } from '../abenteuer/live-spiel.js';
import { setAbenteuer, setDb } from '../abenteuer/state.js';
import { setVerdeckt } from '../abenteuer/wuerfel-kern.js';
import { postkastenScreen } from './postkasten.js';
import { getMeister, speichere } from './state.js';
import { getDb } from '../core/db-laden.js';
import { vitalitaet } from '../core/meister-abenteuer.js';

const EINSCHR_REGEL = 'Wunden und Erschoepfung zaehlen zusammen als Einschraenkungen. '
  + 'Ab der dritten sind alle Proben um zwei erschwert, je weitere um zwei mehr. '
  + 'Ab fuenf droht nach jeder weiteren die Kampfunfaehigkeit.';

/** Kurzer Summen-/Status-Text fuer einen Charakter aus seiner Vitalitaet. */
function einschrText(v) {
  const summe = (v.wunden || 0) + (v.erschoepfung || 0);
  const ab = wundabzug(summe);
  let s = `Einschraenkungen ${summe}`;
  if (ab > 0) s += `, alle Proben minus ${ab}`;
  if (summe >= 5) s += ', Kampfunfaehigkeit droht';
  return s;
}

/** Maxima der Energien/Schicksalspunkte aus dem Bogen (nur zur Anzeige). */
function eckwerte(bogen) {
  const w = abgeleiteteWerte(bogen);
  const teile = [`Wundschwelle ${w.WS}`];
  for (const [k, name] of [['AsP', 'Astralpunkte'], ['KaP', 'Karmapunkte']]) {
    const e = bogen.energien && bogen.energien[k];
    if (e) {
      const max = (e.basis || 0) + (e.gekauft || 0);
      if (max > 0) teile.push(`${name} ${max}`);
    }
  }
  teile.push(`Schicksalspunkte ${w.SchiP}`);
  return teile.join(', ');
}

/** Vitalitaet-Tracker: je Charakter eine Karte, Wunden/Erschoepfung verstellbar. */
export function vitalitaetTrackerScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      const chars = a.charaktere || [];
      this.title = `Vitalitaet-Tracker, ${chars.length} Helden`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Vitalitaet-Tracker'));

      if (!chars.length) {
        wrap.appendChild(infoZeile('Noch keine Helden in der Gruppe. Erst unter Gruppenzusammenstellung hinzufuegen.'));
        verbindeDetail(wrap);
        return wrap;
      }

      for (const c of chars) {
        const v = vitalitaet(a, c.name);
        const bogen = c.bogen || {};
        wrap.appendChild(abschnittTitel(c.name));
        // Kopfzeile mit Summe/Status (aktualisiert sich beim Verstellen).
        const kopf = infoZeile(einschrText(v), () => [einschrText(v), '', EINSCHR_REGEL]);
        wrap.appendChild(kopf);
        const frischeKopf = () => {
          const t = einschrText(v);
          kopf.textContent = t;
          kopf.setAttribute('data-sr-label', t); kopf.dataset.srValue = t; kopf.setAttribute('aria-label', t);
          kopf.dispatchEvent(new CustomEvent('detail-refresh', { bubbles: true }));
          return t;
        };
        wrap.appendChild(wertZeile({
          label: `${c.name}, Wunden`,
          get: () => v.wunden || 0,
          set: (x) => { v.wunden = x; },
          min: 0, max: 99,
          onChange: () => { speichere(); return frischeKopf(); },
          detail: () => [einschrText(v), '', `Wunden verstellen. ${EINSCHR_REGEL}`],
        }));
        wrap.appendChild(wertZeile({
          label: `${c.name}, Erschoepfung`,
          get: () => v.erschoepfung || 0,
          set: (x) => { v.erschoepfung = x; },
          min: 0, max: 99,
          onChange: () => { speichere(); return frischeKopf(); },
          detail: () => [einschrText(v), '', `Erschoepfung verstellen. ${EINSCHR_REGEL}`],
        }));
        wrap.appendChild(infoZeile(eckwerte(bogen), 'Wichtige Werte aus dem Charakterbogen (Maxima). Die aktuellen Astral- und Karmapunkte fuehren die Spieler an ihrem Abenteuertisch.'));
      }

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Vitalitaet-Tracker. Wunden und Erschoepfung je Held mit Pfeil links und rechts. Der Stand ist mit dem Spieltisch-Kampf geteilt.'); },
  };
}

/** Charakterboegen der Gruppe (nur ansehen). */
export function charakterboegenScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Charakterboegen, ${a.charaktere.length}`;
      const items = a.charaktere.map(c => ({
        label: c.name,
        hint: 'Bogen ansehen',
        onSelect: () => screen.push(baueCharakterbogen(c.bogen, getDb(), `Charakterbogen ${c.name}`)),
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet den Bogen. Escape zurueck.',
        items,
        leer: 'Noch keine Helden in der Gruppe.',
      }).build();
    },
  };
}

/**
 * Tagebuch-artige Notizen zu EINEM Charakter: mehrere Eintraege, neueste oben.
 * Migriert eine alte Einzelnotiz (String) automatisch in einen ersten Eintrag.
 */
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
  const w = await knopfDialog({
    titel: 'Notiz', frage: e.text,
    knoepfe: [
      { label: 'Bearbeiten', wert: 'edit' },
      { label: 'Loeschen', wert: 'del' },
      { label: 'Zurueck', wert: 'zur' },
    ],
  });
  if (w === 'edit') {
    const t = await textDialog({ titel: 'Notiz bearbeiten', label: 'Notiz', wert: e.text, mehrzeilig: true });
    if (t === null) return;
    e.text = t.trim();
    await speichere(); screen.refresh(); sprache.sage('Notiz geaendert.');
  } else if (w === 'del') {
    eintraege.splice(i, 1);
    await speichere(); screen.refresh(); sprache.sage('Notiz geloescht.');
  }
}

/** Notizen zu einem Charakter (tagebuch-artig: schnell etwas festhalten). */
export function charNotizScreen(name) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const eintraege = charNotizen(a, name);
      this.title = `Notizen zu ${name}, ${eintraege.length}`;
      const items = [
        { label: 'Neue Notiz', hint: 'schnell etwas zu diesem Charakter festhalten', onSelect: async () => {
            const t = await textDialog({ titel: `Notiz zu ${name}`, label: 'Notiz', mehrzeilig: true });
            if (t === null || !t.trim()) return;
            eintraege.unshift({ text: t.trim(), spieltag: a.spieltag || 1 });
            await speichere(); screen.refresh(); sprache.sage('Notiz gespeichert.');
          } },
      ];
      eintraege.forEach((e, i) => items.push({
        label: `Spieltag ${e.spieltag || 1}: ${e.text}`,
        hint: 'Enter: bearbeiten oder loeschen',
        detail: e.text,
        onSelect: () => bearbeiteNotiz(a, name, i),
      }));
      return menuScreen({ title: this.title, subtitle: 'Neueste oben. Escape zurueck.', items, leer: 'Noch keine Notiz.' }).build();
    },
  };
}

/**
 * Charakteransicht "Meine Initiative-Phase": der Meister waehlt einen Helden und
 * sieht dessen Spieler-Ansicht der Initiative-Phase (wie am Abenteuertisch F1) —
 * Wuerfelbecher, Kaempfen, Manoever, Zauber, Zauberspeicher. Dazu wird der Bogen
 * kurz als TRANSIENTER Abenteuer-Kontext gesetzt; es wird NICHTS gespeichert und
 * der Kontext beim Verlassen wieder geloescht (siehe abenteuer/state.js: _transient).
 */
export function charAnsichtInitiativeScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Charakteransicht, ${a.charaktere.length}`;
      const items = (a.charaktere || []).map(c => ({
        label: c.name,
        hint: 'Meine Initiative-Phase dieses Charakters ansehen',
        onSelect: () => oeffneInitiative(c),
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet die Initiative-Phase des Charakters. Escape zurueck.',
        items,
        leer: 'Noch keine Helden in der Gruppe. Erst unter Gruppenzusammenstellung hinzufuegen.',
      }).build();
    },
    onShow() { sprache.sage('Charakteransicht. Enter oeffnet die Initiative-Phase eines Helden.'); },
  };
}

function oeffneInitiative(c) {
  // Transienter Abenteuer-Kontext nur zum Ansehen: der Bogen als Charakter, keine
  // Persistenz. speichere() in abenteuer/state.js bricht bei _transient ab.
  setAbenteuer({
    name: `Ansicht ${c.name}`, charakter: c.bogen,
    ressourcen: {}, inventar: { geldboerse: {}, rucksack: [], guertel: [] },
    journal: [], protokoll: [], mitspieler: [], zauberspeicher: [], _transient: true,
  });
  setDb(getDb());
  setVerdeckt(true); // Wuerfe in dieser Ansicht sind verdeckte Meister-Wuerfe
  const scr = liveSpielScreen();
  // Beim Verlassen der Initiative-Phase den transienten Kontext + Verdeckt-Modus
  // wieder loeschen. onBack MUSS true liefern, sonst blockiert der Waechter.
  const origBack = scr.onBack;
  scr.onBack = () => { setVerdeckt(false); setAbenteuer(null); return origBack ? origBack() : true; };
  screen.push(scr);
}

/** Notizen-Menue: je Charakter ein Eintrag, darin die tagebuch-artigen Notizen. */
export function notizenMenuScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Notizen, ${(a.charaktere || []).length}`;
      const items = (a.charaktere || []).map(c => ({
        label: c.name,
        hint: 'Notizen zu diesem Charakter',
        onSelect: () => screen.push(charNotizScreen(c.name)),
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter oeffnet die Notizen eines Helden. Escape zurueck.',
        items,
        leer: 'Noch keine Helden in der Gruppe. Erst unter Gruppenzusammenstellung hinzufuegen.',
      }).build();
    },
    onShow() { sprache.sage('Notizen. Waehle einen Charakter.'); },
  };
}

/**
 * F4: Charakteransicht (Initiative-Phase), Charakterboegen und Notizen.
 * Die Vitalitaet steht am Spieltisch-Kampf und ist hier bewusst nicht mehr doppelt.
 */
export function spielerinfosScreen() {
  const items = [
    { label: 'Postkasten', hint: 'Meisterpost: Verbindung, versenden, Posteingang', onSelect: () => screen.push(postkastenScreen()) },
    { label: 'Charakteransicht meine Initiativephase', hint: 'die Initiative-Phase eines Helden ansehen (wie am Spielertisch)', onSelect: () => screen.push(charAnsichtInitiativeScreen()) },
    { label: 'Charakterboegen', hint: 'die Boegen der Gruppe zum Nachlesen', onSelect: () => screen.push(charakterboegenScreen()) },
    { label: 'Notizen und Postablage', hint: 'je Charakter Notizen; hierhin verschiebst du Post', onSelect: () => screen.push(notizenMenuScreen()) },
  ];
  return menuScreen({
    title: 'Postkasten, Charakteransicht und Notizen',
    subtitle: 'Postkasten, Charakteransicht, Boegen und Notizen. Escape zurueck.',
    items,
  });
}
