/**
 * Skularis — Editor-Bereich: Ausrüstung
 *
 * Gegliedert in drei Bereiche, jeder nach demselben Muster aufgebaut:
 *   Waffen       hinzufügen, Waffenliste, Setverwaltung
 *   Rüstung      hinzufügen, Rüstungsliste, Setverwaltung
 *   Gegenstände  hinzufügen, Liste, Inventar am Mann, Inventar im Rucksack
 *
 * Sets und Inventarorte werden Sephrasto-verträglich in der Ausrüstungsliste
 * abgelegt, siehe core/ausruestung.js.
 *
 * Eigene Waffen entstehen immer aus einem Datenbankeintrag, den man danach
 * umbenennt und in den Werten anpasst: Sephrasto verwirft beim Laden jede
 * Waffe, deren id es nicht kennt. Rüstungen dürfen dagegen frei erfunden werden.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { aktionZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { textDialog, jaNeinDialog, zahlDialog } from '../ui/dialog.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { waffenwerte, waffenwerteText, waffenKurz } from '../core/regeln.js';
import { waffenErklaerung, ruestungTooltip } from '../daten/ausruestung-texte.js';
import {
  leseInventar, aendereInventar, ergaenzeSets, setText, istFernkampf,
  SLOTS, SET_WAFFENLOS, ORT_MANN, ORT_RUCKSACK,
} from '../core/ausruestung.js';

// --- Hilfen --------------------------------------------------------------

/** Kampfstile, die diese Waffe zulässt und die der Charakter auch hat. */
function kampfstileFuer(char, db, waffe) {
  const def = db.waffen.find(x => x.name === (waffe.id || waffe.name)) || {};
  const erlaubt = String(def.kampfstile || '').split(',').map(s => s.trim()).filter(Boolean);
  const haben = new Set((char.vorteile || []).map(v => (typeof v === 'string' ? v : v.name)));
  // Ein Stil zählt, sobald irgendeine Stufe davon gekauft ist, etwa
  // "Schildkampf I" für den Stil "Schildkampf".
  return erlaubt.filter(stil => [...haben].some(n => n === stil || n.startsWith(stil + ' ')));
}

/** Was ein Kampfstil an dieser Waffe bewirkt. */
function stilDetail(char, stil) {
  const m = (char.kampfstilMods || {})[stil];
  if (!m) return `${stil}. Wirkt erst mit dem passenden Vorteil.`;
  const teile = [];
  for (const [beschriftung, wert] of [['Attacke', m.at], ['Verteidigung', m.vt],
    ['Schaden', m.tp], ['Reichweite', m.rw], ['Behinderung', m.be]]) {
    if (wert) teile.push(`${beschriftung} ${wert > 0 ? 'plus' : 'minus'} ${Math.abs(wert)}`);
  }
  return teile.length ? `${stil}: ${teile.join(', ')}.` : `${stil}, ohne Werteänderung.`;
}

function waffeAusDb(w) {
  return {
    name: w.name, id: w.name,
    kampfstil: 'Kein Kampfstil',
    wuerfel: parseInt(w['würfel'], 10) || 0,
    wuerfelSeiten: parseInt(w['würfelSeiten'], 10) || 6,
    plus: parseInt(w.plus, 10) || 0,
    eigenschaften: '',
    haerte: parseInt(w['härte'], 10) || 6,
    rw: parseInt(w.rw, 10) || 0,
    wm: parseInt(w.wm, 10) || 0,
    typ: (w.fk === '1' || w.fk === 1) ? 'Fern' : 'Nah',
  };
}

function ruestungAusDb(r) {
  const zonen = ['rsBeine', 'rsLArm', 'rsRArm', 'rsBauch', 'rsBrust', 'rsKopf']
    .map(z => parseInt(r[z], 10) || 0);
  return { name: r.name, be: 0, rs: zonen.join('/') };
}

/** Rückfrage "Anlegen oder ins Inventar". */
function frageAnlegen(was) {
  return jaNeinDialog({
    titel: 'Wohin damit',
    frage: `${was}: anlegen oder ins Inventar legen?`,
    jaLabel: 'Anlegen', neinLabel: 'Ins Inventar',
  });
}

// --- Einstieg ------------------------------------------------------------

export function ausruestungScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      char.waffen = char.waffen || [];
      char.ruestungen = char.ruestungen || [];
      char.ausruestung = char.ausruestung || [];
      const inv = leseInventar(char);

      this.title = `Ausrüstung, ${char.waffen.length} Waffen, ${char.ruestungen.length} Rüstungen, `
        + `${inv.gegenstaende.length} Gegenstände`;

      return menuScreen({
        title: this.title,
        subtitle: 'Pfeiltasten wählen, Eingabetaste öffnet, Escape zurück.',
        filter: false,
        items: [
          {
            label: `Waffen, ${char.waffen.length}`,
            hint: 'Kaufen, Liste, Setverwaltung',
            detail: 'Waffen kaufen oder aus einer Vorlage selbst gestalten, die eigene Waffenliste '
              + 'pflegen und Sets für Haupthand, Nebenhand und Fernkampf zusammenstellen.',
            onSelect: () => screen.push(waffenScreen()),
          },
          {
            label: `Rüstung, ${char.ruestungen.length}`,
            hint: 'Kaufen, Liste, Setverwaltung',
            detail: 'Rüstungen kaufen oder frei anlegen, Behinderung eintragen und zu Sets '
              + 'zusammenstellen.',
            onSelect: () => screen.push(ruestungScreen()),
          },
          {
            label: `Gegenstände, ${inv.gegenstaende.length}`,
            hint: 'Kaufen, Liste, am Mann und im Rucksack',
            detail: 'Alles Übrige. Jeder Gegenstand liegt entweder am Mann oder im Rucksack.',
            onSelect: () => screen.push(gegenstaendeScreen()),
          },
        ],
      }).build();
    },
  };
}

// --- Waffen --------------------------------------------------------------

function waffenScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      // Sets in Ordnung halten: Waffenlos gibt es immer, und jede Waffe, die
      // noch in keinem Set steht, bekommt eines.
      ergaenzeSets(char, db);
      const inv = leseInventar(char);
      this.title = `Waffen, ${char.waffen.length} vorhanden, ${inv.waffenSets.length} Sets`;

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zur Ausrüstung.',
        filter: false,
        items: [
          {
            label: 'Waffe kaufen oder selbst gestalten',
            hint: 'Aus der Waffen-Datenbank, danach frei anpassbar',
            detail: 'Jede eigene Waffe entsteht aus einem Datenbankeintrag. Danach kannst du sie '
              + 'umbenennen und ihre Werte ändern. Das ist keine Einschränkung von Skularis: '
              + 'Sephrasto verwirft beim Laden jede Waffe, die es in seiner Datenbank nicht findet.',
            onSelect: () => waffeHinzufuegen(),
          },
          {
            label: `Waffenliste, ${char.waffen.length}`,
            hint: 'Alle gekauften Waffen, ansehen und ändern',
            onSelect: () => screen.push(waffenlisteScreen()),
          },
          {
            label: `Setverwaltung, ${inv.waffenSets.length} Sets`,
            hint: 'Haupthand, Nebenhand, Fernkampf',
            detail: 'Ein Set fasst zusammen, was du gleichzeitig führst. Am Spieltisch stehen die '
              + 'Sets einzeln mit ihren Kampfwerten. Das Set Waffenlos gibt es immer.',
            onSelect: () => screen.push(waffensetsScreen()),
          },
        ],
      }).build();
    },
  };
}

function waffeHinzufuegen() {
  const char = editor.getChar();
  const db = editor.getDb();
  const eintraege = db.waffen.filter(w => w.name).map(w => ({
    label: w.name,
    wert: w.name,
    detail: `${w.name}. Schaden ${w['würfel'] || 0} W ${w['würfelSeiten'] || 6} plus ${w.plus || 0}, `
      + `Reichweite ${w.rw || 0}, Härte ${w['härte'] || 0}. Fertigkeit ${w.fertigkeit || 'keine'}, `
      + `Talent ${w.talent || 'keines'}. ${waffenErklaerung(w.name, w.talent)}`,
  }));
  auswahlScreen({
    titel: 'Waffe wählen',
    eintraege,
    onWahl: async (val) => {
      if (!await jaNeinDialog({ titel: 'Hinzufügen', frage: `Waffe ${val} wirklich hinzufügen?` })) return;
      const neu = waffeAusDb(db.waffen.find(x => x.name === val));
      char.waffen.push(neu);

      const anlegen = await frageAnlegen(`Waffe ${val}`);
      if (anlegen) {
        const neueSets = ergaenzeSets(char, db);
        sprache.sage(`Waffe ${val} hinzugefügt und angelegt.`
          + (neueSets.length ? ` ${neueSets.join(' und ')} angelegt.` : ''));
      } else {
        sprache.sage(`Waffe ${val} hinzugefügt, liegt im Inventar.`);
      }
      editor.aktualisiere();
      screen.refresh();
    },
  });
}

function waffenlisteScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      this.title = `Waffenliste, ${char.waffen.length}`;

      const items = char.waffen.map((w) => {
        const k = waffenwerte(char, db, w);
        return {
          label: `${w.name}, Attacke ${k.at === null ? 'nicht möglich' : k.at}`
            + `, Verteidigung ${k.vt === null ? 'nicht möglich' : k.vt}`,
          hint: istFernkampf(db, w) ? 'Fernkampf' : 'Nahkampf',
          detail: waffenwerteText(char, db, w),
          onSelect: () => screen.push(waffeScreen(w)),
        };
      });

      return menuScreen({
        title: this.title,
        subtitle: 'Eingabetaste öffnet eine Waffe zum Ändern. Escape zurück.',
        items,
        leer: 'Noch keine Waffen gekauft.',
      }).build();
    },
  };
}

/** Eine einzelne Waffe: umbenennen, Werte anpassen, Kampfstil, entfernen. */
function waffeScreen(w) {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      this.title = `Waffe ${w.name}`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(w.name));
      wrap.appendChild(infoZeile(waffenKurz(char, db, w),
        `Vorlage aus der Datenbank: ${w.id || w.name}. Diese Vorlage bleibt erhalten, damit `
        + 'Sephrasto die Waffe beim Laden wiederfindet. Name und Werte darfst du frei ändern.'));

      const zahl = (beschriftung, feld, min, max) => aktionZeile(
        `${beschriftung}: ${w[feld] || 0}`,
        async () => {
          const v = await zahlDialog({ titel: beschriftung, label: beschriftung, wert: w[feld] || 0, min, max });
          if (v === null) return;
          w[feld] = v;
          editor.aktualisiere(); screen.refresh(); sprache.sage(`${beschriftung} ${v}.`);
        }, `${beschriftung} ändern`);

      wrap.appendChild(aktionZeile(`Name: ${w.name}`, async () => {
        const v = await textDialog({ titel: 'Name der Waffe', label: 'Name', wert: w.name });
        if (v === null || !v.trim()) return;
        w.name = v.trim();
        editor.aktualisiere(); screen.refresh(); sprache.sage(`Name ${w.name}.`);
      }, 'Waffe umbenennen', 'Der Anzeigename. Die Vorlage aus der Datenbank bleibt davon unberührt.'));

      wrap.appendChild(zahl('Anzahl Würfel', 'wuerfel', 0, 20));
      wrap.appendChild(zahl('Würfelseiten', 'wuerfelSeiten', 2, 100));
      wrap.appendChild(zahl('Schadensbonus der Waffe', 'plus', -20, 40));
      wrap.appendChild(zahl('Härte', 'haerte', 0, 30));
      wrap.appendChild(zahl('Reichweite', 'rw', 0, 20));
      wrap.appendChild(zahl('Waffenmodifikator', 'wm', -10, 10));

      const moeglich = kampfstileFuer(char, db, w);
      const stilJetzt = w.kampfstil && w.kampfstil !== 'Kein Kampfstil' ? w.kampfstil : 'keiner';
      if (moeglich.length) {
        wrap.appendChild(aktionZeile(`Kampfstil: ${stilJetzt}`, () => {
          auswahlScreen({
            titel: `Kampfstil für ${w.name}`,
            eintraege: [{ label: 'Kein Kampfstil', wert: 'Kein Kampfstil' },
              ...moeglich.map(s => ({ label: s, wert: s, detail: stilDetail(char, s) }))],
            onWahl: (val) => {
              w.kampfstil = val;
              editor.aktualisiere(); screen.refresh();
              sprache.sage(`Kampfstil ${val === 'Kein Kampfstil' ? 'entfernt' : val}.`);
            },
          });
        }, 'Kampfstil wählen', `Die Waffe erlaubt: ${moeglich.join(', ')}.`));
      } else {
        wrap.appendChild(infoZeile(`Kampfstil: ${stilJetzt}`,
          'Für diese Waffe steht dir kein Kampfstil zur Verfügung. Ein Kampfstil ist ein Vorteil, '
          + 'zum Beispiel Schildkampf oder Beidhändiger Kampf. Sobald du einen davon im Bereich '
          + 'Vorteile kaufst und die Waffe ihn zulässt, kannst du ihn hier einstellen.'));
      }

      wrap.appendChild(aktionZeile(`${w.name} entfernen`, async () => {
        if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Waffe ${w.name} wirklich entfernen?` })) return;
        char.waffen = char.waffen.filter(x => x !== w);
        aendereInventar(char, (m) => {
          for (const s of m.waffenSets) {
            for (const slot of ['haupthand', 'nebenhand', 'fernkampf']) {
              if (s[slot] === w.name) s[slot] = '';
            }
          }
        });
        editor.aktualisiere();
        screen.pop();
        sprache.sage(`Waffe ${w.name} entfernt.`);
      }, 'Waffe entfernen', 'Die Waffe verschwindet auch aus allen Sets.'));

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

function waffensetsScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const inv = leseInventar(char);
      this.title = `Waffensets, ${inv.waffenSets.length}`;

      const items = [{
        label: 'Neues Set anlegen',
        hint: 'Name eingeben, danach die Plätze belegen',
        onSelect: async () => {
          const name = await textDialog({ titel: 'Neues Waffenset', label: 'Name des Sets' });
          if (name === null || !name.trim()) return;
          aendereInventar(char, (m) => {
            m.waffenSets.push({ name: name.trim(), haupthand: '', nebenhand: '', fernkampf: '' });
          });
          screen.refresh();
          sprache.sage(`Set ${name.trim()} angelegt.`);
        },
      }];

      inv.waffenSets.forEach((set, i) => {
        items.push({
          label: `${set.name}, ${setText(set)}`,
          hint: set.name === SET_WAFFENLOS ? 'fester Eintrag' : 'öffnen und belegen',
          detail: `${set.name}. ${setText(set)}. Am Spieltisch stehen alle Sets mit ihren `
            + 'Kampfwerten untereinander.',
          onSelect: () => screen.push(waffensetScreen(i)),
        });
      });

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zu den Waffen.',
        items,
      }).build();
    },
  };
}

function waffensetScreen(index) {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const inv = leseInventar(char);
      const set = inv.waffenSets[index];
      if (!set) { screen.pop(); return document.createElement('div'); }
      this.title = `Set ${set.name}`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(set.name));
      wrap.appendChild(infoZeile(setText(set),
        'Haupthand und Nebenhand sind die Waffen, die du gleichzeitig führst. Der Fernkampfplatz '
        + 'ist für Bogen, Armbrust oder Wurfwaffen. Ein leerer Platz bedeutet freie Hand.'));

      for (const slot of SLOTS) {
        const feld = slot.toLowerCase();
        wrap.appendChild(aktionZeile(`${slot}: ${set[feld] || 'frei'}`, () => {
          const passend = char.waffen.filter(w => (slot === 'Fernkampf')
            === istFernkampf(db, w));
          auswahlScreen({
            titel: `${slot} belegen`,
            eintraege: [{ label: 'Platz frei lassen', wert: '' },
              ...passend.map(w => ({
                label: w.name,
                wert: w.name,
                detail: waffenwerteText(char, db, w),
              }))],
            onWahl: (val) => {
              aendereInventar(char, (m) => { m.waffenSets[index][feld] = val; });
              screen.refresh();
              sprache.sage(`${slot} ${val || 'frei'}.`);
            },
          });
        }, `${slot} belegen`));
      }

      if (set.name !== SET_WAFFENLOS) {
        wrap.appendChild(aktionZeile(`Set ${set.name} umbenennen`, async () => {
          const v = await textDialog({ titel: 'Set umbenennen', label: 'Name', wert: set.name });
          if (v === null || !v.trim()) return;
          aendereInventar(char, (m) => { m.waffenSets[index].name = v.trim(); });
          screen.refresh(); sprache.sage(`Set heißt jetzt ${v.trim()}.`);
        }, 'Set umbenennen'));

        wrap.appendChild(aktionZeile(`Set ${set.name} entfernen`, async () => {
          if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Set ${set.name} wirklich entfernen? Die Waffen bleiben erhalten.` })) return;
          aendereInventar(char, (m) => { m.waffenSets.splice(index, 1); });
          screen.pop(); sprache.sage(`Set ${set.name} entfernt.`);
        }, 'Set entfernen', 'Nur die Zusammenstellung verschwindet, die Waffen bleiben in der Liste.'));
      }

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

// --- Rüstung -------------------------------------------------------------

function ruestungScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      this.title = `Rüstung, ${char.ruestungen.length} vorhanden, ${inv.ruestungsSets.length} Sets`;

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zur Ausrüstung.',
        filter: false,
        items: [
          {
            label: 'Rüstung kaufen oder selbst anlegen',
            hint: 'Aus der Liste wählen oder frei anlegen',
            detail: 'Rüstungen dürfen frei erfunden werden. Nach der Wahl fragt Skularis, wohin '
              + 'die Rüstung soll.',
            onSelect: () => ruestungHinzufuegen(),
          },
          {
            label: `Rüstungsliste, ${char.ruestungen.length}`,
            hint: 'Zonen und Behinderung ändern',
            onSelect: () => screen.push(ruestungslisteScreen()),
          },
          {
            label: `Setverwaltung, ${inv.ruestungsSets.length} Sets`,
            hint: 'Rüstungsteile zusammenstellen',
            onSelect: () => screen.push(ruestungssetsScreen()),
          },
        ],
      }).build();
    },
  };
}

function ruestungHinzufuegen() {
  const char = editor.getChar();
  const db = editor.getDb();
  const eintraege = [
    { label: 'Eigene Rüstung anlegen', wert: '__eigene',
      detail: 'Name, Zonenwerte und Behinderung selbst eintragen.' },
    ...db.ruestungen.filter(r => r.name).map(r => ({
      label: r.name,
      wert: r.name,
      detail: ruestungTooltip(r),
    })),
  ];
  auswahlScreen({
    titel: 'Rüstung wählen',
    eintraege,
    onWahl: async (val) => {
      let neu;
      if (val === '__eigene') {
        const name = await textDialog({ titel: 'Eigene Rüstung', label: 'Name der Rüstung' });
        if (name === null || !name.trim()) return;
        const zonen = await textDialog({
          titel: 'Rüstungsschutz', wert: '0/0/0/0/0/0',
          label: 'Sechs Zonen mit Schrägstrich getrennt, Beine, linker Arm, rechter Arm, Bauch, Brust, Kopf',
        });
        if (zonen === null) return;
        neu = { name: name.trim(), be: 0, rs: zonen.trim() || '0/0/0/0/0/0' };
      } else {
        if (!await jaNeinDialog({ titel: 'Hinzufügen', frage: `Rüstung ${val} wirklich hinzufügen?` })) return;
        neu = ruestungAusDb(db.ruestungen.find(x => x.name === val));
      }

      const be = await zahlDialog({
        titel: 'Behinderung festlegen',
        label: 'Behinderung, laut Rüstungstabelle im Regelwerk',
        wert: 0, min: 0, max: 20,
      });
      if (be === null) return;
      neu.be = be;

      char.ruestungen.push(neu);
      const anlegen = await frageAnlegen(`Rüstung ${neu.name}`);
      if (anlegen) {
        aendereInventar(char, (m) => {
          let set = m.ruestungsSets[0];
          if (!set) { set = { name: 'Rüstungsset 1', teile: [] }; m.ruestungsSets.push(set); }
          if (!set.teile.includes(neu.name)) set.teile.push(neu.name);
        });
      }
      editor.aktualisiere();
      screen.refresh();
      sprache.sage(`Rüstung ${neu.name} hinzugefügt, Behinderung ${be}`
        + (anlegen ? ', angelegt.' : ', im Inventar.'));
    },
  });
}

function ruestungslisteScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      this.title = `Rüstungsliste, ${char.ruestungen.length}`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Rüstungsliste'));
      if (!char.ruestungen.length) wrap.appendChild(infoZeile('Noch keine Rüstung vorhanden.'));

      for (const r of [...char.ruestungen]) {
        const info = `Rüstungsschutz-Zonen ${r.rs}, Behinderung ${r.be}. `
          + 'Die Zonen sind Beine, linker Arm, rechter Arm, Bauch, Brust, Kopf. Der Gesamtschutz '
          + 'ist ihr gerundeter Mittelwert und geht in die Wundschwelle ein. Die Behinderung '
          + 'senkt die Geschwindigkeit um sich selbst und das Durchhaltevermögen um das Doppelte.';

        wrap.appendChild(infoZeile(`${r.name}, Zonen ${r.rs}, Behinderung ${r.be}`, info));

        wrap.appendChild(aktionZeile(`Behinderung von ${r.name}: ${r.be}`, async () => {
          const wert = await zahlDialog({
            titel: `Behinderung ${r.name}`, label: 'Behinderung', wert: r.be || 0, min: 0, max: 20,
          });
          if (wert === null) return;
          r.be = wert;
          editor.aktualisiere(); screen.refresh(); sprache.sage(`Behinderung ${wert}.`);
        }, 'Behinderung ändern'));

        wrap.appendChild(aktionZeile(`${r.name} entfernen`, async () => {
          if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Rüstung ${r.name} wirklich entfernen?` })) return;
          char.ruestungen = char.ruestungen.filter(x => x !== r);
          aendereInventar(char, (m) => {
            for (const s of m.ruestungsSets) s.teile = s.teile.filter(t => t !== r.name);
          });
          editor.aktualisiere(); screen.refresh(); sprache.sage(`Rüstung ${r.name} entfernt.`);
        }, 'Rüstung entfernen'));
      }

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

function ruestungssetsScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      this.title = `Rüstungssets, ${inv.ruestungsSets.length}`;

      const items = [{
        label: 'Neues Rüstungsset anlegen',
        onSelect: async () => {
          const name = await textDialog({ titel: 'Neues Rüstungsset', label: 'Name des Sets' });
          if (name === null || !name.trim()) return;
          aendereInventar(char, (m) => { m.ruestungsSets.push({ name: name.trim(), teile: [] }); });
          screen.refresh(); sprache.sage(`Set ${name.trim()} angelegt.`);
        },
      }];

      inv.ruestungsSets.forEach((set, i) => {
        items.push({
          label: `${set.name}, ${set.teile.length ? set.teile.join(', ') : 'noch leer'}`,
          hint: 'öffnen und Teile zuordnen',
          onSelect: () => screen.push(ruestungssetScreen(i)),
        });
      });

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zur Rüstung.',
        items,
      }).build();
    },
  };
}

function ruestungssetScreen(index) {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      const set = inv.ruestungsSets[index];
      if (!set) { screen.pop(); return document.createElement('div'); }
      this.title = `Rüstungsset ${set.name}`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(set.name));
      wrap.appendChild(infoZeile(set.teile.length ? set.teile.join(', ') : 'Noch keine Teile zugeordnet.',
        'Ein Rüstungsset fasst zusammen, was du gleichzeitig trägst. Für die Werte zählt in Ilaris '
        + 'die erste angelegte Rüstung.'));

      for (const r of char.ruestungen) {
        const drin = set.teile.includes(r.name);
        wrap.appendChild(aktionZeile(
          `${drin ? 'Enthalten' : 'Nicht enthalten'}: ${r.name}`,
          () => {
            aendereInventar(char, (m) => {
              const s = m.ruestungsSets[index];
              s.teile = drin ? s.teile.filter(t => t !== r.name) : [...s.teile, r.name];
            });
            screen.refresh();
            sprache.sage(`${r.name} ${drin ? 'aus dem Set genommen' : 'ins Set gelegt'}.`);
          },
          drin ? 'aus dem Set nehmen' : 'ins Set legen',
          `${r.name}, Zonen ${r.rs}, Behinderung ${r.be}.`,
        ));
      }

      wrap.appendChild(aktionZeile(`Set ${set.name} entfernen`, async () => {
        if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Set ${set.name} wirklich entfernen? Die Rüstungen bleiben erhalten.` })) return;
        aendereInventar(char, (m) => { m.ruestungsSets.splice(index, 1); });
        screen.pop(); sprache.sage(`Set ${set.name} entfernt.`);
      }, 'Set entfernen'));

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

// --- Gegenstände ---------------------------------------------------------

function gegenstaendeScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      const amMann = inv.gegenstaende.filter(g => g.ort === ORT_MANN);
      const imRucksack = inv.gegenstaende.filter(g => g.ort === ORT_RUCKSACK);
      this.title = `Gegenstände, ${inv.gegenstaende.length}`;

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zur Ausrüstung.',
        filter: false,
        items: [
          {
            label: 'Gegenstand hinzufügen',
            hint: 'Bezeichnung eingeben, dann am Mann oder in den Rucksack',
            onSelect: () => gegenstandHinzufuegen(),
          },
          {
            label: `Gegenstandsliste, ${inv.gegenstaende.length}`,
            hint: 'Ort wechseln oder entfernen',
            onSelect: () => screen.push(gegenstandslisteScreen()),
          },
          {
            label: `Inventar am Mann, ${amMann.length}`,
            hint: 'Was der Charakter bei sich trägt',
            onSelect: () => screen.push(inventarScreen(ORT_MANN)),
          },
          {
            label: `Inventar im Rucksack, ${imRucksack.length}`,
            hint: 'Was verstaut ist',
            onSelect: () => screen.push(inventarScreen(ORT_RUCKSACK)),
          },
        ],
      }).build();
    },
  };
}

/** Nach dem Anlegen: wohin damit? Zwei Schaltflächen, keine Ja-Nein-Frage. */
function frageOrt(was) {
  return jaNeinDialog({
    titel: 'Wohin damit',
    frage: `Wo soll ${was} hin?`,
    jaLabel: 'Am Mann', neinLabel: 'In den Rucksack',
  });
}

async function gegenstandHinzufuegen() {
  const char = editor.getChar();
  const text = await textDialog({ titel: 'Gegenstand', label: 'Bezeichnung' });
  if (text === null || !text.trim()) return;
  const amMann = await frageOrt(text.trim());
  aendereInventar(char, (m) => {
    m.gegenstaende.push({ text: text.trim(), ort: amMann ? ORT_MANN : ORT_RUCKSACK });
  });
  screen.refresh();
  sprache.sage(`${text.trim()} liegt jetzt ${amMann ? 'am Mann' : 'im Rucksack'}.`);
}

/** Eine Zeile je Gegenstand; die Eingabetaste öffnet sein Untermenü. */
function gegenstandsEintrag(char, g, index) {
  const ortText = g.ort === ORT_MANN ? 'am Mann' : 'im Rucksack';
  return {
    label: `${g.text}, ${ortText}`,
    hint: 'öffnen: verschieben, umbenennen, löschen',
    detail: `${g.text}, ${ortText}. Die Eingabetaste öffnet die Auswahl zum Verschieben, `
      + 'Umbenennen und Löschen.',
    onSelect: () => screen.push(gegenstandScreen(index)),
  };
}

/**
 * Untermenü eines Gegenstands: verschieben, umbenennen, löschen.
 * Der Gegenstand wird über seine Position in der Gesamtliste angesprochen und
 * bei jedem Aufbau neu gelesen, damit nichts veraltet.
 */
function gegenstandScreen(index) {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      const g = inv.gegenstaende[index];
      if (!g) { screen.pop(); return document.createElement('div'); }

      const amMann = g.ort === ORT_MANN;
      const ortText = amMann ? 'am Mann' : 'im Rucksack';
      const zielText = amMann ? 'in den Rucksack' : 'an den Mann';
      this.title = `${g.text}, ${ortText}`;

      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurück zur Liste.',
        filter: false,
        items: [
          {
            label: `Verschieben ${zielText}`,
            hint: `liegt zurzeit ${ortText}`,
            detail: `${g.text} liegt ${ortText} und wandert damit ${zielText}.`,
            onSelect: () => {
              aendereInventar(char, (m) => {
                m.gegenstaende[index].ort = amMann ? ORT_RUCKSACK : ORT_MANN;
              });
              screen.refresh();
              sprache.sage(`${g.text} liegt jetzt ${amMann ? 'im Rucksack' : 'am Mann'}.`);
            },
          },
          {
            label: 'Umbenennen',
            hint: 'Bezeichnung ändern',
            onSelect: async () => {
              const v = await textDialog({ titel: 'Gegenstand umbenennen', label: 'Bezeichnung', wert: g.text });
              if (v === null || !v.trim()) return;
              aendereInventar(char, (m) => { m.gegenstaende[index].text = v.trim(); });
              screen.refresh();
              sprache.sage(`Heißt jetzt ${v.trim()}.`);
            },
          },
          {
            label: 'Löschen',
            hint: 'aus dem Inventar entfernen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Löschen', frage: `${g.text} wirklich löschen?` })) return;
              aendereInventar(char, (m) => { m.gegenstaende.splice(index, 1); });
              screen.pop();
              sprache.sage(`${g.text} gelöscht.`);
            },
          },
        ],
      }).build();
    },
  };
}

function gegenstandslisteScreen() {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      this.title = `Gegenstandsliste, ${inv.gegenstaende.length}`;

      return menuScreen({
        title: this.title,
        subtitle: 'Eingabetaste öffnet einen Gegenstand. Escape zurück.',
        items: inv.gegenstaende.map((g, i) => gegenstandsEintrag(char, g, i)),
        leer: 'Noch keine Gegenstände.',
      }).build();
    },
  };
}

/** Inventar an einem Ort. Jeder Gegenstand hat dasselbe Untermenü wie in der Liste. */
function inventarScreen(ort) {
  const titel = ort === ORT_MANN ? 'Inventar am Mann' : 'Inventar im Rucksack';
  return {
    title: titel,
    build() {
      const char = editor.getChar();
      const inv = leseInventar(char);
      // Die Position in der Gesamtliste mitführen, damit das Untermenü den
      // richtigen Gegenstand trifft.
      const eintraege = inv.gegenstaende
        .map((g, i) => ({ g, i }))
        .filter(x => x.g.ort === ort);

      return menuScreen({
        title: `${titel}, ${eintraege.length}`,
        subtitle: 'Eingabetaste öffnet einen Gegenstand. Escape zurück.',
        items: eintraege.map(x => gegenstandsEintrag(char, x.g, x.i)),
        leer: ort === ORT_MANN ? 'Nichts am Mann.' : 'Der Rucksack ist leer.',
      }).build();
    },
  };
}
