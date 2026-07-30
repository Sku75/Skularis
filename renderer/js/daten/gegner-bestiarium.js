/**
 * Skularistool — mitgeliefertes Gegner-Bestiarium (nach Ilaris uebersetzt).
 *
 * Aus dem DSA-Kontext uebernommene, stimmige Gegner mit nach Ilaris uebersetzten
 * Kampfwerten (schlanker Statblock: Wundschwelle WS, Ruestung RS, Initiative INI,
 * Angriffe mit Attacke AT, Parade PA und Schaden, dazu Faehigkeiten und Notizen).
 * Die Werte sind bewusst runde, spielbare Richtwerte, keine Punkt-fuer-Punkt-
 * Umrechnung; der Meister kann jede Karte im Editor anpassen.
 *
 * Struktur: Liste von Kategorien in sinnvoller Reihenfolge, je Kategorie die
 * Gegner nach Gefaehrlichkeit. Ueber diesem Bestiarium liegt zusaetzlich die
 * eigene Gegner-Bibliothek des Nutzers (global gespeichert).
 */

/** Kurzschreibweise fuer einen Angriff. */
function a(name, at, pa, wuerfel, seiten, bonus) {
  return { name, at, pa, wuerfel, seiten, bonus };
}

export const BESTIARIUM = [
  {
    kategorie: 'Menschen und Halbmenschen',
    gegner: [
      { name: 'Bettler', ws: 4, rs: 0, ini: 2, angriffe: [a('Fäuste', 8, 8, 1, 6, 0)], vorteile: [], manoever: [], notizen: 'Ungefährlich, flieht schnell.' },
      { name: 'Straßenräuber', ws: 5, rs: 1, ini: 4, angriffe: [a('Dolch', 11, 9, 1, 6, 2), a('Kurzbogen', 11, null, 1, 6, 3)], vorteile: ['Meucheln'], manoever: ['Gezielter Schlag'], notizen: 'Lauert in Gruppen auf, fordert Wegzoll.' },
      { name: 'Stadtgardist', ws: 6, rs: 3, ini: 5, angriffe: [a('Säbel', 12, 11, 1, 6, 3), a('Hellebarde', 12, 10, 2, 6, 4)], vorteile: ['Kampfreflexe'], manoever: ['Wuchtschlag', 'Entwaffnen'], notizen: 'Diszipliniert, ruft Verstärkung.' },
      { name: 'Söldner', ws: 7, rs: 4, ini: 5, angriffe: [a('Anderthalbhänder', 13, 11, 2, 6, 4)], vorteile: ['Kampfreflexe', 'Wuchtschlag'], manoever: ['Wuchtschlag', 'Sturmangriff'], notizen: 'Erfahren, kämpft für Sold, kein Fanatiker.' },
      { name: 'Kultist', ws: 5, rs: 1, ini: 4, angriffe: [a('Opferdolch', 11, 9, 1, 6, 2)], vorteile: [], manoever: [], notizen: 'Fanatisch, oft mit einem Anführer und Ritual.' },
      { name: 'Schwarzmagier', ws: 5, rs: 0, ini: 6, angriffe: [a('Stab', 10, 9, 1, 6, 1)], vorteile: ['Tradition der Gildenmagier', 'Merkmalskenntnis'], manoever: [], notizen: 'Gefährlich durch Zauber, körperlich schwach. Astralenergie beachten.' },
      { name: 'Ritter', ws: 8, rs: 6, ini: 5, angriffe: [a('Reiterschwert', 14, 12, 2, 6, 5), a('Lanze', 14, null, 2, 6, 6)], vorteile: ['Kampfreflexe', 'Rüstungsgewöhnung'], manoever: ['Sturmangriff', 'Wuchtschlag'], notizen: 'Schwer gepanzert, zu Pferd besonders gefährlich.' },
    ],
  },
  {
    kategorie: 'Ork, Goblin und Oger',
    gegner: [
      { name: 'Goblin', ws: 4, rs: 1, ini: 5, angriffe: [a('Krummdolch', 10, 8, 1, 6, 1), a('Schleuder', 10, null, 1, 6, 1)], vorteile: ['Flink'], manoever: ['Gezielter Schlag'], notizen: 'Feige einzeln, gefährlich in der Meute.' },
      { name: 'Ork-Späher', ws: 6, rs: 2, ini: 5, angriffe: [a('Ork-Nase (Säbel)', 12, 10, 1, 6, 4), a('Kurzbogen', 12, null, 1, 6, 3)], vorteile: ['Zäh'], manoever: ['Gezielter Schlag'], notizen: 'Beweglich, kundschaftet vor der Horde.' },
      { name: 'Ork-Krieger', ws: 7, rs: 3, ini: 4, angriffe: [a('Ork-Nase (Säbel)', 13, 11, 1, 6, 5)], vorteile: ['Zäh', 'Wuchtschlag', 'Blutrausch'], manoever: ['Wuchtschlag', 'Sturmangriff'], notizen: 'Stark und wild, kämpft bis zuletzt.' },
      { name: 'Oger', ws: 11, rs: 3, ini: 3, angriffe: [a('Riesenkeule', 14, 8, 2, 6, 8)], vorteile: ['Zäh', 'Wuchtschlag'], manoever: ['Wuchtschlag', 'Umreißen', 'Niederwerfen'], notizen: 'Riesig und dumm, ein Treffer wirft Helden um. Menschenfresser.' },
      { name: 'Troll', ws: 15, rs: 5, ini: 2, angriffe: [a('Baumstamm', 15, 8, 3, 6, 10)], vorteile: ['Zäh', 'Eisern'], manoever: ['Wuchtschlag', 'Umreißen'], notizen: 'Gewaltig, extrem widerstandsfähig, langsam.' },
    ],
  },
  {
    kategorie: 'Tiere',
    gegner: [
      { name: 'Wolf', ws: 5, rs: 1, ini: 7, angriffe: [a('Biss', 12, null, 1, 6, 2)], vorteile: ['Flink', 'Rudelkämpfer'], manoever: ['Umreißen', 'Niederwerfen'], notizen: 'Jagt im Rudel, versucht Beute zu Fall zu bringen.' },
      { name: 'Wildschwein', ws: 7, rs: 2, ini: 5, angriffe: [a('Hauer', 12, null, 1, 6, 4)], vorteile: ['Zäh'], manoever: ['Sturmangriff', 'Niederwerfen'], notizen: 'Greift bei Bedrohung wütend an, schwer aufzuhalten.' },
      { name: 'Braunbär', ws: 10, rs: 3, ini: 5, angriffe: [a('Tatzenhieb', 13, null, 2, 6, 6), a('Biss', 12, null, 1, 6, 5)], vorteile: ['Zäh', 'Wuchtschlag'], manoever: ['Umklammern', 'Niederwerfen'], notizen: 'Kann zwei Tatzenhiebe je Runde führen, umklammert.' },
      { name: 'Luchs', ws: 4, rs: 1, ini: 8, angriffe: [a('Prankenhieb', 12, null, 1, 6, 1)], vorteile: ['Flink', 'Katzenhaft'], manoever: ['Gezielter Schlag'], notizen: 'Sehr schnell, greift aus dem Hinterhalt an.' },
      { name: 'Riesenadler', ws: 6, rs: 1, ini: 8, angriffe: [a('Klauen', 13, null, 1, 6, 3), a('Schnabel', 12, null, 1, 6, 2)], vorteile: ['Flink', 'Sturzflug'], manoever: ['Sturmangriff'], notizen: 'Greift aus der Luft an, kann kleine Beute ergreifen.' },
      { name: 'Rattenschwarm', ws: 6, rs: 0, ini: 6, angriffe: [a('Beißen', 10, null, 1, 6, 1)], vorteile: ['Schwarm'], manoever: [], notizen: 'Als Schwarm behandeln, schwer mit Einzelhieben zu treffen, überträgt Krankheiten.' },
    ],
  },
  {
    kategorie: 'Untote',
    gegner: [
      { name: 'Skelett', ws: 5, rs: 2, ini: 3, angriffe: [a('Rostiges Schwert', 11, 9, 1, 6, 3)], vorteile: ['Untot', 'Schmerzlos'], manoever: [], notizen: 'Untot: kennt keine Furcht und keinen Schmerz. Stumpfe Waffen wirken besser.' },
      { name: 'Zombie', ws: 8, rs: 1, ini: 1, angriffe: [a('Klauen', 10, 4, 1, 6, 3)], vorteile: ['Untot', 'Schmerzlos', 'Zäh'], manoever: ['Umklammern'], notizen: 'Langsam, aber zäh und unermüdlich. Greift stur die nächste Person an.' },
      { name: 'Ghul', ws: 7, rs: 1, ini: 6, angriffe: [a('Kralle', 12, 8, 1, 6, 3), a('Biss', 11, null, 1, 6, 2)], vorteile: ['Untot', 'Lähmender Biss'], manoever: ['Gezielter Schlag'], notizen: 'Biss kann lähmen (Zähigkeitsprobe). Frisst Aas und Gefallene.' },
      { name: 'Mumie', ws: 10, rs: 2, ini: 3, angriffe: [a('Wuchtiger Hieb', 13, 8, 2, 6, 5)], vorteile: ['Untot', 'Schmerzlos', 'Eisern'], manoever: ['Wuchtschlag'], notizen: 'Sehr widerstandsfähig, oft mit Fluch belegt. Feuer wirkt gut.' },
      { name: 'Skelettkrieger', ws: 6, rs: 4, ini: 4, angriffe: [a('Schwert', 13, 11, 1, 6, 4), a('Schild', 10, 12, 1, 6, 1)], vorteile: ['Untot', 'Schmerzlos', 'Kampfreflexe'], manoever: ['Wuchtschlag'], notizen: 'Zu Lebzeiten ein Krieger, kämpft mit Schild und Technik.' },
    ],
  },
  {
    kategorie: 'Dämonisches',
    gegner: [
      { name: 'Kleiner Dämon', ws: 7, rs: 2, ini: 7, angriffe: [a('Krallen', 13, 10, 1, 6, 4)], vorteile: ['Dämonisch', 'Furchteinflößend'], manoever: ['Gezielter Schlag'], notizen: 'Dämonisch: immun gegen viele weltliche Effekte, verbreitet Furcht.' },
      { name: 'Schrecken (Heshthot-Brut)', ws: 9, rs: 3, ini: 8, angriffe: [a('Sichelklauen', 14, 11, 2, 6, 4)], vorteile: ['Dämonisch', 'Flink', 'Furchteinflößend'], manoever: ['Doppelangriff'], notizen: 'Schnell und tödlich, greift mehrfach an.' },
      { name: 'Höllenhund', ws: 8, rs: 2, ini: 8, angriffe: [a('Feuriger Biss', 13, null, 1, 6, 5)], vorteile: ['Dämonisch', 'Rudelkämpfer'], manoever: ['Niederwerfen'], notizen: 'Biss setzt in Brand (Zusatzschaden). Jagt in Rudeln.' },
      { name: 'Großer Dämon', ws: 14, rs: 5, ini: 8, angriffe: [a('Verheerende Klaue', 16, 12, 3, 6, 8)], vorteile: ['Dämonisch', 'Furchteinflößend', 'Eisern'], manoever: ['Wuchtschlag', 'Umreißen'], notizen: 'Mächtig, nur mit geweihten oder magischen Waffen ernsthaft zu verletzen.' },
    ],
  },
  {
    kategorie: 'Elementares und Geister',
    gegner: [
      { name: 'Kleiner Feuerelementar (Funkengeist)', ws: 6, rs: 0, ini: 7, angriffe: [a('Flammenzunge', 12, null, 1, 6, 4)], vorteile: ['Elementar', 'Brennend'], manoever: [], notizen: 'Setzt Brennbares in Brand. Wasser fügt ihm Schaden zu.' },
      { name: 'Wassergeist (Nixe)', ws: 7, rs: 0, ini: 6, angriffe: [a('Sog', 11, null, 1, 6, 2)], vorteile: ['Elementar'], manoever: ['Umklammern'], notizen: 'Zieht Opfer ins Wasser, versucht zu ertränken.' },
      { name: 'Erdelementar (Felsgeist)', ws: 12, rs: 6, ini: 2, angriffe: [a('Steinfaust', 13, 8, 2, 6, 6)], vorteile: ['Elementar', 'Eisern'], manoever: ['Wuchtschlag'], notizen: 'Sehr widerstandsfähig und langsam, schwer zu erschüttern.' },
      { name: 'Irrlicht', ws: 3, rs: 0, ini: 9, angriffe: [a('Zehrender Griff', 11, null, 1, 6, 1)], vorteile: ['Geist', 'Schweben'], manoever: [], notizen: 'Lockt Reisende ins Verderben, körperlich kaum greifbar.' },
    ],
  },
  {
    kategorie: 'Drachen und Echsen',
    gegner: [
      { name: 'Tatzelwurm', ws: 9, rs: 4, ini: 5, angriffe: [a('Biss', 13, 9, 2, 6, 4), a('Schwanzschlag', 12, null, 1, 6, 4)], vorteile: ['Zäh', 'Giftbiss'], manoever: ['Umklammern'], notizen: 'Bergdrache ohne Flügel, Biss kann giftig sein.' },
      { name: 'Lindwurm', ws: 12, rs: 5, ini: 5, angriffe: [a('Biss', 14, 10, 2, 6, 6), a('Klaue', 13, 9, 2, 6, 5)], vorteile: ['Zäh', 'Furchteinflößend'], manoever: ['Wuchtschlag', 'Umreißen'], notizen: 'Großer wurmartiger Drache, sehr gefährlich.' },
      { name: 'Junger Drache', ws: 16, rs: 7, ini: 6, angriffe: [a('Biss', 16, 12, 3, 6, 8), a('Feueratem', 15, null, 4, 6, 6)], vorteile: ['Zäh', 'Eisern', 'Furchteinflößend', 'Fliegend'], manoever: ['Wuchtschlag'], notizen: 'Feueratem trifft ein Gebiet. Intelligent und hochmütig.' },
      { name: 'Echsenmensch-Krieger', ws: 7, rs: 3, ini: 5, angriffe: [a('Obsidiankeule', 13, 10, 1, 6, 5), a('Wurfspeer', 12, null, 1, 6, 4)], vorteile: ['Zäh', 'Kaltblütig'], manoever: ['Wuchtschlag'], notizen: 'Sumpfbewohner, kämpft in Trupps, guter Schwimmer.' },
    ],
  },
  {
    kategorie: 'Ungeziefer und Pflanzen',
    gegner: [
      { name: 'Riesenspinne', ws: 6, rs: 2, ini: 7, angriffe: [a('Giftbiss', 12, null, 1, 6, 2)], vorteile: ['Giftbiss', 'Netzwerfer', 'Wandläufer'], manoever: [], notizen: 'Biss vergiftet (Zähigkeitsprobe), fesselt Beute mit Netzen.' },
      { name: 'Riesenskorpion', ws: 8, rs: 4, ini: 5, angriffe: [a('Schere', 13, 9, 1, 6, 4), a('Stachel', 12, null, 1, 6, 3)], vorteile: ['Giftstachel', 'Gepanzert'], manoever: ['Umklammern'], notizen: 'Schere hält fest, Stachel vergiftet stark.' },
      { name: 'Sumpfschrat (Wurzelwesen)', ws: 11, rs: 3, ini: 3, angriffe: [a('Peitschende Ranke', 12, 8, 1, 6, 5)], vorteile: ['Pflanzlich', 'Verwurzelt'], manoever: ['Umklammern', 'Umreißen'], notizen: 'Feuer fügt ihm doppelten Schaden zu, hält Opfer mit Ranken fest.' },
      { name: 'Riesenschlange', ws: 8, rs: 2, ini: 6, angriffe: [a('Biss', 12, null, 1, 6, 3), a('Umschlingen', 12, null, 1, 6, 4)], vorteile: ['Giftbiss', 'Würgegriff'], manoever: ['Umklammern'], notizen: 'Umschlingt und erdrückt, Biss kann giftig sein.' },
    ],
  },
];
