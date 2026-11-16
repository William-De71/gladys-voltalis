// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, toasts, messages of the
// Configuration screen. Vocabulary of the Gladys interface: appareil / Gerät /
// dispositivo, scène / Szene / escena, consigne / Solltemperatur / consigna;
// and of the MyVoltalis app: Confort, Éco, Hors-gel, programmation.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // device and feature names (Discovery, device page)
  siteName: {
    en: 'Voltalis home',
    fr: 'Logement Voltalis',
    de: 'Voltalis-Zuhause',
    es: 'Vivienda Voltalis',
  },
  feature_mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  feature_preset: { en: 'Preset', fr: 'Préréglage', de: 'Voreinstellung', es: 'Preajuste' },
  feature_target_temperature: {
    en: 'Setpoint',
    fr: 'Consigne',
    de: 'Solltemperatur',
    es: 'Consigna',
  },
  feature_power: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  feature_energy: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },

  // what an appliance does
  state_off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  state_comfort: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  state_eco: { en: 'Eco', fr: 'Éco', de: 'Eco', es: 'Eco' },
  state_frost: {
    en: 'Frost protection',
    fr: 'Hors-gel',
    de: 'Frostschutz',
    es: 'Antihielo',
  },
  state_temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  state_normal: { en: 'On', fr: 'Marche', de: 'Ein', es: 'Encendido' },
  state_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  sourceManual: { en: 'manual', fr: 'manuel', de: 'manuell', es: 'manual' },
  sourceManualUntil: {
    en: 'manual until {end}',
    fr: 'manuel jusqu’au {end}',
    de: 'manuell bis {end}',
    es: 'manual hasta {end}',
  },
  sourceProgram: { en: 'program', fr: 'programmation', de: 'Programm', es: 'programación' },
  sourceProgramNamed: {
    en: 'program “{name}”',
    fr: 'programmation « {name} »',
    de: 'Programm „{name}“',
    es: 'programación «{name}»',
  },
  type_heater: { en: 'Heater', fr: 'Radiateur', de: 'Heizgerät', es: 'Radiador' },
  type_water_heater: {
    en: 'Water heater',
    fr: 'Chauffe-eau',
    de: 'Warmwasserbereiter',
    es: 'Calentador de agua',
  },
  type_other: {
    en: 'Other appliance',
    fr: 'Autre appareil',
    de: 'Anderes Gerät',
    es: 'Otro aparato',
  },
  health_ok: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  health_nok: { en: 'Fault', fr: 'En défaut', de: 'Störung', es: 'Avería' },
  health_test: {
    en: 'Test in progress',
    fr: 'Test en cours',
    de: 'Test läuft',
    es: 'Prueba en curso',
  },
  health_no_consumption: {
    en: 'No consumption seen',
    fr: 'Aucune consommation vue',
    de: 'Kein Verbrauch erkannt',
    es: 'Sin consumo detectado',
  },
  health_comm_error: {
    en: 'No communication',
    fr: 'Pas de communication',
    de: 'Keine Verbindung',
    es: 'Sin comunicación',
  },

  // widget: appliances
  badgeWaiting: { en: 'Sending…', fr: 'Envoi…', de: 'Wird gesendet', es: 'Enviando…' },
  badgeManual: { en: 'Manual', fr: 'Manuel', de: 'Manuell', es: 'Manual' },
  badgeFault: { en: 'Fault', fr: 'Défaut', de: 'Störung', es: 'Avería' },
  detailType: { en: 'Type', fr: 'Type', de: 'Typ', es: 'Tipo' },
  detailState: { en: 'Does now', fr: 'Fait maintenant', de: 'Aktuell', es: 'Ahora' },
  detailSource: { en: 'Decided by', fr: 'Décidé par', de: 'Bestimmt durch', es: 'Decidido por' },
  detailSetpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Solltemperatur', es: 'Consigna' },
  detailHealth: {
    en: 'Self-diagnosis',
    fr: 'Autodiagnostic',
    de: 'Selbstdiagnose',
    es: 'Autodiagnóstico',
  },
  detailIndex: {
    en: 'Energy index',
    fr: 'Index d’énergie',
    de: 'Energiezähler',
    es: 'Índice de energía',
  },
  captionUpdated: {
    en: 'Read {ago}',
    fr: 'Relevé {ago}',
    de: 'Gelesen {ago}',
    es: 'Leído {ago}',
  },
  captionUpdatedHidden: {
    en: 'Read {ago} · {n} more: choose the appliances',
    fr: 'Relevé {ago} · {n} de plus : choisissez les appareils',
    de: 'Gelesen {ago} · {n} weitere: Geräte wählen',
    es: 'Leído {ago} · {n} más: elija los aparatos',
  },
  emptyAppliances: {
    en: 'No appliance on this Voltalis account.',
    fr: 'Aucun appareil sur ce compte Voltalis.',
    de: 'Kein Gerät in diesem Voltalis-Konto.',
    es: 'Ningún aparato en esta cuenta Voltalis.',
  },
  buttonAllAuto: {
    en: 'Back to program',
    fr: 'Retour au programme',
    de: 'Zurück zum Programm',
    es: 'Volver al programa',
  },
  buttonAllFrost: {
    en: 'Frost protection',
    fr: 'Hors-gel',
    de: 'Frostschutz',
    es: 'Antihielo',
  },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },

  // widget: energy
  tileToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tileYesterday: { en: 'Yesterday', fr: 'Hier', de: 'Gestern', es: 'Ayer' },
  tilePower: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  chartTitle: {
    en: 'Last 24 hours',
    fr: 'Dernières 24 heures',
    de: 'Letzte 24 Stunden',
    es: 'Últimas 24 horas',
  },
  chartSeries: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },
  energyCaptionSite: {
    en: 'The whole home, as measured by Voltalis (hour by hour)',
    fr: 'Tout le logement, mesuré par Voltalis (heure par heure)',
    de: 'Das ganze Zuhause, von Voltalis gemessen (stündlich)',
    es: 'Toda la vivienda, medida por Voltalis (hora a hora)',
  },
  energyCaption: {
    en: '{n} appliance(s), as measured by Voltalis (hour by hour)',
    fr: '{n} appareil(s), mesuré(s) par Voltalis (heure par heure)',
    de: '{n} Gerät(e), von Voltalis gemessen (stündlich)',
    es: '{n} aparato(s), medido(s) por Voltalis (hora a hora)',
  },
  emptyEnergy: {
    en: 'Voltalis has given no consumption yet. The hours of the day arrive within the hour.',
    fr: 'Voltalis n’a encore donné aucune consommation. Les heures du jour arrivent dans l’heure.',
    de: 'Voltalis hat noch keinen Verbrauch geliefert. Die Stunden des Tages kommen innerhalb einer Stunde.',
    es: 'Voltalis aún no ha dado ningún consumo. Las horas del día llegan en menos de una hora.',
  },

  // widget: status
  tileManual: { en: 'Manual', fr: 'En manuel', de: 'Manuell', es: 'En manual' },
  tileRequests: {
    en: 'Requests (1 h)',
    fr: 'Requêtes (1 h)',
    de: 'Anfragen (1 h)',
    es: 'Peticiones (1 h)',
  },
  rowConnection: { en: 'Voltalis', fr: 'Voltalis', de: 'Voltalis', es: 'Voltalis' },
  rowLastReading: {
    en: 'Last reading',
    fr: 'Dernier relevé',
    de: 'Letzte Abfrage',
    es: 'Última lectura',
  },
  rowInterval: { en: 'Reading', fr: 'Relevé', de: 'Abfrage', es: 'Lectura' },
  rowFaults: {
    en: 'Appliances in fault',
    fr: 'Appareils en défaut',
    de: 'Geräte mit Störung',
    es: 'Aparatos con avería',
  },
  rowPaused: {
    en: 'Slowed down, next try',
    fr: 'Ralenti, prochain essai',
    de: 'Gedrosselt, nächster Versuch',
    es: 'Ralentizado, próximo intento',
  },
  everyMinutes: {
    en: 'every {n} min',
    fr: 'toutes les {n} min',
    de: 'alle {n} Min.',
    es: 'cada {n} min',
  },
  inMinutes: { en: 'in {n} min', fr: 'dans {n} min', de: 'in {n} Min.', es: 'en {n} min' },
  connection_ok: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  connection_unknown: { en: 'Starting', fr: 'Démarrage', de: 'Startet', es: 'Iniciando' },
  connection_unconfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht eingerichtet',
    es: 'Sin configurar',
  },
  connection_refused: {
    en: 'Credentials refused',
    fr: 'Identifiants refusés',
    de: 'Zugangsdaten abgelehnt',
    es: 'Credenciales rechazadas',
  },
  connection_rate_limited: {
    en: 'Too many requests',
    fr: 'Trop de requêtes',
    de: 'Zu viele Anfragen',
    es: 'Demasiadas peticiones',
  },
  connection_error: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  connection_ok_hint: {
    en: 'Connected to Voltalis.',
    fr: 'Connecté à Voltalis.',
    de: 'Mit Voltalis verbunden.',
    es: 'Conectado a Voltalis.',
  },
  connection_unknown_hint: {
    en: 'Waiting for the first reading of Voltalis.',
    fr: 'En attente du premier relevé Voltalis.',
    de: 'Warten auf die erste Abfrage von Voltalis.',
    es: 'Esperando la primera lectura de Voltalis.',
  },
  connection_unconfigured_hint: {
    en: 'Enter the e-mail and the password of your MyVoltalis account in the configuration of the integration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte MyVoltalis dans la configuration de l’intégration.',
    de: 'Geben Sie E-Mail und Passwort Ihres MyVoltalis-Kontos in der Konfiguration der Integration ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta MyVoltalis en la configuración de la integración.',
  },
  connection_refused_hint: {
    en: 'Voltalis refuses the e-mail or the password. Check them by signing in to the MyVoltalis app.',
    fr: 'Voltalis refuse l’e-mail ou le mot de passe. Vérifiez-les en vous connectant à l’application MyVoltalis.',
    de: 'Voltalis lehnt E-Mail oder Passwort ab. Prüfen Sie beides durch Anmelden in der MyVoltalis-App.',
    es: 'Voltalis rechaza el correo o la contraseña. Compruébelos iniciando sesión en la app MyVoltalis.',
  },
  connection_rate_limited_hint: {
    en: 'Voltalis asks to slow down: the integration waits longer between two readings, then goes back to normal by itself.',
    fr: 'Voltalis demande de ralentir : l’intégration espace ses relevés, puis revient d’elle-même au rythme normal.',
    de: 'Voltalis bittet um weniger Anfragen: Die Integration fragt seltener ab und kehrt dann von selbst zum normalen Takt zurück.',
    es: 'Voltalis pide reducir el ritmo: la integración espacia sus lecturas y vuelve sola al ritmo normal.',
  },
  connection_error_hint: {
    en: 'Voltalis does not answer. Check the Internet connection of Gladys; the integration tries again at every reading.',
    fr: 'Voltalis ne répond pas. Vérifiez la connexion Internet de Gladys ; l’intégration réessaie à chaque relevé.',
    de: 'Voltalis antwortet nicht. Prüfen Sie die Internetverbindung von Gladys; die Integration versucht es bei jeder Abfrage erneut.',
    es: 'Voltalis no responde. Compruebe la conexión a Internet de Gladys; la integración lo reintenta en cada lectura.',
  },

  // relative times
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} days ago', fr: 'il y a {n} jours', de: 'vor {n} Tagen', es: 'hace {n} días' },

  // Configuration screen (setConnectionStatus)
  statusUnconfigured: {
    en: 'Enter the e-mail and the password of your MyVoltalis account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte MyVoltalis.',
    de: 'Geben Sie E-Mail und Passwort Ihres MyVoltalis-Kontos ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta MyVoltalis.',
  },
  statusRefused: {
    en: 'Voltalis refuses the credentials ({reason}): check the e-mail and the password.',
    fr: 'Voltalis refuse les identifiants ({reason}) : vérifiez l’e-mail et le mot de passe.',
    de: 'Voltalis lehnt die Zugangsdaten ab ({reason}): E-Mail und Passwort prüfen.',
    es: 'Voltalis rechaza las credenciales ({reason}): compruebe el correo y la contraseña.',
  },
  statusRateLimited: {
    en: 'Voltalis asks to slow down: next reading in {n} min.',
    fr: 'Voltalis demande de ralentir : prochain relevé dans {n} min.',
    de: 'Voltalis bittet um weniger Anfragen: nächste Abfrage in {n} Min.',
    es: 'Voltalis pide reducir el ritmo: próxima lectura en {n} min.',
  },
  statusError: {
    en: 'Voltalis does not answer ({error}); next try at the next reading.',
    fr: 'Voltalis ne répond pas ({error}) ; nouvel essai au prochain relevé.',
    de: 'Voltalis antwortet nicht ({error}); neuer Versuch bei der nächsten Abfrage.',
    es: 'Voltalis no responde ({error}); nuevo intento en la próxima lectura.',
  },
  statusOk: {
    en: '{count} Voltalis appliance(s), {manual} in manual mode, read every {minutes} min.',
    fr: '{count} appareil(s) Voltalis, {manual} en mode manuel, relevé toutes les {minutes} min.',
    de: '{count} Voltalis-Gerät(e), {manual} im manuellen Modus, Abfrage alle {minutes} Min.',
    es: '{count} aparato(s) Voltalis, {manual} en modo manual, lectura cada {minutes} min.',
  },
  statusNoAppliance: {
    en: 'Connected, but Voltalis lists no appliance on this account.',
    fr: 'Connecté, mais Voltalis ne liste aucun appareil sur ce compte.',
    de: 'Verbunden, aber Voltalis listet kein Gerät in diesem Konto.',
    es: 'Conectado, pero Voltalis no lista ningún aparato en esta cuenta.',
  },

  // toasts and action results
  toastAllAuto: {
    en: '{n} appliance(s) back to the program.',
    fr: '{n} appareil(s) de retour au programme.',
    de: '{n} Gerät(e) zurück im Programm.',
    es: '{n} aparato(s) de vuelta al programa.',
  },
  toastAllFrost: {
    en: '{n} heater(s) set to frost protection.',
    fr: '{n} radiateur(s) passé(s) en hors-gel.',
    de: '{n} Heizgerät(e) auf Frostschutz gestellt.',
    es: '{n} radiador(es) en antihielo.',
  },
  toastPartial: {
    en: 'Done for {n} appliance(s), refused for {failed}.',
    fr: 'Fait pour {n} appareil(s), refusé pour {failed}.',
    de: 'Für {n} Gerät(e) erledigt, für {failed} abgelehnt.',
    es: 'Hecho en {n} aparato(s), rechazado en {failed}.',
  },
  toastNoAppliance: {
    en: 'No Voltalis appliance to change.',
    fr: 'Aucun appareil Voltalis à changer.',
    de: 'Kein Voltalis-Gerät zu ändern.',
    es: 'Ningún aparato Voltalis que cambiar.',
  },
  toastRefreshed: {
    en: '{n} appliance(s) read.',
    fr: '{n} appareil(s) relevé(s).',
    de: '{n} Gerät(e) abgefragt.',
    es: '{n} aparato(s) leído(s).',
  },
  toastFailed: {
    en: 'Voltalis: {error}',
    fr: 'Voltalis : {error}',
    de: 'Voltalis: {error}',
    es: 'Voltalis: {error}',
  },

  // "Test the connection" button
  testOk: {
    en: 'Connected. {count} appliance(s): {list}',
    fr: 'Connexion réussie. {count} appareil(s) : {list}',
    de: 'Verbunden. {count} Gerät(e): {list}',
    es: 'Conexión correcta. {count} aparato(s): {list}',
  },
  testAppliance: {
    en: '{name} ({type}, {state}, {features} features)',
    fr: '{name} ({type}, {state}, {features} fonctionnalités)',
    de: '{name} ({type}, {state}, {features} Funktionen)',
    es: '{name} ({type}, {state}, {features} funciones)',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} language - The value.
 * @returns {boolean} A language.
 */
const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('minutesAgo', 'fr', { n: 3 }); // -> 'il y a 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) return key;
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string|Function} key - The TEXTS key, or `(language) => string`.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function' ? key(language) : t(key, language, values),
    ]),
  );
}

const locale = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A number written in a language ("20,5", "20.5").
 * @param {number} n - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const formatNumber = (n, language) =>
  new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(n);

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) return t('never', language);
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('justNow', language);
  if (minutes < 60) return t('minutesAgo', language, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('hoursAgo', language, { n: hours });
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
