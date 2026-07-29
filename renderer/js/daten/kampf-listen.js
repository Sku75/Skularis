/**
 * Skularistool — kuratierte Kampf- und Zauberlisten (Ilaris, zweite Version,
 * Copyright Ulisses Spiele GmbH, freies Fan-Regelwerk).
 *
 * Die Tooltips sind von Hand aus dem Regeltext geglättet (kurz und klar für den
 * Screenreader). Für das Live-Spiel: Aktionen, Nahkampf-Manöver und spontane
 * Zauber-Modifikationen. Minus und Plus stehen als Wörter, damit die Ansage
 * eindeutig ist.
 */

// --- Aktionen -------------------------------------------------------------
// Pro Initiativephase: eine volle ODER zwei einfache Aktionen (dann alle Proben
// in diesen Aktionen um 4 erschwert), dazu beliebig viele Freie Aktionen.

export const AKTIONEN = [
  {
    name: 'Konflikt', typ: 'einfach',
    tooltip: 'Du greifst an, schleuderst einen vorbereiteten Zauber oder schüchterst ein. '
      + 'Fast jede Aktion mit einer vergleichenden Probe ist ein Konflikt.',
  },
  {
    name: 'Bereit machen', typ: 'einfach',
    tooltip: 'Du ziehst eine Waffe, kramst einen Heiltrank hervor oder führst andere '
      + 'Handgriffe aus, die nicht deine volle Aufmerksamkeit brauchen.',
  },
  {
    name: 'Bewegung', typ: 'einfach',
    tooltip: 'Du läufst, reitest oder schwingst dich fort. Normal GS Schritt weit; '
      + 'geradeaus vorwärts doppelt so weit, ohne Gepäck und Rüstung sogar viermal so weit. '
      + 'Auf unsicherem Boden die Hälfte, kniend ein Viertel.',
  },
  {
    name: 'Volle Offensive', typ: 'voll',
    tooltip: 'Ein tollkühner Angriff: alle deine Nahkampfangriffe sind um 4 erleichtert, '
      + 'alle deine Verteidigungen bis zur nächsten Initiativephase um 8 erschwert.',
  },
  {
    name: 'Volle Defensive', typ: 'voll',
    tooltip: 'Du konzentrierst dich ganz auf die Abwehr: alle Verteidigungen bis zur '
      + 'nächsten Initiativephase sind um 4 erleichtert. Mit dem Vorteil Defensiver '
      + 'Kampfstil ist es nur eine einfache Aktion.',
  },
  {
    name: 'Konzentration', typ: 'voll',
    tooltip: 'Du tust etwas, das volle Konzentration braucht, etwa einen Zauber oder '
      + 'Fernkampfangriff vorbereiten. Keine Reaktionen oder Freien Aktionen möglich; '
      + 'bei Störung eine Willenskraft-Probe gegen 16, je frischer Wunde um 4 schwerer.',
  },
  {
    name: 'Verzögern', typ: 'voll',
    tooltip: 'Du wartest auf ein bestimmtes Ereignis und führst dann eine einfache Aktion '
      + 'aus, die um 4 erschwert ist. Tritt das Ereignis bis zur nächsten Initiativephase '
      + 'nicht ein, verfällt die Aktion.',
  },
  {
    name: 'Freie Aktion', typ: 'frei',
    tooltip: 'Zusätzlich beliebig viele verschiedene Freie Aktionen: bis zu 2 Schritt gehen, '
      + 'einen kurzen Satz rufen, dich umdrehen oder etwas fallen lassen. Jede nur einmal.',
  },
];

export const AKTION_GRUPPEN = [
  { typ: 'einfach', titel: 'Einfache Aktionen' },
  { typ: 'voll', titel: 'Volle Aktionen' },
  { typ: 'frei', titel: 'Freie Aktionen' },
];

// --- Nahkampf-Manöver -----------------------------------------------------
// mod = Ansage der Probenänderung als Text. kategorie: Basis, Eingeschränkt, Aufbauend.

export const MANOEVER = [
  // Basismanöver
  {
    name: 'Ausweichen', kategorie: 'Basis', mod: 'VT minus 2 minus BE',
    tooltip: 'Der Verteidiger entgeht dem Angriff und allen Auswirkungen vollständig. '
      + 'Die sinnvollste waffenlose Verteidigung gegen Bewaffnete.',
  },
  {
    name: 'Binden', kategorie: 'Basis', mod: 'VT minus X',
    tooltip: 'Bis zum Ende der nächsten eigenen Initiativephase sind alle Verteidigungen '
      + 'des Gegners um X erschwert, höchstens um 8.',
  },
  {
    name: 'Entfernung verändern', kategorie: 'Basis', mod: 'AT minus BE',
    tooltip: 'Du löst dich aus dem Nahkampf, ohne Passierschläge zu riskieren.',
  },
  {
    name: 'Entwaffnen', kategorie: 'Basis', mod: 'AT minus 4 oder VT minus 4',
    tooltip: 'Gegenprobe KK. Dem Ziel wird eine Waffe deiner Wahl entrissen, die danach am '
      + 'Boden liegt. Der Angriff richtet keinen Schaden an.',
  },
  {
    name: 'Gezielter Schlag', kategorie: 'Basis', mod: 'AT minus 2',
    tooltip: 'Du bestimmst die getroffene Trefferzone. Nur beim Spiel mit Trefferzonen.',
  },
  {
    name: 'Umreißen', kategorie: 'Basis', mod: 'AT',
    tooltip: 'Gegenprobe GE, bei großen Gegnern KO. Dein Ziel stürzt und liegt am Boden. '
      + 'Der Angriff richtet keinen Schaden an.',
  },
  {
    name: 'Wuchtschlag', kategorie: 'Basis', mod: 'AT minus X',
    tooltip: 'Der Angriff richtet X Trefferpunkte mehr an, höchstens 8.',
  },
  // Eingeschränkte Basismanöver
  {
    name: 'Auflaufen lassen', kategorie: 'Eingeschränkt', mod: 'VT minus 4',
    tooltip: 'Der Verteidiger fügt dem Angreifer seinen Waffenschaden plus die Geschwindigkeit '
      + 'des Angreifers zu. Voraussetzung: größere Reichweite; Gegner bewegt sich vor dem Angriff.',
  },
  {
    name: 'Rüstungsbrecher', kategorie: 'Eingeschränkt', mod: 'AT minus 4',
    tooltip: 'Der Angriff richtet Strukturpunkte statt Trefferpunkte an. '
      + 'Voraussetzung: Waffeneigenschaft Rüstungsbrechend.',
  },
  {
    name: 'Schildspalter', kategorie: 'Eingeschränkt', mod: 'AT plus 2',
    tooltip: 'Du fügst dem Schild des Gegners deinen Waffenschaden zu. '
      + 'Voraussetzung: Gegner führt ein Schild.',
  },
  {
    name: 'Stumpfer Schlag', kategorie: 'Eingeschränkt', mod: 'AT',
    tooltip: 'Der Angriff verursacht Erschöpfung statt Wunden. '
      + 'Voraussetzung: Waffeneigenschaft Stumpf.',
  },
  {
    name: 'Umklammern', kategorie: 'Eingeschränkt', mod: 'AT minus X',
    tooltip: 'Handlungen des Umklammerten sind um X erschwert, seine Geschwindigkeit sinkt auf 0. '
      + 'Voraussetzung: waffenloser Angriff mit beiden Händen; Ziel nicht größer.',
  },
  // Aufbauende Manöver
  {
    name: 'Ausfall', kategorie: 'Aufbauend', mod: 'AT minus 2 minus BE',
    tooltip: 'Das Ziel muss zurückweichen, du folgst. Greift es später einen anderen an, '
      + 'darfst du einen Passierschlag ausführen. Voraussetzung: Vorteil Ausfall.',
  },
  {
    name: 'Befreiungsschlag', kategorie: 'Aufbauend', mod: 'AT minus 4',
    tooltip: 'Deine Attacke richtet sich gegen alle Ziele in einem Winkel von 180 Grad vor dir. '
      + 'Voraussetzung: Vorteil Kraftvoller Kampf drei.',
  },
  {
    name: 'Doppelangriff', kategorie: 'Aufbauend', mod: 'zwei AT minus 4',
    tooltip: 'Du führst mit beiden Händen je eine Attacke minus 4 aus, unabhängig voneinander. '
      + 'Voraussetzung: Vorteil Beidhändiger Kampf drei.',
  },
  {
    name: 'Hammerschlag', kategorie: 'Aufbauend', mod: 'AT minus 8',
    tooltip: 'Der Angriff richtet doppelten Waffenschaden an. Voraussetzung: Vorteil Hammerschlag.',
  },
  {
    name: 'Klingentanz', kategorie: 'Aufbauend', mod: 'AT minus 4',
    tooltip: 'Gelingt der Angriff, darfst du sofort noch einmal angreifen, unerschwert. '
      + 'Voraussetzung: Vorteil Klingentanz.',
  },
  {
    name: 'Niederwerfen', kategorie: 'Aufbauend', mod: 'AT minus 4',
    tooltip: 'Gegenprobe KK. Dein Ziel stürzt und liegt am Boden. Voraussetzung: Vorteil Niederwerfen.',
  },
  {
    name: 'Todesstoß', kategorie: 'Aufbauend', mod: 'AT minus 8',
    tooltip: 'Der Angriff richtet zwei zusätzliche Wunden an, auch bei geringem Schaden. '
      + 'Voraussetzung: Vorteil Todesstoß.',
  },
  {
    name: 'Riposte', kategorie: 'Aufbauend', mod: 'VT minus 4',
    tooltip: 'Du fügst dem Angreifer deinen Waffenschaden zu. Voraussetzung: Vorteil Parierwaffenkampf drei.',
  },
  {
    name: 'Schildwall', kategorie: 'Aufbauend', mod: 'VT minus 4',
    tooltip: 'Du wehrst einen Angriff auf einen benachbarten Verbündeten ab. '
      + 'Voraussetzung: Vorteil Schildkampf drei.',
  },
  {
    name: 'Sturmangriff', kategorie: 'Aufbauend', mod: 'Bewegung und AT',
    tooltip: 'Bewegung und Angriff sind nicht erschwert, die Attacke richtet GS Trefferpunkte '
      + 'zusätzlich an. Voraussetzung: Vorteil Sturmangriff oder Reiterkampf eins.',
  },
  {
    name: 'Überrennen', kategorie: 'Aufbauend', mod: 'Bewegung und AT',
    tooltip: 'Das Reittier stürmt durch die Formation und trifft alle Gegner in seiner Bahn. '
      + 'Voraussetzung: Vorteil Reiterkampf drei.',
  },
  {
    name: 'Unterlaufen', kategorie: 'Aufbauend', mod: 'VT minus 4',
    tooltip: 'Gelingt die Verteidigung, darfst du in deiner nächsten Initiativephase per Freier '
      + 'Aktion angreifen. Voraussetzung: Vorteil Schneller Kampf drei.',
  },
];

export const MANOEVER_GRUPPEN = [
  { kategorie: 'Basis', titel: 'Basismanöver' },
  { kategorie: 'Eingeschränkt', titel: 'Eingeschränkte Basismanöver' },
  { kategorie: 'Aufbauend', titel: 'Aufbauende Manöver' },
];

// --- Spontane Zauber-Modifikationen --------------------------------------
// mod = Zahl, die auf das Probenergebnis wirkt (minus erschwert, plus erleichtert).
// variabel: true, wenn der Wert vom Spieler abhängt (dann 0 und im Text erklärt).

export const ZAUBER_MODIFIKATOREN = [
  // Basismodifikationen
  {
    name: 'Mächtige Magie', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Verstärkt die Wirkung des Zaubers. Konterproben dagegen sind um 4 erschwert.',
  },
  {
    name: 'Mehrere Ziele', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Der Zauber wirkt auf mehrere Ziele in Reichweite. Die Kosten zahlst du je Ziel einzeln.',
  },
  {
    name: 'Reichweite erhöhen', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Die Reichweite des Zaubers verdoppelt sich. Berührung wird zu 2 Schritt.',
  },
  {
    name: 'Vorbereitung verkürzen', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Die Vorbereitungszeit halbiert sich. Eine Aktion wird zu null Aktionen.',
  },
  {
    name: 'Wirkungsdauer verlängern', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Die Wirkungsdauer des Zaubers verdoppelt sich.',
  },
  {
    name: 'Zaubertechnik ignorieren', modText: 'Zauber minus 4', mod: -4, kategorie: 'Basis',
    tooltip: 'Du ignorierst eine Bedingung deiner Tradition, etwa Sicht, Geste oder Formel.',
  },
  // Aufbauende Modifikationen
  {
    name: 'Erzwingen', modText: 'Zauber plus 4', mod: 4, kategorie: 'Aufbauend',
    tooltip: 'Die Kosten steigen um die Hälfte der Basiskosten, dafür ist der Zauber um 4 '
      + 'erleichtert. Nur einmal pro Zauber. Voraussetzung: bestimmte Traditionen dritten Grades.',
  },
  {
    name: 'Kosten sparen', modText: 'Zauber minus 4', mod: -4, kategorie: 'Aufbauend',
    tooltip: 'Die Astralkosten sinken um ein Viertel der Basiskosten. Voraussetzung: Effizientes Zaubern.',
  },
  {
    name: 'Zeit lassen', modText: 'Zauber plus 2', mod: 2, kategorie: 'Aufbauend',
    tooltip: 'Verdoppelt die Vorbereitungszeit, erleichtert den Zauber um 2. '
      + 'Voraussetzung: bestimmte Traditionen dritten Grades.',
  },
  {
    name: 'Zeremonie', modText: 'Zauber plus X', mod: 0, variabel: true, kategorie: 'Aufbauend',
    tooltip: 'Du verlängerst die Vorbereitungszeit stark und erleichterst den Zauber um 4 bis 14. '
      + 'Den genauen Wert trägst du selbst als Erleichterung ein. Voraussetzung: Tradition der Schamanen drei.',
  },
  {
    name: 'Opferung', modText: 'Zauber plus 4', mod: 4, kategorie: 'Aufbauend',
    tooltip: 'Ein Opfer erleichtert den Zauber um 4. Voraussetzung: bestimmte Traditionen dritten Grades.',
  },
];
