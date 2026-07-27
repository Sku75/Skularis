/**
 * Headless-Prüfung des Rechenkerns (reines JavaScript, kein DOM).
 * Läuft mit der Node-Laufzeit von Electron (ELECTRON_RUN_AS_NODE=1).
 *
 * Alles, was mit Dateien zu tun hat, steht nicht hier, sondern in
 * kompatibilitaet.html — Lesen und Schreiben brauchen einen echten DOMParser
 * und laufen deshalb im Renderer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const app = process.argv[2];
const require = createRequire(pathToFileURL(path.join(app, 'x.js')));
const { XMLParser } = require('fast-xml-parser');

const core = pathToFileURL(path.join(app, 'renderer', 'js', 'core')).href;
const { transformDb } = await import(core + '/db.js');
const { createCharakter, BESCHREIBUNG_FELDER, synchronisiereUebernatuerlich, synchronisiere,
  findeVerlorenes, setzeTalent, talenteFuer } = await import(core + '/character.js');
const { gesamtEP, abgeleiteteWerte, kostenFreieFertigkeiten, fertigkeitBasiswert,
  fertigkeitProbenwert, waffenwerte } = await import(core + '/regeln.js');
// Als "erfuellt" eingebunden, damit der Name nicht mit dem Prüf-Helfer unten kollidiert.
const { pruefe: erfuellt, pruefeDetail, lesbar, zerlege } = await import(core + '/voraussetzungen.js');
const { exportHtml } = await import(core + '/export-html.js');
const { aufbereiten } = await import(core + '/regeltext.js');
const { regelnFuer, regelAnhangText, istVerfuegbar } = await import(core + '/regelwerk.js');
const { bauInfo, zuZeilen, alsText, hatInhalt } = await import(core + '/infotext.js');
const { leseInventar, schreibeInventar, aendereInventar, ergaenzeSets, ORT_MANN, ORT_RUCKSACK }
  = await import(core + '/ausruestung.js');

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', textNodeName: '_text',
  processEntities: { maxTotalExpansions: 100000, maxExpandedLength: 500000 },
  isArray: (n) => ['Attribut', 'AbgeleiteterWert', 'Energie', 'Vorteil', 'Fertigkeit', 'Talent',
    'ÜbernatürlicheFertigkeit', 'FreieFertigkeit', 'Waffe', 'Waffeneigenschaft', 'Rüstung',
    'Regel', 'Einstellung'].includes(n),
});
const db = transformDb(parser.parse(fs.readFileSync(path.join(app, 'daten', 'datenbank.xml'), 'utf-8')));

let fehler = 0;
const pruefe = (name, bedingung, zusatz = '') => {
  if (bedingung) console.log('  ok   ' + name);
  else { fehler++; console.log('  FEHLER ' + name + (zusatz ? ' -> ' + zusatz : '')); }
};

console.log('Datenbank');
pruefe('8 Attribute geladen', db.attribute.length === 8, String(db.attribute.length));
pruefe('21 Ilaris-Fertigkeiten geladen', db.fertigkeiten.length === 21, String(db.fertigkeiten.length));
pruefe('Talente mit variablen Kosten erkannt',
  db.talentByName['Adlerschwinge Wolfsgestalt']?.variableKosten === true);
pruefe('Talente mit Kommentarfeld erkannt',
  db.talentByName['Adlerschwinge Wolfsgestalt']?.kommentar === true);

console.log('\nAbgeleitete Werte und Schicksalspunkte');
{
  const c = createCharakter(db, { name: 'Test', gesamtEP: 2000 });
  const schip = (fin) => { c.finanzen = fin; return abgeleiteteWerte(c).SchiP; };
  pruefe('Sehr Reich = 0 SchiP', schip(0) === 0, String(schip(0)));
  pruefe('Reich = 2 SchiP', schip(1) === 2, String(schip(1)));
  pruefe('Normal = 4 SchiP', schip(2) === 4, String(schip(2)));
  pruefe('Arm = 5 SchiP', schip(3) === 5, String(schip(3)));
  pruefe('Sehr Arm = 6 SchiP', schip(4) === 6, String(schip(4)));
}

console.log('\nEP-Kosten');
{
  const leer = createCharakter(db, { gesamtEP: 0 });
  pruefe('leerer Charakter kostet 0', gesamtEP(leer, db).total === 0, String(gesamtEP(leer, db).total));

  const a = createCharakter(db, { gesamtEP: 0 });
  a.attribute.KO = 4;
  pruefe('KO 4 kostet 16 mal 10 = 160', gesamtEP(a, db).attribute === 160, String(gesamtEP(a, db).attribute));

  const g = createCharakter(db, { gesamtEP: 0 });
  g.heimat = 'Südaventurien';
  const fName = Object.keys(g.fertigkeiten)
    .find(n => (db.talenteByFertigkeit[n] || []).some(t => t.name === 'Gebräuche: Südaventurien'));
  if (fName) {
    g.fertigkeiten[fName].talente = ['Gebräuche: Südaventurien'];
    pruefe('Gebräuche der Heimat sind gratis', gesamtEP(g, db).talente === 0, String(gesamtEP(g, db).talente));
  }
}

console.log('\nFreie Fertigkeiten (Regel wie in Sephrasto, Charakter.py epZaehlen)');
{
  const nur = (freie) => kostenFreieFertigkeiten(freie, db);
  const eine = [{ name: 'Sprache: Garethi', wert: 3 }];
  const zwei = [{ name: 'Sprache: Garethi', wert: 3 }, { name: 'Sprache: Bosparano', wert: 2 }];
  const leerzeilen = [{ name: '', wert: 1 }, { name: '', wert: 1 }, { name: '', wert: 1 }];
  pruefe('Muttersprache auf Stufe 3 ist gratis', nur(eine) === 0, String(nur(eine)));
  pruefe('zweite Sprache auf Stufe 2 kostet 4 plus 8', nur(zwei) === 12, String(nur(zwei)));
  pruefe('leere Zeilen ohne Namen kosten nichts', nur(leerzeilen) === 0, String(nur(leerzeilen)));
}

console.log('\nTalente mit variablen Kosten');
{
  const c = createCharakter(db, { gesamtEP: 0 });
  c.talente = ['Adlerschwinge Wolfsgestalt'];
  pruefe('ohne eigenen Preis gilt der Datenbankwert 40',
    gesamtEP(c, db).uebernatTalente === 40, String(gesamtEP(c, db).uebernatTalente));
  c.talentKosten['Adlerschwinge Wolfsgestalt'] = 80;
  pruefe('mit eigenem Preis zählt der Charakterwert 80',
    gesamtEP(c, db).uebernatTalente === 80, String(gesamtEP(c, db).uebernatTalente));
}

console.log('\nVoraussetzungen: Grammatik wie in Sephrasto');
{
  const c = createCharakter(db, { gesamtEP: 0 });
  c.vorteile = ['Tiergeist (Wolf)', 'Tradition der Schamanen I'];
  c.attribute.GE = 10; c.attribute.KO = 8; c.attribute.MU = 8;
  c.spezies = 'Elf';

  pruefe('Vorteil vorhanden', erfuellt(c, db, 'Vorteil Tradition der Schamanen I'));
  pruefe('Vorteil fehlt', !erfuellt(c, db, 'Vorteil Tradition der Hexen I'));
  pruefe('Platzhalter trifft', erfuellt(c, db, 'Vorteil Tiergeist (*)'));
  pruefe('Kein Vorteil mit Platzhalter erkennt den vorhandenen Tiergeist',
    !erfuellt(c, db, 'Kein Vorteil Tiergeist (*)'));
  pruefe('Attribut-Schwelle', erfuellt(c, db, 'Attribut GE 10') && !erfuellt(c, db, 'Attribut GE 11'));
  // MeisterAttribut: GE 10 erfüllt, und die zwei höchsten übrigen (8 + 8 = 16)
  // müssen mindestens 10 mal 1,6 = 16 erreichen.
  pruefe('MeisterAttribut erfüllt bei 8 plus 8', erfuellt(c, db, 'MeisterAttribut GE 10'));
  c.attribute.MU = 7;
  pruefe('MeisterAttribut nicht erfüllt bei 8 plus 7', !erfuellt(c, db, 'MeisterAttribut GE 10'));
  pruefe('Spezies', erfuellt(c, db, 'Spezies Elf') && !erfuellt(c, db, 'Spezies Zwerg'));
  pruefe('UND über Komma', !erfuellt(c, db, 'Vorteil Tradition der Schamanen I, Vorteil Tradition der Hexen I'));
  pruefe('ODER innerhalb einer Klausel',
    erfuellt(c, db, 'Vorteil Tradition der Hexen I ODER Vorteil Tradition der Schamanen I'));
  pruefe('unbekannter Baustein blockiert nicht', erfuellt(c, db, 'Irgendwas Neues 5'));
  pruefe('zwei Klauseln erkannt', zerlege('Vorteil A, Vorteil B').length === 2);

  const d = pruefeDetail(c, db, 'Vorteil Tradition der Schamanen I, Vorteil Tradition der Hexen I');
  pruefe('Detail trennt erfüllt und offen', d.offen.length === 1 && d.erledigt.length === 1, JSON.stringify(d));
  pruefe('Anzeigetext wird lesbar gemacht',
    lesbar(db, 'Kein Vorteil Tiergeist (*)') === 'kein anderer Tiergeist',
    lesbar(db, 'Kein Vorteil Tiergeist (*)'));
}

console.log('\nÜbernatürliche Fertigkeiten folgen den Vorteilen');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  synchronisiereUebernatuerlich(c, db);
  pruefe('ohne Tradition keine Fertigkeiten', Object.keys(c.uebernatuerlich).length === 0,
    String(Object.keys(c.uebernatuerlich).length));

  c.vorteile = ['Zauberer I'];
  synchronisiereUebernatuerlich(c, db);
  pruefe('Zauberer allein genügt nicht', Object.keys(c.uebernatuerlich).length === 0,
    String(Object.keys(c.uebernatuerlich).length));

  c.vorteile = ['Zauberer I', 'Zauberer II', 'Zauberer III', 'Tradition der Gildenmagier I',
    'Privilegien (Gildenmagier)'];
  synchronisiereUebernatuerlich(c, db);
  const namen = Object.keys(c.uebernatuerlich);
  pruefe('Gildenmagier bekommt 20 Fertigkeiten', namen.length === 20, String(namen.length));
  pruefe('darunter Stabzauber und Verwandlung',
    namen.includes('Stabzauber') && namen.includes('Verwandlung'));
  pruefe('nicht darunter Hexenflüche', !namen.includes('Hexenflüche'));

  // Talente derselben Fertigkeit: gefiltert gegen ungefiltert
  const alleEinfluss = (db.talenteByFertigkeit['Einfluss'] || []).length;
  const offenEinfluss = (db.talenteByFertigkeit['Einfluss'] || [])
    .filter(t => erfuellt(c, db, t.voraussetzungen)).length;
  pruefe('Einfluss: 73 Talente insgesamt', alleEinfluss === 73, String(alleEinfluss));
  pruefe('Einfluss: davon 22 für den Gildenmagier', offenEinfluss === 22, String(offenEinfluss));

  let summeAlle = 0, summeOffen = 0;
  for (const n of namen) {
    const liste = db.talenteByFertigkeit[n] || [];
    summeAlle += liste.length;
    summeOffen += liste.filter(t => erfuellt(c, db, t.voraussetzungen)).length;
  }
  pruefe('über alle 20 Fertigkeiten: 360 statt 750 Talente',
    summeAlle === 750 && summeOffen === 360, `${summeOffen} von ${summeAlle}`);

  // Tradition entfernen: was ginge verloren?
  const verlust = findeVerlorenes(c, db, 'Tradition der Gildenmagier I');
  pruefe('Entfernen der Tradition kostet alle 20 Fertigkeiten',
    verlust.fertigkeiten.length === 20, String(verlust.fertigkeiten.length));

  // Ein gesteigerter Wert schützt die Fertigkeit vor dem automatischen Entfernen.
  c.uebernatuerlich['Feuer'].wert = 3;
  c.vorteile = ['Zauberer I'];
  const erg = synchronisiereUebernatuerlich(c, db);
  pruefe('ohne Tradition verschwinden die leeren Fertigkeiten', erg.entfernt.length === 19,
    String(erg.entfernt.length));
  pruefe('die gesteigerte Fertigkeit bleibt erhalten', Boolean(c.uebernatuerlich['Feuer']));
}

console.log('\nHausregel-Schalter');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  c.voraussetzungenPruefen = false;
  c.vorteile = ['Tradition der Gildenmagier I'];
  synchronisiereUebernatuerlich(c, db);
  pruefe('bei abgeschalteter Prüfung greift die Automatik nicht',
    Object.keys(c.uebernatuerlich).length === 0, String(Object.keys(c.uebernatuerlich).length));
}

console.log('\nTalente in einer Liste, unter mehreren Fertigkeiten');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  c.vorteile = ['Zauberer I', 'Zauberer II', 'Zauberer III', 'Tradition der Gildenmagier I'];
  synchronisiere(c, db);
  const T = 'Apport des Stabs';
  pruefe('Zauber gehört zu zwei Fertigkeiten',
    JSON.stringify(db.talentByName[T].fertigkeiten) === '["Stabzauber","Umwelt"]');
  setzeTalent(c, T);
  const ep1 = gesamtEP(c, db).total;
  pruefe('gilt unter Stabzauber als vorhanden', talenteFuer(c, db, 'Stabzauber').includes(T));
  pruefe('gilt auch unter Umwelt als vorhanden', talenteFuer(c, db, 'Umwelt').includes(T));
  setzeTalent(c, T);
  pruefe('lässt sich nicht doppelt eintragen', c.talente.filter(n => n === T).length === 1);
  pruefe('wird einmal bezahlt', gesamtEP(c, db).total === ep1, String(gesamtEP(c, db).total));
}

console.log('\nGeschenkte Talente aus Vorteil-Skripten');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  c.vorteile = ['Tradition der Schamanen I', 'Tiergeist (Wolf)'];
  synchronisiere(c, db);
  const geschenkt = Object.keys(c.geschenkteTalente);
  pruefe('Tiergeist Wolf schenkt 6 Talente', geschenkt.length === 6, String(geschenkt.length));
  pruefe('sie stehen im Charakter', geschenkt.every(n => c.talente.includes(n)));
  pruefe('und kosten nichts',
    gesamtEP(c, db).uebernatTalente === 0 && gesamtEP(c, db).talente === 0,
    `${gesamtEP(c, db).talente} profan, ${gesamtEP(c, db).uebernatTalente} übernatürlich`);

  c.vorteile = ['Tradition der Schamanen I'];
  synchronisiere(c, db);
  pruefe('ohne den Vorteil verschwinden sie wieder',
    geschenkt.every(n => !c.talente.includes(n)), c.talente.join(', '));
}

console.log('\nAufschläge aus Vorteil-Skripten auf die abgeleiteten Werte');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  c.attribute.MU = 8; c.attribute.KO = 8; c.attribute.GE = 8; c.attribute.IN = 4;
  const ohne = abgeleiteteWerte({ ...c, wertMods: {} });

  c.vorteile = ['Willensstark I', 'Flink I', 'Unverwüstlich', 'Kampfreflexe', 'Abgehärtet II'];
  synchronisiere(c, db);
  const mit = abgeleiteteWerte(c);
  pruefe('Willensstark I gibt 4 Magieresistenz', mit.MR === ohne.MR + 4, `${mit.MR} statt ${ohne.MR + 4}`);
  pruefe('Flink I gibt 1 Geschwindigkeit', mit.GS === ohne.GS + 1, `${mit.GS} statt ${ohne.GS + 1}`);
  pruefe('Unverwüstlich gibt 1 Wundschwelle', mit.WS === ohne.WS + 1, `${mit.WS} statt ${ohne.WS + 1}`);
  pruefe('Kampfreflexe geben 4 Initiative', mit.INI === ohne.INI + 4, `${mit.INI} statt ${ohne.INI + 4}`);
  pruefe('Abgehärtet II gibt 2 Durchhaltevermögen', mit.DH === ohne.DH + 2, `${mit.DH} statt ${ohne.DH + 2}`);

  // Unbeugsamkeit rechnet mit dem Mut: int(MU/2 + 0,5)
  const u = createCharakter(db, { gesamtEP: 0 });
  u.attribute.MU = 7;
  u.vorteile = ['Unbeugsamkeit'];
  synchronisiere(u, db);
  pruefe('Unbeugsamkeit gibt bei MU 7 vier Punkte Magieresistenz',
    u.wertMods.MR === 4, String(u.wertMods.MR));

  const r = createCharakter(db, { gesamtEP: 0 });
  r.vorteile = ['Rüstungsgewöhnung'];
  r.ruestungen = [{ name: 'Test', be: 3, rs: '2/2/2/2/2/2' }];
  synchronisiere(r, db);
  pruefe('Rüstungsgewöhnung senkt die Behinderung um 1', abgeleiteteWerte(r).BE === 2,
    String(abgeleiteteWerte(r).BE));
}

console.log('\nProbenwert mit und ohne Talent');
{
  const c = createCharakter(db, { gesamtEP: 0 });
  c.attribute.KL = 6; c.attribute.IN = 6; c.attribute.CH = 6;
  const f = db.fertigkeitByName['Magiekunde'] || db.fertigkeiten[0];
  const basis = fertigkeitBasiswert(c, f);
  pruefe('mit Talent: Basiswert plus voller Wert',
    fertigkeitProbenwert(c, f, 6, true) === basis + 6, String(fertigkeitProbenwert(c, f, 6, true)));
  pruefe('ohne Talent: Basiswert plus halber Wert, aufgerundet',
    fertigkeitProbenwert(c, f, 6, false) === basis + 3, String(fertigkeitProbenwert(c, f, 6, false)));
  pruefe('ungerader Wert wird aufgerundet',
    fertigkeitProbenwert(c, f, 5, false) === basis + 3, String(fertigkeitProbenwert(c, f, 5, false)));
}

console.log('\nTexte für den Screenreader aufbereitet');
{
  pruefe('Fettauszeichnung verschwindet, Inhalt bleibt',
    aufbereiten('<b>Mächtige Magie:</b> Du erfährst mehr.') === 'Mächtige Magie: Du erfährst mehr.',
    aufbereiten('<b>Mächtige Magie:</b> Du erfährst mehr.'));
  pruefe('eckige Klammern fallen weg, Inhalt bleibt',
    aufbereiten('Euphorisch für [Unternehmen]') === 'Euphorisch für Unternehmen',
    aufbereiten('Euphorisch für [Unternehmen]'));
  pruefe('typografische Anführungszeichen verschwinden',
    aufbereiten('die Eigenheit „Von Boron berührt“') === 'die Eigenheit Von Boron berührt',
    aufbereiten('die Eigenheit „Von Boron berührt“'));
  pruefe('Seitenverweis wird ausgeschrieben',
    aufbereiten('siehe S. 141') === 'siehe Seite 141', aufbereiten('siehe S. 141'));
  pruefe('Gedankenstrich wird zum Komma',
    aufbereiten('Ilaris – das Regelwerk') === 'Ilaris, das Regelwerk',
    aufbereiten('Ilaris – das Regelwerk'));
  pruefe('Zeilenumbruch wird Satzende', aufbereiten('Eins<br>Zwei') === 'Eins. Zwei',
    aufbereiten('Eins<br>Zwei'));
  pruefe('Schrägstriche bleiben, sie tragen Bedeutung',
    aufbereiten('Probe IN/KL/KL gegen 20/28') === 'Probe IN/KL/KL gegen 20/28');

  // Die ganze Datenbank muss frei von Auszeichnungen sein.
  const alle = [...db.vorteile, ...db.talente, ...db.fertigkeiten, ...db.uebernat, ...db.attribute];
  const mitTags = alle.filter(x => /<[a-zA-Z/]/.test(x.text || '') || /<[a-zA-Z/]/.test(x.info || ''));
  const mitKlammern = alle.filter(x => /\[|\]/.test(x.text || ''));
  pruefe(`kein Text der Datenbank trägt noch Auszeichnungen`, mitTags.length === 0,
    mitTags.slice(0, 2).map(x => x.name).join(', '));
  pruefe('kein Text der Datenbank trägt noch eckige Klammern', mitKlammern.length === 0,
    mitKlammern.slice(0, 2).map(x => x.name).join(', '));
}

console.log('\nZusatzangaben zu Talenten');
{
  const t = db.talentByName['Ignifaxius Flammenstrahl'] || db.talentByName['Apport des Stabs'];
  pruefe('Seitenzahl eingelesen', typeof t.referenzseite === 'number' && t.referenzseite > 0,
    String(t.referenzseite));
  pruefe('Art des Spezialtalents eingelesen', t.spezialTyp === 0, String(t.spezialTyp));
  pruefe('Bezeichnungen aus der Einstellung',
    JSON.stringify(db.spezialTypen) === '["Zauber","Liturgie","Anrufung"]', JSON.stringify(db.spezialTypen));
  pruefe('Referenzwerk bekannt', db.referenzbuecher[0] === 'Ilaris', JSON.stringify(db.referenzbuecher));
  pruefe('Nachkauf bei Vorteilen eingelesen',
    db.vorteilByName['Einkommen I'].nachkauf === 'häufig', db.vorteilByName['Einkommen I'].nachkauf);
}

console.log('\nRegelwerk');
{
  pruefe('123 Regeln eingelesen', db.regeln.length === 123, String(db.regeln.length));
  pruefe('alphabetisch sortiert',
    db.regeln.every((r, i) => i === 0 || db.regeln[i - 1].name.localeCompare(r.name, 'de') <= 0));
  pruefe('13 Kategorien bekannt', db.regelTypen.length === 13, String(db.regelTypen.length));
  pruefe('Regeltexte sind aufbereitet',
    db.regeln.every(r => !/<[a-zA-Z/]/.test(r.text)),
    (db.regeln.find(r => /<[a-zA-Z/]/.test(r.text)) || {}).name);
  pruefe('Probenangaben eingelesen', db.regeln.filter(r => r.probe).length === 71,
    String(db.regeln.filter(r => r.probe).length));

  const c = createCharakter(db, { gesamtEP: 2000 });
  c.vorteile = ['Ausfall'];
  const eigene = regelnFuer(db, 'Vorteil', 'Ausfall', '');
  pruefe('Regel hängt am Vorteil Ausfall', eigene.some(r => r.name === 'Ausfall'),
    eigene.map(r => r.name).join(', '));
  pruefe('Regel ist für den Charakter verfügbar', istVerfuegbar(c, db, db.regelByName['Ausfall']));

  const ohne = createCharakter(db, { gesamtEP: 0 });
  pruefe('ohne den Vorteil nicht verfügbar', !istVerfuegbar(ohne, db, db.regelByName['Ausfall']));
  pruefe('Regeln ohne Voraussetzung gelten immer',
    istVerfuegbar(ohne, db, db.regelByName['Ausweichen']));

  const anhang = regelAnhangText(db, 'Vorteil', 'Ausfall', '');
  pruefe('Anhangtext nennt die Regel', anhang.includes('Ausfall'), anhang.slice(0, 80));
  pruefe('Anhangtext bleibt leer, wenn es nichts gibt',
    regelAnhangText(db, 'Vorteil', 'Einkommen I', '') === '');
}

console.log('\nKampfwerte und Kampfstile');
{
  const c = createCharakter(db, { gesamtEP: 3000 });
  c.attribute.GE = 8; c.attribute.KK = 8; c.attribute.FF = 8;
  c.fertigkeiten['Klingenwaffen'] = { wert: 6 };
  const saebel = db.waffen.find(w => w.name === 'Säbel');
  c.waffen = [{
    name: 'Säbel', id: 'Säbel', wuerfel: 2, wuerfelSeiten: 6, plus: 2,
    haerte: 10, rw: 1, wm: 0, kampfstil: 'Kein Kampfstil', eigenschaften: '',
  }];
  synchronisiere(c, db);

  const fdef = db.fertigkeitByName['Klingenwaffen'];
  const ungeuebt = waffenwerte(c, db, c.waffen[0]);
  pruefe('ohne Talent zählt der halbe Fertigkeitswert',
    ungeuebt.at === fertigkeitProbenwert(c, fdef, 6, false), `${ungeuebt.at}`);
  pruefe('Fertigkeit und Talent der Waffe erkannt',
    ungeuebt.fertigkeit === 'Klingenwaffen' && ungeuebt.talent === saebel.talent,
    `${ungeuebt.fertigkeit}, ${ungeuebt.talent}`);

  setzeTalent(c, saebel.talent);
  const geuebt = waffenwerte(c, db, c.waffen[0]);
  pruefe('mit Talent zählt der volle Fertigkeitswert',
    geuebt.at === fertigkeitProbenwert(c, fdef, 6, true) && geuebt.at > ungeuebt.at,
    `${geuebt.at} gegen ${ungeuebt.at}`);

  // Kampfstil Schildkampf gibt Verteidigung plus 1
  c.vorteile = ['Schildkampf I'];
  synchronisiere(c, db);
  pruefe('Kampfstil aus dem Vorteilsskript erkannt',
    c.kampfstilMods['Schildkampf'] && c.kampfstilMods['Schildkampf'].vt === 1,
    JSON.stringify(c.kampfstilMods));
  const ohneStil = waffenwerte(c, db, c.waffen[0]);
  c.waffen[0].kampfstil = 'Schildkampf';
  const mitStil = waffenwerte(c, db, c.waffen[0]);
  pruefe('Kampfstil wirkt erst, wenn er an der Waffe eingestellt ist',
    mitStil.vt === ohneStil.vt + 1, `${mitStil.vt} gegen ${ohneStil.vt}`);
  pruefe('Attacke bleibt beim Schildkampf unverändert', mitStil.at === ohneStil.at);

  // Reiterkampf II wirkt auf mehrere Werte zugleich
  const r = createCharakter(db, { gesamtEP: 0 });
  r.vorteile = ['Reiterkampf II'];
  synchronisiere(r, db);
  const rk = r.kampfstilMods['Reiterkampf'];
  pruefe('Reiterkampf II gibt Attacke, Verteidigung, Schaden und weniger Behinderung',
    rk.at === 1 && rk.vt === 1 && rk.tp === 1 && rk.be === -1, JSON.stringify(rk));

  // Bögen haben keine Verteidigung
  const bogen = db.waffen.find(w => db.waffenTalenteVTverboten.includes(w.talent));
  if (bogen) {
    const b = { name: bogen.name, id: bogen.name, wuerfel: 1, wuerfelSeiten: 6, rw: 5, wm: 0 };
    pruefe(`${bogen.name}: keine Verteidigung`, waffenwerte(c, db, b).vt === null);
  }
}

console.log('\nAusrüstung: Sets und Inventarorte');
{
  const c = createCharakter(db, { gesamtEP: 2000 });
  c.ausruestung = ['Fackel', 'Im Rucksack: Seil, 10 Schritt', 'Wasserschlauch'];
  const inv = leseInventar(c);
  pruefe('drei Gegenstände gelesen', inv.gegenstaende.length === 3, String(inv.gegenstaende.length));
  pruefe('ohne Vorsatz gilt am Mann', inv.gegenstaende[0].ort === ORT_MANN);
  pruefe('Rucksack erkannt',
    inv.gegenstaende[1].ort === ORT_RUCKSACK && inv.gegenstaende[1].text === 'Seil, 10 Schritt',
    JSON.stringify(inv.gegenstaende[1]));
  pruefe('Hin und zurück ohne Verlust', (() => {
    schreibeInventar(c, inv);
    return c.ausruestung.length === 3 && c.ausruestung[1] === 'Im Rucksack: Seil, 10 Schritt';
  })(), JSON.stringify(c.ausruestung));

  // Sets aus dem Waffenkauf
  const saebel = db.waffen.find(w => w.name === 'Säbel');
  const bogen = db.waffen.find(w => w.fk === '1' || w.fk === 1);
  c.waffen = [{ name: 'Säbel', id: 'Säbel', wuerfel: 2, wuerfelSeiten: 6, plus: 2, rw: 1, wm: 0 }];
  ergaenzeSets(c, db);
  let m = leseInventar(c);
  pruefe('Set Waffenlos wird immer angelegt', m.waffenSets[0].name === 'Waffenlos',
    JSON.stringify(m.waffenSets.map(s => s.name)));
  pruefe('erste Waffe kommt in die Haupthand',
    m.waffenSets.some(s => s.haupthand === 'Säbel'), JSON.stringify(m.waffenSets));

  if (bogen) {
    c.waffen.push({ name: bogen.name, id: bogen.name, wuerfel: 1, wuerfelSeiten: 6, rw: 5, wm: 0 });
    ergaenzeSets(c, db);
    m = leseInventar(c);
    pruefe('Fernkampfwaffe kommt auf den Fernkampfplatz',
      m.waffenSets.some(s => s.fernkampf === bogen.name), JSON.stringify(m.waffenSets));
  }

  ergaenzeSets(c, db);
  const nachher = leseInventar(c);
  pruefe('erneutes Ergänzen legt nichts doppelt an',
    nachher.waffenSets.length === m.waffenSets.length,
    `${nachher.waffenSets.length} statt ${m.waffenSets.length}`);
  pruefe('Gegenstände überstehen das Anlegen der Sets',
    nachher.gegenstaende.length === 3, String(nachher.gegenstaende.length));

  // Rüstungssets
  aendereInventar(c, (mm) => { mm.ruestungsSets.push({ name: 'Reise', teile: ['Lederharnisch', 'Kappe'] }); });
  const r = leseInventar(c);
  pruefe('Rüstungsset mit Teilen gelesen',
    r.ruestungsSets.length === 1 && r.ruestungsSets[0].teile.length === 2,
    JSON.stringify(r.ruestungsSets));

  // Alles landet als Text in der Ausrüstungsliste, die Sephrasto durchreicht.
  pruefe('Sets stehen als lesbare Zeilen in der Ausrüstung',
    c.ausruestung.some(z => z.startsWith('Waffenset: ')) && c.ausruestung.some(z => z.startsWith('Rüstungsset: ')),
    c.ausruestung.filter(z => z.includes('set')).join(' | '));
  pruefe('kein Steuerzeichen nötig', c.ausruestung.every(z => !/[ -]/.test(z)));
}

console.log('\nInfo-Struktur (Überschriften und Zeilen)');
{
  const info = bauInfo([
    ['Kosten', '20 EP.'],
    ['Voraussetzungen', 'Es fehlt: Attribut CH 4.'],
    ['Beschreibung', 'Ein langer Satz. Noch ein Satz.'],
    ['Leer', ''],                    // leerer Abschnitt wird übersprungen
  ]);
  const ueber = info.filter(z => z.ueberschrift).map(z => z.text);
  pruefe('drei Überschriften, der leere Abschnitt fehlt',
    ueber.length === 3 && ueber.join(',') === 'Kosten,Voraussetzungen,Beschreibung', ueber.join(','));
  pruefe('mehrsatziger Inhalt wird in Zeilen zerlegt',
    info.filter(z => !z.ueberschrift).length === 4, String(info.filter(z => !z.ueberschrift).length));

  pruefe('zuZeilen aus String macht Zeilen ohne Überschrift',
    zuZeilen('Satz eins. Satz zwei.').every(z => !z.ueberschrift));
  pruefe('zuZeilen reicht strukturierte Liste durch',
    zuZeilen(info).length === info.length);
  pruefe('alsText fügt alles zu einem Text',
    typeof alsText(info) === 'string' && alsText(info).includes('Kosten') && alsText(info).includes('20 EP'));
  pruefe('hatInhalt erkennt Leere', !hatInhalt('') && !hatInhalt([]) && hatInhalt(info));
}

console.log('\nHTML-Export');
{
  const c = createCharakter(db, { name: 'Isna-Iti', gesamtEP: 2000 });
  c.status = 3;
  for (const f of BESCHREIBUNG_FELDER) c[f.key] = 'Wert ' + f.label;
  c.aussehen[0] = 'Narbe & "Tattoo" <Moha>';
  c.hintergrund[0] = 'Tochter einer Kleinbäuerin aus dem Bornland';
  c.eigenheiten = [{ name: 'Ein Kind der Großstadt', positiv: 'kennt jede Gasse', negativ: 'verirrt sich' }];
  const html = exportHtml(c, db);
  pruefe('enthält Aussehen', html.includes('<h2>Aussehen</h2>'));
  pruefe('enthält die beschrifteten Felder', html.includes('Geschlecht') && html.includes('Titel'));
  pruefe('enthält die freien Aussehen-Zeilen', html.includes('Narbe'));
  pruefe('enthält Eigenheiten', html.includes('A: Ein Kind der Großstadt'));
  pruefe('enthält Hintergrund', html.includes('<h2>Familie, Hintergrund und Herkunft</h2>')
    && html.includes('Kleinbäuerin'));
  pruefe('enthält Status Unterschicht', html.includes('Status: Unterschicht'));
  pruefe('Sonderzeichen maskiert', html.includes('&amp;') && html.includes('&lt;Moha&gt;'));
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles in Ordnung.');
process.exit(fehler ? 1 : 0);
