/**
 * Skularis — nachgelieferte Talent-Beschreibungen.
 *
 * Manche Talente stehen in der Regeldatenbank ohne Beschreibungstext (leeres
 * text-Feld). Hier ergänzen wir sinnvolle Erklärungen, ohne die datenbank.xml
 * anzufassen — so überleben sie einen Neuimport der Datenbank. Der DB-Aufbau
 * (core/db.js) nutzt diese Texte als Rückfall, wenn das text-Feld leer ist.
 *
 * Schlüssel = exakter Talentname aus der Datenbank.
 */

export const TALENT_TEXTE = {
  // --- Gebräuche (Fertigkeit Menschenkenntnis/Etikette-Umfeld) ---------------
  // Das Talent Gebräuche steht für das Wissen um Sitten, Etikette, Feste,
  // Tabus, Höflichkeitsformen und ungeschriebene Regeln einer Region. Wer sich
  // auskennt, tritt nicht ins Fettnäpfchen und wird als Einheimischer akzeptiert.

  'Gebräuche: Mittelreich': 'Sitten, Etikette und Umgangsformen des Mittelreichs, des größten Reichs Aventuriens. '
    + 'Praios-fromme Ordnung, Standesdenken und höfische Höflichkeit prägen den Alltag; man grüßt nach Rang, '
    + 'wahrt die Form und hält Feiertage der Zwölfgötter ein. Regionen: Garetien, Kosch, Almada, Weiden, '
    + 'Nordmarken. Beispiel: Wer bei Hofe in Gareth die richtige Anrede und Tischordnung kennt, gilt als gebildet.',

  'Gebräuche: Tulamidenlande': 'Sitten der Tulamiden im Süden und Osten, geprägt von Rastullahs Glauben in den '
    + 'Wüstenreichen und alter Zauberei in den Diamantenen Sultanaten. Gastrecht ist heilig, Handel und '
    + 'blumige Höflichkeit gehören zusammen, die linke Hand gilt als unrein. Regionen: Khôm, Mhanadistan, '
    + 'Aranien, Brabak-Umland. Beispiel: Wer die Teezeremonie und das Feilschen beherrscht, gewinnt Vertrauen.',

  'Gebräuche: Südaventurien': 'Sitten der südlichen Reiche jenseits des Regengebirges, von Al’Anfa bis zu den '
    + 'Städten der Perlenmeerküste. Boron-Kult, strenge Standesgrenzen, Sklavenhaltung und ein oft giftiges '
    + 'Ränkespiel bestimmen das Leben. Regionen: Al’Anfa, Brabak, Charypso, Meridiana. Beispiel: Wer weiß, '
    + 'wann Schmeichelei und wann Schweigen angebracht ist, überlebt die höfischen Intrigen der Schwarzen Perle.',

  'Gebräuche: Bornland': 'Sitten des Bornlands im Nordosten, wo der niedere Adel (die Vögte und Brölosch) und '
    + 'freie Bauern eng zusammenleben. Derbe Herzlichkeit, Trinkfestigkeit, Peraine- und Firun-Glaube sowie '
    + 'ein tiefes Misstrauen gegen Zauberei prägen die Leute. Regionen: Festum, Notmark, Tobrien-Grenze. '
    + 'Beispiel: Wer beim Umtrunk mithält und geradeheraus spricht, wird als ehrlicher Kerl geachtet.',

  'Gebräuche: Thorwal': 'Sitten der Thorwaler an der Westküste, eines stolzen Seefahrervolks ohne Adel. '
    + 'Swafnir-Glaube, die Versammlung (Thing), Ehre im Wort und die Otta (der Beuteanteil) zählen mehr als '
    + 'Gold. Frauen und Männer gelten als gleich. Regionen: Thorwal, Prem, Olport, die Efferdwoge. '
    + 'Beispiel: Wer einen Faustkampf annimmt und sein Wort hält, findet unter Thorwalern schnell Freunde.',

  'Gebräuche: Maraskan': 'Sitten der Insel Maraskan im Osten, geprägt vom Rur-und-Gror-Glauben (dem Zwiefachen), '
    + 'von Reisbau, Aufsässigkeit gegen das Mittelreich und der berüchtigten Zweiklingen-Kampfkunst. Höflichkeit '
    + 'ist verschlungen, Gastfreundschaft echt, doch Fremden begegnet man wachsam. Regionen: Jergan, Boran, '
    + 'Sinoda. Beispiel: Wer die Bildsprache der Maraskani und ihre Sprichwörter versteht, wird nicht für einen '
    + 'Spitzel des Kaisers gehalten.',

  'Gebräuche: Elfen': 'Sitten der Elfen, die in Auelfen, Waldelfen und Firnelfen zerfallen und in Sippen leben. '
    + 'Zeit, Besitz und Eile bedeuten ihnen wenig; Musik, Wahrhaftigkeit und die Verbundenheit mit der Natur '
    + 'alles. Direkte Fragen und Lügen gelten als grob. Regionen: Salamandersteine, Wäldchen des Lieblichen '
    + 'Feldes, der hohe Norden. Beispiel: Wer Geduld zeigt und in Bildern statt Befehlen spricht, öffnet '
    + 'elfische Herzen.',

  'Gebräuche: Zwerge': 'Sitten der Zwerge, eines Volks von Bergbau, Schmiedekunst und langem Gedächtnis. '
    + 'Angroschs Kinder achten Handwerk, Vertragstreue, Ahnen und das gegebene Wort; Hast und leere Worte '
    + 'verachten sie. Bärte und Sippenzeichen sagen viel über Rang und Herkunft. Stämme: Brillantzwerge, '
    + 'Erzzwerge, Hügelzwerge, Amboßzwerge, Wildzwerge. Beispiel: Wer die Qualität einer Arbeit ehrlich lobt '
    + 'und einen Handschlag nie bricht, gewinnt zwergischen Respekt.',

  'Gebräuche: Horasreich': 'Sitten des Horasreichs im lieblichen Südwesten, Erbe des alten Bosparanischen '
    + 'Reichs. Bildung, Mode, Kunst, feine Küche und elegante Umgangsformen zählen viel; man gibt sich '
    + 'weltgewandt und kultiviert. Rahja- und Hesinde-Glaube blühen. Regionen: Vinsalt, Kuslik, Belhanka, '
    + 'das Liebliche Feld. Beispiel: Wer den neuesten Modeschnitt, den richtigen Wein und ein galantes '
    + 'Kompliment kennt, gilt in Vinsalt als gebildeter Gast.',
};
