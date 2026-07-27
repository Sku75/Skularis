/**
 * Skularis 0.1 — Optionen (Sound, Schrift, Über)
 * Ergänzt die Barrierefreiheits-Box oben rechts um ein volles Menü.
 */

import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import * as einstellungen from './../daten/einstellungen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { jaNeinDialog } from '../ui/dialog.js';

// Fortschritts-Ansagen nur einmal je Sitzung anmelden.
let _fortschrittAngemeldet = false;

async function updateStarten() {
  const ipc = window.skularis && window.skularis.ipc;
  if (!ipc || !ipc.updatePruefen) { sprache.sage('Update ist in dieser Version nicht verfügbar.'); return; }

  if (!_fortschrittAngemeldet && ipc.onUpdateFortschritt) {
    _fortschrittAngemeldet = true;
    ipc.onUpdateFortschritt((pct) => sprache.sage(`${pct} Prozent geladen.`));
  }

  sprache.sage('Wird geprüft und geladen, bitte warten.');
  let res;
  try { res = await ipc.updatePruefen(); }
  catch (_e) { res = { fehler: 'Netzwerkfehler' }; }

  if (!res || res.fehler) {
    sprache.sage('Konnte nicht nach Updates suchen. Bitte die Internetverbindung prüfen.');
    return;
  }
  if (!res.neuer) {
    sprache.sage(`Du hast bereits die neueste Version, ${res.lokaleVersion}.`);
    return;
  }

  const ja = await jaNeinDialog({
    titel: 'Update verfügbar',
    frage: `Version ${res.tag} ist verfügbar. Jetzt aktualisieren?`,
  });
  if (!ja) { sprache.sage('Aktualisierung abgebrochen.'); return; }

  sprache.sage('Update wird geladen, das kann eine Minute dauern. Bitte warten.');
  try {
    await ipc.updateAusfuehren();
  } catch (_e) {
    sprache.sage('Das Update konnte nicht geladen werden. Bitte später erneut versuchen.');
    return;
  }
  sprache.sage('Aktualisierung abgeschlossen. Skularis startet jetzt neu.');
  try { await ipc.updateBeenden(); } catch (_e) { /* App beendet sich gleich */ }
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
        label: 'Update Skularis',
        hint: 'Nach einer neuen Version suchen und aktualisieren',
        onSelect: () => updateStarten(),
      },
      {
        label: 'Über Skularis',
        hint: 'Programm-Informationen',
        onSelect: () => sprache.sage(
          'Skularis, Version 0.08. Barrierefreie Charaktererstellung für das Ilaris-Regelwerk. ' +
          'Regelwerk Ilaris von Lukas Rügge.'
        ),
      },
    ],
  });
}
