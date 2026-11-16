# Voltalis

## Überblick

Diese Integration bringt die Verbraucher hinter Ihrer **Voltalis**-Box in Gladys: Heizgeräte am Pilotdraht, Warmwasserbereiter, weitere Lasten. Sie meldet sich wie die App mit E-Mail und Passwort Ihres **MyVoltalis**-Kontos an.

- Ein Gladys-Gerät je **Verbraucher**: Modus (aus, manuell, Programm), Voreinstellung (Frostschutz, Eco, Komfort), Solltemperatur, wenn der Verbraucher eine annimmt, und ein Energiezähler für das Energie-Dashboard von Gladys.
- Ein Gerät für das **Zuhause**: aktuelle Leistung und Energiezähler.
- Szenenauslöser (der Modus eines Geräts ändert sich, ein Gerät meldet eine Störung oder ist wieder in Ordnung) und Szenenaktionen (manueller Modus für eine Dauer, zurück zum Programm, Programme und Schnelleinstellungen, jetzt abfragen).
- Drei Dashboard-Widgets: die Geräte mit den Schaltflächen „Zurück zum Programm“ und „Frostschutz“, die Energie von heute und der letzten 24 Stunden sowie die Verbindung.

**Transport: Cloud.** Gladys spricht nie direkt mit Ihrer Box: Sie liest und beschreibt die Voltalis-Cloud, die die Änderungen weitergibt. Eine Änderung in Gladys wird sofort angezeigt und wenige Sekunden später bestätigt; eine Änderung in der MyVoltalis-App oder durch ein Programm erreicht Gladys bei der nächsten Abfrage. Ihre Daten verlassen Ihr Zuhause (das tun sie mit der Voltalis-Box bereits).

Keine Verbindung zu Voltalis. Genutzt wird der Dienst hinter der MyVoltalis-App; Voltalis **dokumentiert ihn nicht** und kann ihn ohne Vorankündigung ändern. Noch nicht mit einer echten Voltalis-Box getestet: Bitte melden Sie, was funktioniert und was nicht.

![Generierte Illustration der drei Widgets: die Voltalis-Geräte (Modus, Programm oder manuell, Störungen, Zurück zum Programm / Frostschutz), die Energie von heute, gestern und der letzten 24 Stunden sowie die Verbindung zu Voltalis — kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-voltalis/main/docs/assets/widgets.de.png)

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Eine zu Hause installierte **Voltalis-Box** (Voltalis stattet nur Haushalte in Frankreich aus).
- Ein **MyVoltalis-Konto**: Prüfen Sie, dass Sie sich mit E-Mail und Passwort in der App oder auf myvoltalis.com anmelden können. Voltalis bietet keinen getrennten Zugang für Dritte: Die Integration verwendet das Passwort Ihres Kontos.

## Konfiguration

Öffnen Sie in Gladys **Integrationen → Voltalis**:

| Feld                    | Beschreibung                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| E-Mail                  | Die E-Mail Ihres MyVoltalis-Kontos.                                                 |
| Passwort                | Dessen Passwort: nur an Voltalis gesendet, nie wieder angezeigt oder protokolliert. |
| Abfrageintervall        | Alle 1, 2, 5 oder 10 Minuten (Standard 2). Eine Anfrage liest alle Geräte.          |
| Sprache der Gerätetexte | Namen der Funktionen und Meldungen der Schaltfläche; standardmäßig automatisch.     |

Klicken Sie auf **Verbindung testen**: Die Integration liest Ihre Geräte und listet sie mit Typ und Funktionen auf. Öffnen Sie dann den Reiter **Entdecken** und fügen Sie die gewünschten Geräte sowie das Gerät „Voltalis-Zuhause“ hinzu: Ohne Sie wird nichts angelegt. Bei mehreren Wohnungen im Konto wird nur die Standardwohnung von MyVoltalis gelesen.

## Verwendung

### Geräte

Jeder Verbraucher bietet diese Funktionen, je nachdem, was MyVoltalis für ihn anbietet:

| Funktion       | Gladys-Typ                                           | Hinweise                                                                                                                               |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Modus          | Thermostatmodus: aus, heizen, automatisch            | Aus: ein manueller Stopp. Heizen: eine manuelle Einstellung (was das Gerät tut, bleibt). Automatisch: Das Gerät folgt seinem Programm. |
| Voreinstellung | Thermostat-Voreinstellung: Frostschutz, Eco, Komfort | Nur Heizgeräte. Die Auswahl legt eine manuelle Einstellung bis auf Weiteres an.                                                        |
| Solltemperatur | Thermostat-Sollwert, 7 bis 30 °C in 0,5 °C           | Nur wenn MyVoltalis den Modus „Temperatur“ anbietet. Eine Änderung legt eine manuelle Einstellung im Temperaturmodus an.               |
| Energie        | Energiezähler (kWh)                                  | Von der Integration aus den von Voltalis gemessenen Stunden gezählt; speist die Verbrauchs- und Kostenseiten von Gladys.               |

Das Gerät **Voltalis-Zuhause** bietet die aktuelle Leistung (die letzten 10 von Voltalis gemessenen Minuten) und einen Energiezähler für das ganze Zuhause.

Voltalis liefert die Energie **stündlich** und mit etwas Verzögerung: Der Zähler bewegt sich einige Male pro Stunde, nicht fortlaufend. Er beginnt mit den Stunden des Tages, an dem das Gerät erstmals gelesen wird: Gladys nutzt nur seine Zunahmen. Eine Box misst keine Raumtemperaturen: Es gibt keinen Temperatursensor.

### Dashboard-Widgets

- **Voltalis-Geräte**: jedes Gerät mit dem, was es tut, und wer es bestimmt hat (das Programm oder eine manuelle Einstellung und ihr Ende), ein Badge (manuell, Störung, Befehl wird gesendet). Tippen Sie ein Gerät für Details an. **Zurück zum Programm** beendet die manuellen Einstellungen der Geräte des Widgets, **Frostschutz** stellt deren Heizgeräte auf Frostschutz, beides nach Bestätigung; **Aktualisieren** fragt jetzt ab. Wählen Sie die Geräte in den Widget-Einstellungen (höchstens 8).
- **Voltalis-Energie**: die Energie von heute und gestern, die aktuelle Leistung und ein Balkendiagramm der letzten 24 Stunden, für das ganze Zuhause oder die in den Einstellungen gewählten Geräte.
- **Voltalis**: der Zustand der Verbindung, die Geräte im manuellen Modus, die Geräte mit Störung, die Anfragen der letzten Stunde, eine Schaltfläche **Aktualisieren**.

### Szenen

Auslöser (jeweils auf ein Gerät begrenzbar):

- **Der Modus eines Geräts ändert sich**: durch das Voltalis-Programm oder in der MyVoltalis-App, nie durch Gladys selbst. Auf einen neuen Modus begrenzbar; der vorherige Modus ist eine Variable.
- **Ein Gerät meldet eine Störung** / **ist wieder in Ordnung**: die Selbstdiagnose von Voltalis (Störung, kein Verbrauch erkannt, keine Verbindung).

Aktionen:

- **Manuellen Modus setzen**: Komfort, Eco, Frostschutz, eine Temperatur, ein oder aus, für ein Gerät oder alle mit diesem Modus, für eine Anzahl Stunden oder bis auf Weiteres (Ausgaben: geändert, abgelehnt).
- **Zurück zum Programm**: ein Gerät oder alle Geräte im manuellen Modus.
- **Programm oder Schnelleinstellung schalten**: die Schnelleinstellungen von MyVoltalis (zu Hause, kurze Abwesenheit, lange Abwesenheit) oder eines Ihrer Programme nach Name.
- **Voltalis-Geräte jetzt abfragen**: gibt die Geräte, jene im manuellen Modus, die Leistung und die Energie von heute aus.

Beispiele:

- Wenn alle das Haus verlassen → alle Heizgeräte auf Frostschutz stellen; wenn jemand zurückkommt → zurück zum Programm.
- Wenn ein Fenster im Wohnzimmer geöffnet wird → dessen Heizgerät für 1 Stunde ausschalten.
- Wenn ein Gerät eine Störung meldet → eine Benachrichtigung senden „{{triggerEvent.data.device_name}}: {{triggerEvent.data.status}}“.

### Transport

Der Katalog zeigt das Badge **Cloud**: Jede Anfrage geht mit Ihrer E-Mail und Ihrem Passwort an `api.myvoltalis.com`. Die Voltalis-Box bietet keinen lokalen Zugriff.

## Fehlerbehebung

- **„Voltalis lehnt die Zugangsdaten ab“**: Prüfen Sie E-Mail und Passwort durch Anmelden in der MyVoltalis-App. Die Integration versucht es alle 30 Minuten erneut oder sobald Sie sie ändern.
- **Verbunden, aber kein Gerät**: Das Konto hat in seiner Standardwohnung kein Gerät; prüfen Sie MyVoltalis.
- **Keine Voreinstellung oder keine Solltemperatur an einem Gerät**: MyVoltalis bietet ihm diese Modi nicht an (ein Relais oder ein Heizgerät ohne Temperaturmodus).
- **Die Energie bleibt leer oder verspätet**: Voltalis füllt die Stunden mit Verzögerung; warten Sie das Ende einer Stunde ab.
- **Ein Befehl wird nach einigen Minuten zurückgenommen**: Voltalis hat ihn nicht angewendet; das Dashboard zeigt wieder, was die Cloud sagt. Prüfen Sie das Gerät in MyVoltalis.
- **Nach einem Update von MyVoltalis funktioniert nichts mehr**: Der undokumentierte Dienst hat sich vielleicht geändert; melden Sie es.
- Melden Sie ein Problem auf [GitHub](https://github.com/William-De71/gladys-voltalis/issues) mit Ihrer Gladys-Version, der Version der Integration und dem Ergebnis von „Verbindung testen“.
