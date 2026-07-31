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
    eintraege: ['Alrik', 'Boronia', 'Cellin', 'Drego', 'Efferdane', 'Gerbald', 'Hilbrecht', 'Irmenella', 'Jorge', 'Kunga', 'Landri', 'Mesida', 'Norbert', 'Ophira', 'Praiodan', 'Ragna', 'Siegebald', 'Travin', 'Ulmia', 'Waldemar', 'Answin', 'Bragona', 'Cordovan', 'Delvinia', 'Emmeran', 'Firunja', 'Growin', 'Hesindiane', 'Ingramosch', 'Jadwiga', 'Konrafled', 'Lisca', 'Murolosch', 'Nulftana', 'Rewena', 'Stoerrebrand'],
  },
  {
    name: 'Namen, Ork und Goblin',
    eintraege: ['Gnarrk', 'Ograk', 'Brogh', 'Urshak', 'Znak', 'Grumsh', 'Marbo', 'Krazz', 'Durbak', 'Hrogg', 'Snaga', 'Uzruk', 'Mokosh', 'Grimzag', 'Brakk', 'Nazgul', 'Ushtar', 'Wrogga', 'Skarnak', 'Gorbash', 'Trakscha', 'Rukzod', 'Blarga', 'Mogruk', 'Zhak', 'Orkfressa', 'Kruschak', 'Wanzenbeisser'],
  },
  {
    name: 'Gerüchte in der Taverne',
    eintraege: [
      'Im alten Turm soll es spuken.', 'Ein Händler wird seit Tagen vermisst.',
      'Wölfe reißen das Vieh, aber es sind keine gewöhnlichen Wölfe.',
      'Der Bürgermeister hat Schulden bei zwielichtigen Gestalten.',
      'In der Mine hört man nachts Klopfen aus der Tiefe.',
      'Eine Fremde zahlt gut für alte Karten.',
      'Auf der Straße nach Norden treibt eine Räuberbande ihr Unwesen.',
      'Der Priester verhält sich seit dem Vollmond seltsam.',
      'Ein Kind hat im Wald leuchtende Augen gesehen.',
      'Die Ernte verdirbt auf dem Halm, niemand weiß warum.',
      'Ein reicher Erbe sucht Leute für eine heikle Sache.',
      'Der Schmied hat sein Handwerk über Nacht verlernt.',
      'Am Fluss wurde eine Leiche ohne einen Kratzer angeschwemmt.',
      'Es heißt, der Graf sei längst tot und ein Betrüger sitze auf seinem Thron.',
      'Ein Wanderprediger kündigt das Ende der Zeiten an.',
      'In der Ruine östlich der Stadt brennt nachts ein Licht.',
      'Die Steuereintreiber sind seit einer Woche nicht zurückgekehrt.',
      'Jemand kauft heimlich alle Vorräte an Salz auf.',
      'Ein sprechender Rabe soll Botschaften überbringen.',
      'Zwei Zünfte stehen kurz vor einem offenen Streit.',
      'Ein altes Grab wurde aufgebrochen, der Sarg ist leer.',
      'Der Brunnen schmeckt seit Neuestem nach Eisen und Blut.',
      'Eine Karawane ist spurlos in den Bergen verschwunden.',
      'Nachts hört man Kinderlachen aus dem verlassenen Haus.',
      'Ein Fremder zahlt Gold für Geschichten über eine bestimmte Familie.',
      'Der Bäcker wettert, jemand vergifte insgeheim das Mehl.',
      'Über dem Moor tanzen seit Tagen fahle Lichter.',
      'Die Hunde des Dorfes heulen jede Nacht zur selben Stunde.',
      'Ein Söldnertrupp lagert vor den Toren und wartet auf etwas.',
      'Man munkelt, unter der Kapelle liege ein vergessenes Verlies.',
    ],
  },
  {
    name: 'Wetter',
    eintraege: ['Klarer Himmel', 'Leichte Bewölkung', 'Nieselregen', 'Starker Regen mit Wind', 'Dichter Nebel', 'Drückende Hitze', 'Kalter Wind', 'Gewitter zieht auf', 'Erster Schnee', 'Schwüles, stehendes Wetter', 'Strahlender Sonnenschein', 'Wolkenbruch mit Hagel', 'Frostklare Nacht', 'Aufklarend nach Regen', 'Sturmböen aus Westen', 'Bodennebel am Morgen', 'Anhaltender Landregen', 'Trockene Kälte', 'Föhnwind, warm und trocken', 'Schneetreiben mit Sicht unter zehn Schritt', 'Glatteis auf den Wegen', 'Wechselhaft, Sonne und Schauer', 'Sandsturm am Horizont', 'Tauwetter, matschige Wege', 'Windstille, brütende Schwüle', 'Erster Raureif', 'Regenbogen nach dem Guss', 'Wolkenloser Sternenhimmel'],
  },
  {
    name: 'Beute und Fundstücke',
    eintraege: [
      'Ein Beutel mit einigen Silbertalern', 'Ein verzierter Dolch, leicht angerostet',
      'Eine Karte mit einer markierten Stelle', 'Ein Ring aus unbekanntem Metall',
      'Getrocknete Heilkräuter, gut für drei Anwendungen', 'Ein versiegelter Brief',
      'Ein alter Schlüssel ohne passendes Schloss', 'Ein kleiner Edelstein, trüb',
      'Eine Flasche mit klarer Flüssigkeit', 'Ein Amulett mit einem fremden Symbol',
      'Ein Bündel Wachskerzen und Zunderzeug', 'Ein abgegriffenes Reisetagebuch',
      'Drei Würfel aus Knochen, leicht gezinkt', 'Ein silberner Handspiegel',
      'Eine Handvoll fremdländischer Münzen', 'Ein Fläschchen teures Parfüm',
      'Ein Satz Dietriche in Lederrolle', 'Eine feine Halskette mit Anhänger',
      'Ein Kompass, dessen Nadel leicht zittert', 'Ein Paar solide Reisestiefel',
      'Ein Wappenring einer erloschenen Familie', 'Eine Rolle guten Pergaments und Tinte',
      'Ein kleiner Götterschrein aus Messing', 'Ein Sack Trockenproviant für eine Woche',
      'Ein Jagdmesser mit eingeritzten Runen', 'Ein Beutel bunter Glasperlen',
      'Eine Laterne mit Restöl', 'Ein verblasstes Miniaturporträt',
      'Ein Klumpen Rohbernstein mit Einschluss', 'Eine Schriftrolle in fremder Sprache',
    ],
  },
  {
    name: 'Kleine Komplikation',
    eintraege: [
      'Eine Wache wird misstrauisch.', 'Das Wetter schlägt um.', 'Ein Verbündeter fällt aus.',
      'Ein wichtiger Gegenstand ist verschwunden.', 'Ein Unbeteiligter gerät in Gefahr.',
      'Der Weg ist blockiert.', 'Ein alter Feind taucht auf.', 'Die Zeit wird knapp.',
      'Eine Brücke ist eingestürzt.', 'Ein Pferd wird lahm.', 'Ein Vorrat verdirbt.',
      'Jemand hat gelauscht und weiß nun zu viel.', 'Ein Werkzeug zerbricht im schlechtesten Moment.',
      'Eine Verwechslung sorgt für Ärger.', 'Ein Bote bringt schlechte Nachricht.',
      'Eine Schuld wird eingefordert.', 'Ein Sturm reißt das Zelt fort.',
      'Der Führer verläuft sich.', 'Eine Fackel erlischt zur Unzeit.',
      'Ein Streit unter Verbündeten flammt auf.', 'Die Torwache verlangt Wegzoll.',
      'Ein Hund schlägt Alarm.', 'Ein Krankheitsfall im Quartier.',
      'Der Schlüssel passt nicht mehr.', 'Ein Gerücht bringt die Gruppe in Verruf.',
      'Ein loses Brett verrät jeden Schritt.', 'Der Fluss führt Hochwasser.',
      'Ein Kind läuft im falschen Moment dazwischen.', 'Eine Falle war schon ausgelöst.',
    ],
  },
  {
    name: 'Tavernen und Wirtshäuser',
    eintraege: [
      'Zum durstigen Ochsen', 'Der letzte Heller', 'Zur schielenden Katze', 'Rabenkrug',
      'Zum goldenen Efferd', 'Die drei Fässer', 'Zum tanzenden Bären', 'Grauer Reiher',
      'Zur klammen Faust', 'Wirtshaus zur Rast', 'Zum fetten Kapaun', 'Der schiefe Turm',
      'Zur roten Laterne', 'Kranichs Ruh', 'Zum durstigen Zwerg', 'Der letzte Groschen',
      'Zur alten Eiche', 'Wirtshaus zum Anker', 'Zum krummen Nagel', 'Der stumme Barde',
      'Zur milden Praios', 'Roter Ochse', 'Zum blinden Passagier', 'Der satte Wanderer',
      'Zur windschiefen Mühle', 'Zum silbernen Krug', 'Der lahme Esel', 'Zur wilden Sau',
    ],
  },
  {
    name: 'Marotte eines NSC',
    eintraege: [
      'Kaut ständig auf einem Zahnstocher.', 'Wiederholt die letzten Worte des Gegenübers.',
      'Zählt beim Reden heimlich sein Geld.', 'Spricht von sich in der dritten Person.',
      'Hat für alles ein Sprichwort parat.', 'Riecht demonstrativ an jeder Münze.',
      'Blinzelt nervös bei jeder Lüge.', 'Tätschelt sein Amulett, wenn er unsicher ist.',
      'Vergisst ständig Namen und erfindet neue.', 'Lacht an den unpassendsten Stellen.',
      'Rückt jeden schiefen Gegenstand gerade.', 'Flüstert, als würde immer jemand lauschen.',
      'Prahlt mit Bekanntschaften, die es nicht gibt.', 'Trägt Handschuhe, auch im Hochsommer.',
      'Trinkt nur aus dem eigenen Becher.', 'Zwinkert nach jedem Satz.',
      'Sammelt Knöpfe und zeigt sie ungefragt.', 'Spricht auffällig langsam und bedächtig.',
      'Kratzt sich, sobald Geld erwähnt wird.', 'Beendet jeden Handel mit einem Handschlag zu viel.',
      'Nennt jeden „mein Freund", auch Feinde.', 'Klopft dreimal auf Holz vor jeder Entscheidung.',
      'Hat immer Krümel im Bart.', 'Verwechselt gern oben und unten, links und rechts.',
      'Redet mit seinem Reittier wie mit einem Menschen.', 'Notiert alles in ein winziges Büchlein.',
      'Pfeift dieselbe Melodie in Endlosschleife.', 'Misstraut jedem, der pünktlich ist.',
    ],
  },
  {
    name: 'Auftrag oder Questhaken',
    eintraege: [
      'Eskortiere einen Händler durch unsicheres Land.', 'Finde ein gestohlenes Erbstück wieder.',
      'Treibe eine alte Schuld ein, ohne Blut zu vergießen.', 'Bringe eine Botschaft heimlich zu einem Verbannten.',
      'Untersuche das Verschwinden mehrerer Dorfbewohner.', 'Bewache eine Nacht lang ein leeres Haus.',
      'Beschaffe eine seltene Zutat aus gefährlichem Gebiet.', 'Vermittle Frieden zwischen zwei zerstrittenen Familien.',
      'Räume eine Ruine von etwas, das dort haust.', 'Begleite eine Pilgerin zu einem entlegenen Schrein.',
      'Enttarne einen Betrüger in wichtiger Stellung.', 'Rette Vieh, das über Nacht in Panik geriet.',
      'Berge Fracht aus einem gesunkenen Boot.', 'Finde heraus, wer nachts Feuer legt.',
      'Übergib ein Lösegeld und bring die Geisel zurück.', 'Kartiere einen unerforschten Landstrich.',
      'Bewahre einen Zeugen bis zum Prozess.', 'Stelle die Herkunft einer fremden Münze fest.',
      'Vertreibe ein Raubtier, das die Herden reißt.', 'Hole eine Medizin, bevor der Kranke stirbt.',
      'Finde das Rezept eines verstorbenen Braumeisters.', 'Kläre, warum eine Glocke von selbst läutet.',
      'Beschütze eine Ernte vor Plünderern.', 'Suche einen entlaufenen Lehrling in der großen Stadt.',
      'Überführe einen Dieb, ohne ihn zu verschrecken.', 'Erkunde, was den Handelsweg blockiert.',
      'Bring einen Zauberkundigen dazu, ein Dorf in Ruhe zu lassen.', 'Finde heraus, wem die Ruine wirklich gehört.',
    ],
  },
  {
    name: 'Begegnung auf der Reise',
    eintraege: [
      'Ein umgestürzter Karren versperrt den Weg, der Fuhrmann fehlt.', 'Ein einsamer Wanderer bittet um Feuer.',
      'Eine Patrouille kontrolliert Papiere.', 'Ein Bettler kennt eine erstaunliche Abkürzung.',
      'Ein Rudel Wölfe beobachtet aus sicherer Entfernung.', 'Ein fahrender Händler bietet Zweifelhaftes feil.',
      'Ein weinendes Kind sitzt allein am Wegrand.', 'Zwei Bauern streiten lautstark um eine Grenze.',
      'Ein verletztes Tier liegt im Graben.', 'Eine Gauklertruppe lädt zur Rast am Feuer.',
      'Ein Wegelagerer verlangt Zoll, ist aber allein.', 'Eine Kutsche rast ohne Kutscher vorbei.',
      'Ein Pilgerzug singt und zieht langsam vorüber.', 'Ein Jäger warnt vor etwas weiter vorn.',
      'Ein umgeknickter Wegweiser zeigt in drei falsche Richtungen.', 'Ein Fremder folgt der Gruppe in gleichem Abstand.',
      'Eine Brücke ist bewacht, der Wächter döst.', 'Ein Feld brennt am Horizont, Rauch weht heran.',
      'Ein Reiter bricht erschöpft neben seinem Pferd zusammen.', 'Ein Mönch bietet Segen gegen eine milde Gabe.',
      'Frische Radspuren biegen abrupt ins Unterholz.', 'Ein Marktkarren hat eine Achse verloren.',
      'Ein Späher pfeift ein Signal, dann ist es still.', 'Ein Grenzstein wurde offenbar versetzt.',
      'Ein Trupp Söldner lagert und mustert jeden Vorbeikommenden.', 'Ein alter Einsiedler warnt vor dem Wald.',
      'Eine Ziege blockiert stur den schmalen Pfad.', 'Ein Leichenzug kommt der Gruppe entgegen.',
    ],
  },
];

function wuerfle(t) {
  // Bei den nun grossen Tabellen den zuletzt gewuerfelten Eintrag nicht sofort
  // wiederholen, damit sich zwei Wuerfe hintereinander unterscheiden.
  let i = Math.floor(Math.random() * t.eintraege.length);
  if (t.eintraege.length > 1 && i === t._letzter) i = (i + 1) % t.eintraege.length;
  t._letzter = i;
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
