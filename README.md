# Skularis

Barrierefreie Charaktererstellung für das DSA-Hausregelsystem **Ilaris** — eine
zugängliche Übersetzung von [Sephrasto](https://github.com/Aeolitus/Sephrasto).

Skularis übernimmt Sephrastos Regeln und Daten zu 100 % und speichert Charaktere
als echte **Sephrasto-`.xml`** (in Sephrasto öffenbar), ist dabei aber vollständig
per Tastatur und Screenreader (NVDA) bedienbar — und für Sehende genauso gut.

## Funktionen

- Charaktererstellung wie in Sephrasto: **frei** oder **geführt** (Assistent für
  Spezies, Kultur, Profession).
- Alle Bereiche: Attribute, Fertigkeiten + Talente, Vorteile, Übernatürliches
  (Zauber/Liturgien), Ausrüstung, Beschreibung — mit **Live-EP**.
- Charakterverwaltung: speichern, öffnen, umbenennen, Erfahrungspunkte
  hinzufügen, als HTML-Charakterblatt exportieren, löschen.
- Alle Charaktere liegen als `.xml` im Ordner `Charakter-Dateien` — der ganze
  Ordner ist weitergabefähig.

## Rechenkern

Die EP-/Regel-Engine ist gegen **alle 72 mitgelieferten Sephrasto-Vorlagen**
getestet (72/72 EP exakt) und der Sephrasto-XML-Rundlauf ist verlustfrei.

## Starten (Entwicklung)

```
npm install
npm start
```

Oder die Datei `Skularis starten.bat` ausführen.

## Regelwerk

Ilaris von Lukas Rügge. Skularis ist ein Fan-Werkzeug ohne offizielle Verbindung
zu Ulisses Spiele oder den Ilaris-/Sephrasto-Autoren.
