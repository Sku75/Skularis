/**
 * Skularis — Erklärtexte der assistierten Charaktererstellung.
 *
 * Alle Texte stammen inhaltlich aus dem Ilaris-Regelwerk (Kapitel Generierung,
 * Eigenheiten, Status, Vorteile) beziehungsweise aus den Erklärtexten der
 * Regeldatenbank. Sie stehen hier gesammelt, damit Ansagen und Info-Felder an
 * einer Stelle gepflegt werden können.
 *
 * Konvention: schlichter Text, keine Schmucklinien, echte Umlaute. Der kurze
 * Text landet im Info-Feld der Seite, der lange als Detail (Shift und
 * Pfeil-runter beziehungsweise Strg und I).
 */

export const AUSSEHEN_KURZ =
  'Beschreibe, wie dein Charakter aussieht. Erst sieben beschriftete Felder, dann sechs freie Zeilen. '
  + 'Alles ist freiwillig und reine Beschreibung, es kostet keine Erfahrungspunkte. Pfeil hoch und '
  + 'runter wechselt das Feld, einfach hineinschreiben. Gespeichert wird beim Verlassen der Seite.';

export const AUSSEHEN_LANG =
  'Diese Felder sind genau die Felder von Sephrasto und vom Charakterbogen, mit denselben Namen und '
  + 'in derselben Reihenfolge. Was du hier einträgst, steht dort an genau derselben Stelle. '
  + 'Die Größe wird in Aventurien meist in Schritt angegeben, ein Schritt ist etwa ein Meter. '
  + 'Das Gewicht wird in Stein angegeben, ein Stein ist etwa ein Kilogramm. '
  + 'Beim Geburtsdatum kannst du auch einfach ein Alter eintragen. '
  + 'Der Titel meint eine Anrede oder einen Rang, zum Beispiel Junkerin von Wehrheim oder Magistra. '
  + 'Die sechs Zeilen darunter sind frei und tragen auch in Sephrasto keine eigene Beschriftung. '
  + 'Die Beispiele, die Skularis dazu ansagt, sind nur Vorschläge; du kannst jede Zeile für alles nutzen.';

export const HINTERGRUND_KURZ =
  'Neun freie Zeilen für Familie, Hintergrund und Herkunft. Woher kommt dein Charakter, wer gehört zu ihm, '
  + 'was hat ihn geprägt? Reine Beschreibung, kostet keine Erfahrungspunkte.';

export const HINTERGRUND_LANG =
  'Diese neun Zeilen sind dieselben, die Sephrasto und der Charakterbogen unter der Überschrift '
  + 'Familie, Hintergrund, Herkunft führen. Sie tragen dort keine eigene Beschriftung; die Beispiele, '
  + 'die Skularis ansagt, sind nur Vorschläge. '
  + 'Nicht zu verwechseln mit den Eigenheiten: Eigenheiten sind eine Regelmechanik und bringen dir '
  + 'Schicksalspunkte ein, der Hintergrund ist reine Beschreibung ohne Regelwirkung. '
  + 'Beides ergänzt sich aber gut: aus dem Hintergrund ergeben sich oft die passenden Eigenheiten. '
  + 'Das Regelwerk rät, den Hintergrund knapp zu halten und lieber im Spiel zu entwickeln.';

export const STATUS_KURZ =
  'Wähle deinen Status. Der Status bestimmt, wie dein Charakter in der zivilisierten Welt wahrgenommen wird. '
  + 'Regelseitig wirkt er sich nur auf die Lebenshaltungskosten aus, also wähle den Status, der zu deiner Charakteridee passt. '
  + 'Standard ist Unterschicht. Strg und I öffnet die ausführliche Ilaris-Erklärung.';

export const STATUS_LANG =
  'Der Status bestimmt, wie dein Charakter in der zivilisierten Welt wahrgenommen wird. '
  + 'Er ist nicht gleichbedeutend mit dem Stand des Charakters. Eine reiche Handelsherrin hätte '
  + 'beispielsweise einen höheren Status als ein verarmter Niederadliger. '
  + 'Der Status betrifft hauptsächlich den Hintergrund und sollte vor allem deiner Idee von deinem Charakter entsprechen. '
  + 'Spielrelevante Privilegien wie ein Adelstitel oder ein Kriegerbrief müssen als Vorteile gekauft werden. '
  + 'Regelseitig wirkt sich der Status nur auf die Lebenshaltungskosten aus. Diese geben den ungefähren Betrag an, '
  + 'den dein Charakter pro Monat für Unterkunft, Verpflegung, Kleidung und alle übrigen Ausgaben des täglichen Lebens ausgibt. '
  + 'Der Vorteil Einkommen kann helfen, auch hohe Lebenshaltungskosten zu bestreiten. '
  + 'Natürlich kann sich der Status im Laufe des Abenteurerlebens verändern, das sollte aber eher langsam geschehen.';

/**
 * Die fünf Ilaris-Status, von unten nach oben. Der Index ist der Wert, der in
 * die Charakterdatei geschrieben wird und entspricht der Reihenfolge der
 * Einstellung "Statusse" in der Regeldatenbank (0 Elite bis 4 Abschaum).
 */
export const STATUSSE = [
  {
    index: 4, name: 'Abschaum',
    kurz: 'ohne Rechte, 1 Dukat Lebenshaltungskosten pro Monat',
    lang: 'Selbst die Unterschicht blickt noch auf den Abschaum herab, der ständig vom Tod durch Hunger, '
      + 'Erschöpfung, Hitze oder Kälte bedroht ist. Der Abschaum ist entweder durch Leibeigenschaft oder '
      + 'Sklaverei von einem Herrn abhängig oder besitzt als fahrendes Volk, Verbrecher oder Tagelöhner gar keine Rechte. '
      + 'Beispiele: Sklavinnen, arme Leibeigene, Vagabundinnen, Wanderarbeiter. '
      + 'Lebenshaltungskosten: 1 Dukat pro Monat.',
  },
  {
    index: 3, name: 'Unterschicht',
    kurz: 'die Armen, meist Bauern, 4 Dukaten pro Monat, Standard',
    lang: 'Die Armen stellen in fast jeder menschlichen Gesellschaft die Mehrzahl der Bevölkerung. '
      + 'Das Wenige, das sie oft in harter körperlicher Arbeit verdienen, wird von Steuern, Abgaben oder '
      + 'Schutzgeldern aufgefressen. Der kärgliche Rest reicht häufig nur für ein kleines Kämmerchen, '
      + 'billiges Essen und geflickte Kleidung. Längere Reisen sind meist unmöglich. '
      + 'Angehörige der Unterschicht sind vom Kampf ums tägliche Überleben geprägt und haben die dafür nötigen Kniffe erlernt. '
      + 'Beispiele: arme Bürger, freie oder leibeigene Kleinbäuerinnen, Soldaten, Angehörige barbarischer Kulturen. '
      + 'Lebenshaltungskosten: 4 Dukaten pro Monat.',
  },
  {
    index: 2, name: 'Mittelschicht',
    kurz: 'Handwerker, Soldaten, Unteroffiziere, Geweihte, Magier, 16 Dukaten pro Monat',
    lang: 'In die Mittelschicht aufzusteigen, ist der Traum vieler Benachteiligter. Für sie wirkt der bescheidene '
      + 'Lebensstil mit wöchentlichen Wirtshausbesuchen, regelmäßiger Hygiene oder einer eigenen Wohnung bereits paradiesisch. '
      + 'Allerdings muss dieser bescheidene Luxus auch hart erarbeitet werden und der gesellschaftliche Abstieg liegt '
      + 'oft nur einen Schicksalsschlag entfernt. '
      + 'Beispiele: angesehene Bürgerinnen und Handwerker, Großbäuerinnen, einfache Geweihte, Zauberer und '
      + 'Akademieabgängerinnen, verarmte Adlige, Häuptlinge aus barbarischen Kulturen, viele Elfen und Zwerge. '
      + 'Lebenshaltungskosten: 16 Dukaten pro Monat.',
  },
  {
    index: 1, name: 'Oberschicht',
    kurz: 'erfolgreiche Händler, Kleinadel, Erzmagier, 64 Dukaten pro Monat',
    lang: 'Die Oberschicht genießt zahlreiche Privilegien, aber die Sorgen und Nöte der weniger Glücklichen sind '
      + 'ihnen oft ein Begriff. In ihren Häusern wird täglich Fleisch serviert, auch für mehrere Sätze Kleidung, '
      + 'bodenständige Unterhaltung und die Reise auf dem eigenen Pferd oder in einer Mietkutsche genügt das Geld. '
      + 'Beispiele: Niederadlige, angesehene Zauberinnen, Gelehrte, Geweihte und Offiziere, wohlhabende '
      + 'Großbürgerinnen, weise Mitglieder elfischer Sippen, zwergische Klanführer. '
      + 'Lebenshaltungskosten: 64 Dukaten pro Monat.',
  },
  {
    index: 0, name: 'Elite',
    kurz: 'Hochadel und wenige Leute sonst, mindestens 256 Dukaten pro Monat',
    lang: 'Angehörige der Elite sind es gewohnt, Befehle zu erteilen und Führungspositionen zu besetzen. '
      + 'Wahrscheinlich mussten sie sich noch nie in ihrem Leben um ihr Auskommen sorgen und sehen erlesenes Essen, '
      + 'Diener, Übernachtungen in noblen Hotels und Reisen in der eigenen Kutsche oder zu Pferd als selbstverständlich an. '
      + 'Dafür wird ihr Verhalten von der Öffentlichkeit genau beobachtet und sollte stets der Etikette oder '
      + 'ihrem Ehrenkodex entsprechen. '
      + 'Beispiele: Angehörige des Hochadels, reiche Patrizierinnen, Kirchenfürsten, Spektabilitäten und '
      + 'Handelsherrinnen, Bergkönige. '
      + 'Lebenshaltungskosten: mindestens 256 Dukaten pro Monat. '
      + 'Anmerkung: adlige Angehörige der Elite sollten in der Generierung den Vorteil Privilegien Adel wählen.',
  },
];

export const FINANZEN_KURZ =
  'Wie hoch ist dein Startkapital? Mehr Dukaten bedeutet weniger Schicksalspunkte. '
  + 'Eine Auswahl muss getroffen werden, Standard ist Normal mit 32 Dukaten und 4 Schicksalspunkten. '
  + 'Strg und I öffnet die ausführliche Ilaris-Erklärung.';

export const FINANZEN_LANG =
  'Ein Charakter startet normalerweise mit 4 Schicksalspunkten und einem Startkapital von 32 Dukaten, '
  + 'von dem er seine gesamte Ausrüstung bezahlt. Für manche Charaktere passt das nicht: eine Prinzessin '
  + 'besitzt vermutlich mehr, ein entflohener Minensklave weniger. Deswegen kannst du das Startkapital nach '
  + 'oben oder unten verschieben. Reiche und sehr reiche Charaktere starten mit 128 oder 256 Dukaten, dafür '
  + 'aber nur mit 2 oder 0 Schicksalspunkten. Arme oder sehr arme Charaktere dürfen zu Beginn nur 16 oder '
  + '4 Dukaten ausgeben, beginnen das Spiel aber mit 5 oder 6 Schicksalspunkten. '
  + 'Schicksalspunkte über dem Maximum von normalerweise 4 kannst du nicht zurückgewinnen. '
  + 'Die Finanzen spielen nur bei einem neuen Charakter eine Rolle.';

/**
 * Die fünf Finanzstufen, von arm nach reich. Der Index entspricht der
 * Einstellung "Finanzen" der Regeldatenbank (0 Sehr Reich bis 4 Sehr Arm);
 * die Schicksalspunkte berechnet die Engine daraus selbst.
 */
export const FINANZEN = [
  { index: 4, name: 'Sehr Arm', dukaten: 4, schip: 6 },
  { index: 3, name: 'Arm', dukaten: 16, schip: 5 },
  { index: 2, name: 'Normal', dukaten: 32, schip: 4, standard: true },
  { index: 1, name: 'Reich', dukaten: 128, schip: 2 },
  { index: 0, name: 'Sehr Reich', dukaten: 256, schip: 0 },
];

export const EIGENHEITEN_KURZ =
  'Lege nun mindestens 2 Eigenheiten fest. Eine Eigenheit beschreibt deinen Charakter und bringt dir '
  + 'jeweils positive wie negative Effekte. Führe mindestens je 2 positive und 2 negative Aspekte pro Eigenheit auf. '
  + 'Strg und I öffnet die ausführliche Ilaris-Erklärung mit Beispiel.';

export const EIGENHEITEN_LANG =
  'Eigenheiten beschreiben die Stärken und Schwächen deines Charakters, seine Vergangenheit, seine Ziele und '
  + 'seine Weltanschauung. Außerdem sind sie die wichtigste Möglichkeit, Schicksalspunkte zu erlangen. '
  + 'Zu Spielbeginn solltest du ungefähr vier Eigenheiten wählen. '
  + 'Eine Eigenheit einsetzen: passt eine deiner Eigenheiten zu deinem Vorhaben, kannst du Schicksalspunkte '
  + 'effektiver nutzen. Bei einer glücklichen Fügung erhältst du zwei zusätzliche Würfel statt einem, und du '
  + 'kannst für einen Schicksalspunkt einen Probenwurf wiederholen. '
  + 'Eine Eigenheit ausnutzen: Eigenheiten stellen auch die Schwächen und Marotten deines Charakters dar. '
  + 'Lässt du zu, dass der Spielleiter eine Eigenheit gegen dich ausnutzt, erhältst du dafür einen Schicksalspunkt. '
  + 'Deswegen gilt: Stärken und Schwächen balancieren. Idealerweise hat jede Eigenheit sowohl positive als auch '
  + 'negative Aspekte und kann sowohl eingesetzt als auch ausgenutzt werden. '
  + 'Außerdem sollte eine Eigenheit weder zu speziell noch zu allgemein sein. '
  + 'Es gibt bewusst keine Listen oder Tabellen von Eigenheiten, hier ist alles deiner Kreativität und dem '
  + 'Geschmack deiner Spielrunde überlassen. '
  + 'Ein Beispiel aus dem Regelwerk. Eigenheit: Ein Kind der Großstadt. '
  + 'Positive Aspekte: kennt jede Gasse und jedes Versteck, taucht in der Menge unter, weiß, wen man in der Stadt fragen muss. '
  + 'Negative Aspekte: verirrt sich rettungslos in der Wildnis, versteht wenig vom Landleben. '
  + 'Weitere Beispiele aus dem Regelwerk sind: Ich höre das Flüstern der Nipakau, '
  + 'Werkzeug? Schaffe ich auch ohne, und Hallo, Frau Königin.';

export const ATTRIBUTE_KURZ =
  'Verteile nun die wichtigsten Basiswerte deines Charakters, die Attribute. '
  + 'Pfeil links und rechts verändern den Wert, Pfeil hoch und runter wechseln die Zeile.';

export const ATTRIBUTE_LANG =
  'Die insgesamt acht Attribute stellen die geistige und körperliche Grundlage deines Charakters dar. '
  + 'Manchmal legst du Proben direkt auf Attribute ab. Aus den Attributen berechnen sich außerdem die '
  + 'abgeleiteten Werte und die Basiswerte aller Fertigkeiten: der Basiswert einer Fertigkeit ist der '
  + 'gerundete Mittelwert ihrer drei Attribute. '
  + 'Die Kosten steigen mit jedem Punkt: eine Steigerung auf den Wert W kostet den Steigerungsfaktor mal die '
  + 'Summe aller Werte von 1 bis W. Hohe Attribute sind also teuer, wirken aber breit.';

export const VORTEILE_KURZ =
  'Wähle nun deine Vorteile. Vorteile sind besondere Fähigkeiten, die deinem Charakter im Spiel nützen können. '
  + 'Strg und I öffnet die ausführliche Ilaris-Erklärung.';

export const VORTEILE_LANG =
  'Vorteile sind besondere Fähigkeiten, die deinem Charakter im Spiel nützen können. Sie können entweder schon '
  + 'bei der Generierung oder bei späteren Steigerungen gekauft werden, solange du die Voraussetzungen erfüllst, '
  + 'oft ein Attribut in einer bestimmten Höhe. Deswegen ist es kein Problem, wenn du zu Beginn noch nicht alle '
  + 'Vorteile kennst. Zu dieser Regel gibt es einige Ausnahmen: die Gabe der Magie etwa ist angeboren und kann '
  + 'nicht einfach erlernt werden, und ein Bettler steigt nicht durch Erfahrungspunkte in den Adelsstand auf. '
  + 'Unter dem Punkt Nachkauf findest du bei jedem allgemeinen Vorteil einen Hinweis, ob und unter welchen '
  + 'Bedingungen der Vorteil im späteren Spiel erworben werden kann. '
  + 'Die meisten Vertreter nichtmenschlicher Spezies besitzen bereits feste Vorteile: Achaz und Goblins für '
  + 'insgesamt 80 Erfahrungspunkte, Elfen und Zwerge für 100, Orks für 160. Diese bringt das Spezies-Paket bereits mit.';

export const SPEZIES_KURZ =
  'Wähle die Spezies deines Charakters. Das Paket setzt Attribute, Vorteile und Fertigkeiten passend zur '
  + 'Spezies. Eingabetaste wählt und geht direkt einen Schritt vor. Shift und Pfeil-runter liest, was ein '
  + 'Paket genau mitbringt.';

export const KULTUR_KURZ =
  'Wähle die Kultur deines Charakters, also woher er stammt und wie er aufgewachsen ist. '
  + 'Eingabetaste wählt und geht direkt einen Schritt vor. Shift und Pfeil-runter liest, was ein Paket genau mitbringt.';

export const PROFESSION_KURZ =
  'Wähle die Profession deines Charakters, also was er gelernt hat und wovon er lebt. '
  + 'Eingabetaste wählt und geht direkt einen Schritt vor. Shift und Pfeil-runter liest, was ein Paket genau mitbringt.';

export const PAKET_LANG =
  'Ein Paket ist eine fertige Zusammenstellung aus Attributen, Vorteilen, Fertigkeiten und Talenten. '
  + 'Skularis rechnet die Pakete additiv zusammen: du kannst jederzeit auf diese Seite zurückgehen und neu '
  + 'wählen, ohne dass sich etwas verdoppelt. Die Erfahrungspunkte des Pakets werden von deinen Gesamt-'
  + 'Erfahrungspunkten abgezogen. Mit Seite zurücksetzen nimmst du die Wahl dieser Seite wieder heraus.';

export const ABSCHLUSS_KURZ =
  'Du hast die assistierte Führung abgeschlossen. Drücke auf ein Schritt vor und gestalte deinen Charakter '
  + 'frei zu Ende. Zuerst solltest du dich den Fertigkeiten und Talenten widmen, die Seite ist dann bereits geöffnet. '
  + 'Bis hierhin ist der Charakter beim Drücken auf ein Schritt vor gespeichert.';

export const ABSCHLUSS_LANG =
  'Im freien Editor kannst du alles weiter bearbeiten, was der Assistent gesetzt hat, und dazu die Bereiche, '
  + 'die der Assistent nicht abdeckt: Fertigkeiten und Talente, Übernatürliches, Ausrüstung und die '
  + 'Erfahrungspunkte. Über Escape kommst du aus jedem Bereich wieder in die Übersicht des Editors zurück. '
  + 'Denk daran, den Charakter am Ende über Charakter speichern zu sichern.';
