/**
 * Skularistool — Meistertisch: Gegnerkartei und freundliche NPC.
 *
 * Schlanke Ilaris-Statbloecke: Name, Wundschwelle, Ruestung, Initiative, ein bis
 * zwei Angriffe (Wert und Schaden), Notizen. Angriff und Schaden lassen sich
 * verdeckt auswuerfeln, und ein Statblock laesst sich auf den Spieltisch legen.
 * Derselbe Bildschirm dient Gegnern (a.nsc) und freundlichen NPC (a.freundlicheNsc).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { textDialog, zahlDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { leererStatblock, baueStatblockKarte, protokolliere, angriffText } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';
import { setAusGegnern } from './sets.js';

/** @param {'gegner'|'freund'} art */
function liste(a, art) { return art === 'freund' ? a.freundlicheNsc : a.nsc; }

export function gegnerkarteiScreen(art = 'gegner') {
  const wort = art === 'freund' ? 'Freundliche NPC' : 'Gegner und Kreaturen';
  const einzeln = art === 'freund' ? 'NPC' : 'Gegner';
  return {
    title: wort,
    build() {
      const a = getMeister();
      const arr = liste(a, art);
      this.title = `${wort}, ${arr.length}`;
      const items = arr.map((sb, i) => ({
        label: `${sb.name || einzeln}`,
        hint: `Wundschwelle ${sb.ws}, Ruestung ${sb.rs}, Initiative ${sb.ini}`,
        detail: statblockText(sb),
        onSelect: () => screen.push(statblockScreen(art, i)),
      }));
      // Ganz oben (nur Gegner): die aktuelle Auswahl als Set fuer den Spieltisch buendeln.
      if (art === 'gegner') {
        items.unshift({
          label: 'Set erstellen',
          hint: 'die aktuelle Gegner-Auswahl als Set fuer den Spieltisch buendeln',
          onSelect: () => setAusGegnern(a.nsc || []),
        });
      }
      items.push({
        label: `Neuen ${einzeln} anlegen`,
        hint: 'Name, Werte und Angriffe eintragen',
        onSelect: async () => {
          const name = await textDialog({ titel: `Neuer ${einzeln}`, label: 'Name' });
          if (name === null || !name.trim()) return;
          const sb = leererStatblock(a);
          sb.name = name.trim();
          liste(a, art).push(sb);
          protokolliere(a, `${einzeln} ${sb.name} angelegt.`);
          await speichere();
          screen.push(statblockScreen(art, liste(a, art).length - 1));
        },
      });
      return menuScreen({
        title: this.title,
        subtitle: `Enter oeffnet einen ${einzeln}. Escape zurueck.`,
        items,
        leer: `Noch keine ${wort}.`,
        filter: arr.length >= 10,
      }).build();
    },
    onShow() { sprache.sage(`${wort}. Anlegen, bearbeiten, auf den Spieltisch legen. Angriff und Schaden lassen sich verdeckt wuerfeln.`); },
  };
}

function statblockText(sb) {
  const angr = (sb.angriffe || []).map(angriffText).join('. ');
  return [`${sb.name}. Wundschwelle ${sb.ws}, Ruestung ${sb.rs}, Initiative ${sb.ini}.`, angr || 'Keine Angriffe eingetragen.', sb.notizen ? `Notizen: ${sb.notizen}` : ''].filter(Boolean).join(' ');
}

export function statblockScreen(art, index) {
  const einzeln = art === 'freund' ? 'NPC' : 'Gegner';
  return {
    title: '',
    build() {
      const a = getMeister();
      const sb = liste(a, art)[index];
      if (!sb) { screen.pop(); return document.createElement('div'); }
      if (typeof sb.ausweichen !== 'number') sb.ausweichen = 0;
      this.title = sb.name || einzeln;

      const items = [];
      const zahlFeld = (label, key, min, max) => items.push({
        label: `${label}: ${sb[key]}`,
        hint: 'Enter aendert den Wert',
        onSelect: async () => {
          const v = await zahlDialog({ titel: label, label, wert: sb[key] || 0, min, max });
          if (v === null) return;
          sb[key] = v; await speichere(); screen.refresh(); sprache.sage(`${label} ${v}.`);
        },
      });

      items.push({
        label: `Name: ${sb.name}`,
        onSelect: async () => {
          const v = await textDialog({ titel: 'Name', label: 'Name', wert: sb.name });
          if (v === null || !v.trim()) return;
          sb.name = v.trim(); await speichere(); screen.refresh(); sprache.sage(`Name ${sb.name}.`);
        },
      });
      zahlFeld('Wundschwelle', 'ws', 0, 60);
      zahlFeld('Ruestung', 'rs', 0, 20);
      zahlFeld('Initiative', 'ini', -20, 40);
      zahlFeld('Ausweichen', 'ausweichen', 0, 40);

      // Angriffe
      (sb.angriffe || []).forEach((ang, ai) => {
        items.push({
          label: `Angriff ${angriffText(ang)}`,
          hint: 'Enter: wuerfeln, bearbeiten, entfernen',
          onSelect: () => screen.push(angriffScreen(art, index, ai)),
        });
      });
      items.push({
        label: 'Angriff hinzufuegen',
        onSelect: async () => {
          const name = await textDialog({ titel: 'Angriff', label: 'Name des Angriffs, z. B. Krummsaebel' });
          if (name === null || !name.trim()) return;
          const at = await zahlDialog({ titel: 'Attacke', label: 'Attacke-Wert (AT)', wert: 12, min: 0, max: 40 });
          if (at === null) return;
          const pa = await zahlDialog({ titel: 'Parade', label: 'Parade-Wert (PA), 0 wenn keine', wert: 0, min: 0, max: 40 });
          if (pa === null) return;
          const wuerfel = await zahlDialog({ titel: 'Schadenswuerfel', label: 'Anzahl Wuerfel', wert: 1, min: 0, max: 20 });
          if (wuerfel === null) return;
          const seiten = await knopfDialog({ titel: 'Wuerfeltyp', knoepfe: [{ label: 'W6', wert: 6 }, { label: 'W20', wert: 20 }] });
          if (seiten === null) return;
          const bonus = await zahlDialog({ titel: 'Schadensbonus', label: 'Fester Schadensbonus, 0 wenn keiner', wert: 0, min: -20, max: 40 });
          if (bonus === null) return;
          sb.angriffe.push({ name: name.trim(), at, pa: pa || null, wuerfel, seiten, bonus });
          await speichere(); screen.refresh(); sprache.sage(`Angriff ${name.trim()} hinzugefuegt.`);
        },
      });

      items.push({
        label: `Notizen${sb.notizen ? ': ' + sb.notizen : ''}`,
        onSelect: async () => {
          const v = await textDialog({ titel: 'Notizen', label: 'Notizen', wert: sb.notizen, mehrzeilig: true });
          if (v === null) return;
          sb.notizen = v.trim(); await speichere(); screen.refresh(); sprache.sage('Notizen gespeichert.');
        },
      });

      items.push({
        label: 'Auf den Spieltisch legen',
        hint: 'Als Kampfkarte auf den Tisch',
        onSelect: async () => {
          a.tisch.karten.push(baueStatblockKarte(a, sb, art));
          protokolliere(a, `${sb.name} auf den Spieltisch gelegt.`);
          await speichere();
          sounds.playOeffnen();
          sprache.sage(`${sb.name} liegt jetzt auf dem Spieltisch.`);
        },
      });
      items.push({
        label: `${einzeln} loeschen`,
        onSelect: async () => {
          if (!await jaNeinDialog({ titel: 'Loeschen', frage: `${sb.name} wirklich loeschen?` })) return;
          liste(a, art).splice(index, 1);
          await speichere(); screen.pop(); sprache.sage(`${sb.name} geloescht.`);
        },
      });

      return menuScreen({ title: this.title, subtitle: 'Werte aendern, Angriffe pflegen, auf den Tisch legen. Escape zurueck.', items }).build();
    },
  };
}

function angriffScreen(art, sbIndex, ai) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const sb = liste(a, art)[sbIndex];
      const ang = sb && sb.angriffe[ai];
      if (!ang) { screen.pop(); return document.createElement('div'); }
      this.title = `Angriff ${ang.name}`;
      const atWert = ang.at != null ? ang.at : ang.wert || 0;
      const items = [
        {
          label: `Attacke wuerfeln, AT ${atWert}`,
          hint: 'verdeckt, 1 W20 plus Attacke',
          onSelect: () => verdeckteProbe({ wer: sb.name, was: `Attacke ${ang.name}`, probenwert: atWert, anzahl: 1 }),
        },
      ];
      if (ang.pa != null) items.push({
        label: `Parade wuerfeln, PA ${ang.pa}`,
        hint: 'verdeckt, 1 W20 plus Parade',
        onSelect: () => verdeckteProbe({ wer: sb.name, was: `Parade ${ang.name}`, probenwert: ang.pa, anzahl: 1 }),
      });
      items.push(
        {
          label: `Schaden wuerfeln, ${ang.wuerfel} W ${ang.seiten}${ang.bonus ? ' plus ' + ang.bonus : ''}`,
          hint: 'verdeckt',
          onSelect: () => verdeckterWurf(ang.wuerfel, ang.seiten, ang.bonus, `Schaden ${ang.name}`),
        },
        {
          label: 'Angriff bearbeiten',
          onSelect: async () => {
            const at = await zahlDialog({ titel: 'Attacke', label: 'Attacke (AT)', wert: atWert, min: 0, max: 40 });
            if (at === null) return;
            const pa = await zahlDialog({ titel: 'Parade', label: 'Parade (PA), 0 wenn keine', wert: ang.pa || 0, min: 0, max: 40 });
            if (pa === null) return;
            const wuerfel = await zahlDialog({ titel: 'Schadenswuerfel', label: 'Anzahl Wuerfel', wert: ang.wuerfel, min: 0, max: 20 });
            if (wuerfel === null) return;
            const bonus = await zahlDialog({ titel: 'Schadensbonus', label: 'Schadensbonus', wert: ang.bonus, min: -20, max: 40 });
            if (bonus === null) return;
            ang.at = at; ang.pa = pa || null; ang.wuerfel = wuerfel; ang.bonus = bonus; delete ang.wert;
            await speichere(); screen.refresh(); sprache.sage('Angriff geaendert.');
          },
        },
        {
          label: 'Angriff entfernen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Entfernen', frage: `Angriff ${ang.name} entfernen?` })) return;
            sb.angriffe.splice(ai, 1); await speichere(); screen.pop(); sprache.sage('Angriff entfernt.');
          },
        },
      );
      return menuScreen({ title: this.title, subtitle: 'Escape zurueck.', items }).build();
    },
  };
}
