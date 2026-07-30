/**
 * Skularistool — Meistertisch: Zufallstabellen fuer die Improvisation.
 *
 * Kleine Sammlung an Wuerfeltabellen (Namen, Geruechte, Wetter, Beute und mehr).
 * Enter auf einer Tabelle wuerfelt einen Eintrag aus und sagt ihn an; das Menue
 * bleibt offen, sodass man mehrfach wuerfeln kann.
 */
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';

const TABELLEN = [
  {
    name: 'Namen, menschlich',
    eintraege: ['Alrik', 'Boronia', 'Cellin', 'Drego', 'Efferdane', 'Gerbald', 'Hilbrecht', 'Irmenella', 'Jorge', 'Kunga', 'Landri', 'Mesida', 'Norbert', 'Ophira', 'Praiodan', 'Ragna', 'Siegebald', 'Travin', 'Ulmia', 'Waldemar'],
  },
  {
    name: 'Namen, Ork und Goblin',
    eintraege: ['Gnarrk', 'Ograk', 'Brogh', 'Urshak', 'Znak', 'Grumsh', 'Marbo', 'Krazz', 'Durbak', 'Hrogg', 'Snaga', 'Uzruk'],
  },
  {
    name: 'Geruechte in der Taverne',
    eintraege: [
      'Im alten Turm soll es spuken.', 'Ein Haendler wird seit Tagen vermisst.',
      'Woelfe reissen das Vieh, aber es sind keine gewoehnlichen Woelfe.',
      'Der Buergermeister hat Schulden bei zwielichtigen Gestalten.',
      'In der Mine hoert man nachts Klopfen aus der Tiefe.',
      'Eine Fremde zahlt gut fuer alte Karten.',
      'Auf der Strasse nach Norden treibt eine Raeuberbande ihr Unwesen.',
      'Der Priester verhaelt sich seit dem Vollmond seltsam.',
      'Ein Kind hat im Wald leuchtende Augen gesehen.',
      'Die Ernte verdirbt auf dem Halm, niemand weiss warum.',
    ],
  },
  {
    name: 'Wetter',
    eintraege: ['Klarer Himmel', 'Leichte Bewoelkung', 'Nieselregen', 'Starker Regen mit Wind', 'Dichter Nebel', 'Drueckende Hitze', 'Kalter Wind', 'Gewitter zieht auf', 'Erster Schnee', 'Schwueles, stehendes Wetter'],
  },
  {
    name: 'Beute und Fundstuecke',
    eintraege: [
      'Ein Beutel mit einigen Silbertalern', 'Ein verzierter Dolch, leicht angerostet',
      'Eine Karte mit einer markierten Stelle', 'Ein Ring aus unbekanntem Metall',
      'Getrocknete Heilkraeuter, gut fuer drei Anwendungen', 'Ein versiegelter Brief',
      'Ein alter Schluessel ohne passendes Schloss', 'Ein kleiner Edelstein, trueb',
      'Eine Flasche mit klarer Fluessigkeit', 'Ein Amulett mit einem fremden Symbol',
    ],
  },
  {
    name: 'Kleine Komplikation',
    eintraege: [
      'Eine Wache wird misstrauisch.', 'Das Wetter schlaegt um.', 'Ein Verbuendeter faellt aus.',
      'Ein wichtiger Gegenstand ist verschwunden.', 'Ein Unbeteiligter geraet in Gefahr.',
      'Der Weg ist blockiert.', 'Ein alter Feind taucht auf.', 'Die Zeit wird knapp.',
    ],
  },
];

function wuerfle(t) {
  const i = Math.floor(Math.random() * t.eintraege.length);
  sounds.playWuerfel();
  sprache.sage(`${t.name}: ${t.eintraege[i]}`);
}

export function zufallstabellenScreen() {
  return {
    title: 'Zufallstabellen',
    build() {
      const items = TABELLEN.map(t => ({
        label: t.name,
        hint: `${t.eintraege.length} Eintraege. Enter wuerfelt`,
        onSelect: () => wuerfle(t),
      }));
      return menuScreen({
        title: 'Zufallstabellen',
        subtitle: 'Enter wuerfelt einen Eintrag aus. Das Menue bleibt offen. Escape zurueck.',
        items,
      }).build();
    },
    onShow() { sprache.sage('Zufallstabellen. Enter auf einer Tabelle wuerfelt einen Eintrag.'); },
  };
}
