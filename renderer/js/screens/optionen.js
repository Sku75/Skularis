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
import { menuScreen } from '../ui/menu-screen.js';

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
        label: 'Über Skularis',
        hint: 'Programm-Informationen, Zeile für Zeile lesbar',
        onSelect: () => zeigeUeber(),
      },
    ],
  });
}
