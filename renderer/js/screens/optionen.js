/**
 * Skularis — Optionen (Sound, Schrift, Über Skularis).
 * Ergänzt die Barrierefreiheits-Box oben rechts um ein volles Menü.
 * Der Updater ist ein eigenes Werkzeug (Skularis Updaten) neben dem
 * Programmordner — deshalb gibt es hier keinen Update-Knopf mehr.
 */

import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import * as screen from '../ui/screen.js';
import * as einstellungen from './../daten/einstellungen.js';
import * as shortcuts from '../shortcuts.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog } from '../ui/dialog.js';

// "Über Skularis" — jede Zeile ist mit Pfeiltasten einzeln lesbar. Die
// Versionszeile kommt aus der App (VERSION), der Rest steht hier.
const UEBER_ZEILEN = [
  'Entwickler: Sku',
  'Skularis ist ein Werkzeug, um Charaktere nach dem Regelwerk Ilaris zu erstellen.',
  'Mit dem Abenteuer-Tisch und dem Meister-Tisch stehen beim Spielen Umgebungen bereit, in denen Regeln, Charakter- und Abenteuerinformationen sowie ergänzende Funktionen leicht und barrierefrei erreichbar sind.',
  'Ziel von Skularis ist es, Rollenspielrunden während des Spiels bestmöglich zu unterstützen. Der Entwickler legt besonderen Wert auf vollständige Barrierefreiheit und darauf, die Informationen so bereitzustellen, dass flüssiges und immersives Spielen möglich wird.',
  'Skularis ist ein Fanprojekt und befindet sich in Entwicklung.',
  'Grundlage ist das freie Fan-Regelwerk Ilaris, das kostenlos genutzt werden darf.',
  'Rechtliches:',
  'Skularis ist eine inoffizielle, nichtkommerzielle Fan-Spielhilfe und steht in keiner offiziellen Verbindung zu Ulisses Spiele.',
  'DAS SCHWARZE AUGE, AVENTURIEN und die zugehörigen Namen und Logos sind eingetragene Marken der Ulisses Spiele GmbH. Ihre Nennung erfolgt im Rahmen der Ulisses-Fanrichtlinie und ohne kommerzielle Absicht.',
  'Grundlage ist das freie Fan-Regelwerk Ilaris, Copyright Ulisses Spiele GmbH, das kostenlos genutzt werden darf. Regeltexte und Daten stammen aus Ilaris und dem offenen Werkzeug Sephrasto.',
  'Inhalte können von offiziellen Publikationen abweichen.',
];

async function zeigeUeber() {
  let version = '';
  try {
    const info = await window.skularis.ipc.appInfo();
    if (info && info.version) version = String(info.version).replace(/^Skularis\s*/i, '');
  } catch (_e) { /* ohne Versionsnummer weiter */ }

  const zeilen = [version ? `Skularis, Version ${version}` : 'Skularis', ...UEBER_ZEILEN];
  screen.push(menuScreen({
    title: 'Über Skularis',
    subtitle: 'Pfeiltasten lesen Zeile für Zeile. Escape kehrt zurück.',
    items: zeilen.map(z => ({ label: z, onSelect: () => {} })),
    filter: false,
  }));
}

// "Neuerungen" — die Patchnotes aus dem Programmordner, Absatz für Absatz mit
// Pfeiltasten lesbar. Kommt aus der laufenden Version, also immer aktuell.
async function zeigePatchnotes() {
  let text = '';
  try { text = await window.skularis.ipc.patchnotes(); } catch (_e) { /* leer weiter */ }
  const bloecke = String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map(b => b.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean);
  const items = bloecke.length
    ? bloecke.map(b => ({ label: b, onSelect: () => {} }))
    : [{ label: 'Keine Patchnotes gefunden.', onSelect: () => {} }];
  screen.push(menuScreen({
    title: 'Neuerungen',
    subtitle: 'Die Änderungen je Version, Absatz für Absatz lesbar. Escape kehrt zurück.',
    items, filter: false,
  }));
}

function setFont(neu) {
  neu = Math.max(-4, Math.min(8, neu));
  einstellungen.setWert('schrift_offset', neu);
  document.documentElement.style.setProperty('--db-font-offset', `${neu}px`);
  const anzeige = neu > 0 ? `plus ${neu}` : (neu < 0 ? `minus ${Math.abs(neu)}` : 'normal');
  sprache.sage(`Schriftgröße ${anzeige}.`);
}

async function aktuellerFont() {
  return (await einstellungen.get('schrift_offset')) || 0;
}

function setVolume(prozent) {
  prozent = Math.max(0, Math.min(100, prozent));
  sounds.setVolume(prozent);
  const slider = document.getElementById('volume-slider');
  const anzeige = document.getElementById('volume-display');
  if (slider) slider.value = prozent;
  if (anzeige) anzeige.textContent = String(prozent);
  sprache.sage(`Lautstärke ${prozent} Prozent.`);
}

/** Modal: den naechsten Tastendruck als Kombination erfassen (Escape bricht ab). */
function erfasseKombination() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'db-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-label', 'Neue Tastenkombination');
    dlg.insertAdjacentHTML('beforeend',
      '<div class="db-dialog__header"><span class="db-dialog__title">Neue Tastenkombination</span></div>'
      + '<div class="db-dialog__body"><p class="db-dialog__label">Druecke jetzt die gewuenschte Tastenkombination. Escape bricht ab.</p></div>');
    const live = document.createElement('div');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'assertive');
    dlg.appendChild(live);
    document.body.appendChild(dlg);
    const fertig = (v) => { try { dlg.close(); } catch { /* egal */ } dlg.remove(); resolve(v); };
    dlg.addEventListener('keydown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { fertig(null); return; }
      const combo = shortcuts.comboAusEvent(e);
      if (!combo) return; // reiner Modifier: weiter warten
      fertig(combo);
    }, true);
    dlg.showModal();
    requestAnimationFrame(() => { live.textContent = 'Druecke die neue Tastenkombination.'; });
  });
}

/** Menue zum freien Umbelegen der globalen Tasten. */
function tastenScreen() {
  return {
    title: '',
    build() {
      const liste = shortcuts.belegbareListe();
      this.title = 'Tasten neu belegen';
      const items = liste.map(k => ({
        label: `${k.beschreibung}: ${k.combo}`,
        hint: 'Enter: neu belegen oder auf Standard zuruecksetzen',
        onSelect: async () => {
          const w = await knopfDialog({
            titel: k.beschreibung,
            frage: `Aktuell ${k.combo}. Standard ${k.standard}.`,
            knoepfe: [
              { label: 'Neu belegen', wert: 'neu' },
              { label: 'Auf Standard zuruecksetzen', wert: 'std' },
              { label: 'Abbrechen', wert: 'ab' },
            ],
          });
          if (w === 'neu') {
            const c = await erfasseKombination();
            if (!c) return;
            shortcuts.neuBelegen(k.id, c);
            screen.refresh();
            sprache.sage(`${k.beschreibung} liegt jetzt auf ${c}.`);
          } else if (w === 'std') {
            shortcuts.zuruecksetzen(k.id);
            screen.refresh();
            sprache.sage(`${k.beschreibung} auf Standard zurueckgesetzt.`);
          }
        },
      }));
      return menuScreen({
        title: this.title,
        subtitle: 'Enter belegt eine Taste neu oder setzt sie zurueck. Escape zurueck.',
        items,
        leer: 'Keine umbelegbaren Tasten.',
      }).build();
    },
  };
}

export function build() {
  return menuScreen({
    title: 'Optionen',
    subtitle: 'Escape kehrt zurück.',
    items: [
      {
        label: 'Sprachausgabe ein oder aus',
        hint: 'Schaltet die gesprochenen Ansagen um, auch mit Strg und M',
        onSelect: () => {
          const neu = !sprache.istAn();
          sprache.setAn(neu);
          sounds.playClick();
          const st = document.getElementById('sprache-status-text');
          if (st) st.textContent = neu ? 'Sprache an' : 'Sprache aus';
          if (neu) sprache.sage('Sprachausgabe aktiviert.');
          else {
            const el = document.getElementById('sr-live');
            if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = 'Sprachausgabe deaktiviert.'; }); }
          }
        },
      },
      {
        label: 'Lautstärke erhöhen',
        hint: 'Software-Sounds lauter',
        onSelect: () => setVolume(sounds.getVolume() + 5),
      },
      {
        label: 'Lautstärke verringern',
        hint: 'Software-Sounds leiser',
        onSelect: () => setVolume(sounds.getVolume() - 5),
      },
      {
        label: 'Schrift vergrößern',
        onSelect: async () => setFont((await aktuellerFont()) + 1),
      },
      {
        label: 'Schrift verkleinern',
        onSelect: async () => setFont((await aktuellerFont()) - 1),
      },
      {
        label: 'Schrift auf Normalgröße',
        onSelect: () => setFont(0),
      },
      {
        label: 'Tasten neu belegen',
        hint: 'Globale Tastenkombinationen frei umbelegen (Sprachausgabe, Schrift, Beenden, Info-Fenster)',
        onSelect: () => screen.push(tastenScreen()),
      },
      {
        label: 'Neuerungen',
        hint: 'Was sich in dieser und den letzten Versionen geändert hat',
        onSelect: () => zeigePatchnotes(),
      },
      {
        label: 'Über Skularis',
        hint: 'Programm-Informationen, Zeile für Zeile lesbar',
        onSelect: () => zeigeUeber(),
      },
    ],
  });
}
