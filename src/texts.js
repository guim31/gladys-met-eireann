// -----------------------------------------------------------------------------
// Texts the integration writes itself, in English, French, German and Spanish
// (the languages of the Gladys interface).
//
// The core gives the language of the user in a weather request, but a scene
// trigger or a scene action receives none: those texts follow the `language`
// setting, whose default ('auto') is the language of the last request of the
// core. The condition names are the ones of the Gladys weather widget
// (front/src/config/i18n/*.json, dashboard.boxes.weather.conditions).
//
// Every table below holds exactly one entry per language: test/i18n.test.js
// walks them all. German says "du", Spanish says "usted".
// -----------------------------------------------------------------------------

const LANGUAGES = Object.freeze({ EN: 'en', FR: 'fr', DE: 'de', ES: 'es' });

// Locales of the numbers and times of the sentences.
const LOCALES = Object.freeze({ en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' });

const CONDITION_NAMES = Object.freeze({
  clear: { en: 'Clear sky', fr: 'Ciel dégagé', de: 'Klarer Himmel', es: 'Cielo despejado' },
  'partly-cloudy': {
    en: 'Partly cloudy',
    fr: 'Peu nuageux',
    de: 'Leicht bewölkt',
    es: 'Parcialmente nublado',
  },
  cloud: { en: 'Cloudy', fr: 'Nuageux', de: 'Bewölkt', es: 'Nublado' },
  fog: { en: 'Fog', fr: 'Brouillard', de: 'Nebel', es: 'Niebla' },
  drizzle: { en: 'Drizzle', fr: 'Bruine', de: 'Nieselregen', es: 'Llovizna' },
  rain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  pouring: { en: 'Heavy rain', fr: 'Fortes pluies', de: 'Starkregen', es: 'Lluvia intensa' },
  sleet: { en: 'Sleet', fr: 'Pluie et neige mêlées', de: 'Schneeregen', es: 'Aguanieve' },
  hail: { en: 'Hail', fr: 'Grêle', de: 'Hagel', es: 'Granizo' },
  snow: { en: 'Snow', fr: 'Neige', de: 'Schnee', es: 'Nieve' },
  thunderstorm: { en: 'Thunderstorm', fr: 'Orages', de: 'Gewitter', es: 'Tormenta' },
  wind: { en: 'Windy', fr: 'Vent', de: 'Windig', es: 'Ventoso' },
  night: { en: 'Night', fr: 'Nuit', de: 'Nacht', es: 'Noche' },
  'freezing-rain': {
    en: 'Freezing rain',
    fr: 'Pluie verglaçante',
    de: 'Gefrierender Regen',
    es: 'Lluvia helada',
  },
  'freezing-fog': {
    en: 'Freezing fog',
    fr: 'Brouillard givrant',
    de: 'Gefrierender Nebel',
    es: 'Niebla helada',
  },
  'snow-thunderstorm': {
    en: 'Thundery snow showers',
    fr: 'Averses de neige orageuses',
    de: 'Gewittrige Schneeschauer',
    es: 'Chubascos de nieve con tormenta',
  },
  sandstorm: { en: 'Sandstorm', fr: 'Tempête de sable', de: 'Sandsturm', es: 'Tormenta de arena' },
  tornado: { en: 'Tornado', fr: 'Tornade', de: 'Tornado', es: 'Tornado' },
  hurricane: { en: 'Hurricane', fr: 'Cyclone', de: 'Hurrikan', es: 'Huracán' },
  unknown: { en: 'Unavailable', fr: 'Indisponible', de: 'Nicht verfügbar', es: 'No disponible' },
});

// Every noun is feminine in French and Spanish and masculine in German, so the
// intensity words below are already agreed with all of them.
const TYPE_NOUNS = Object.freeze({
  rain: { en: 'rain', fr: 'pluie', de: 'Regen', es: 'lluvia' },
  sleet: { en: 'sleet', fr: 'neige fondue', de: 'Schneeregen', es: 'aguanieve' },
  snow: { en: 'snow', fr: 'neige', de: 'Schneefall', es: 'nieve' },
});

const INTENSITY_WORDS = Object.freeze({
  light: { en: 'Light', fr: 'faible', de: 'Leichter', es: 'débil' },
  moderate: { en: 'Moderate', fr: 'modérée', de: 'Mäßiger', es: 'moderada' },
  heavy: { en: 'Heavy', fr: 'forte', de: 'Starker', es: 'fuerte' },
});

const DAY_NAMES = Object.freeze({
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
});

// Warning levels, as an adjective of "warning" (feminine "vigilance" in
// French, feminine "Warnung" in German, masculine "aviso" in Spanish).
const LEVEL_NAMES = Object.freeze({
  yellow: { en: 'Yellow', fr: 'jaune', de: 'Gelbe', es: 'amarillo' },
  orange: { en: 'Orange', fr: 'orange', de: 'Orange', es: 'naranja' },
  red: { en: 'Red', fr: 'rouge', de: 'Rote', es: 'rojo' },
});

const WARNING_TYPE_NAMES = Object.freeze({
  wind: { en: 'wind', fr: 'vent', de: 'Wind', es: 'viento' },
  rain: { en: 'rain', fr: 'pluie', de: 'Regen', es: 'lluvia' },
  snow: {
    en: 'snow and ice',
    fr: 'neige et verglas',
    de: 'Schnee und Glätte',
    es: 'nieve y hielo',
  },
  thunderstorm: { en: 'thunderstorm', fr: 'orages', de: 'Gewitter', es: 'tormentas' },
  fog: { en: 'fog', fr: 'brouillard', de: 'Nebel', es: 'niebla' },
  cold: { en: 'low temperature', fr: 'grand froid', de: 'Kälte', es: 'bajas temperaturas' },
  heat: { en: 'high temperature', fr: 'fortes chaleurs', de: 'Hitze', es: 'altas temperaturas' },
  coastal: { en: 'coastal', fr: 'vagues-submersion', de: 'Küste', es: 'fenómenos costeros' },
  flood: { en: 'flood', fr: 'inondation', de: 'Hochwasser', es: 'inundaciones' },
  other: { en: 'weather', fr: 'météo', de: 'Wetter', es: 'meteorológico' },
});

// What happened to a warning (agreed with "vigilance" in French, masculine
// "aviso" in Spanish).
const CHANGE_WORDS = Object.freeze({
  issued: { en: 'issued', fr: 'émise', de: 'ausgegeben', es: 'emitido' },
  upgraded: { en: 'upgraded', fr: 'relevée', de: 'hochgestuft', es: 'elevado' },
  downgraded: { en: 'downgraded', fr: 'abaissée', de: 'herabgestuft', es: 'rebajado' },
  updated: { en: 'updated', fr: 'mise à jour', de: 'aktualisiert', es: 'actualizado' },
  lifted: { en: 'lifted', fr: 'levée', de: 'aufgehoben', es: 'levantado' },
});

// Fixed texts, sent as a whole to Gladys (statuses) or picked by language.
const MESSAGES = Object.freeze({
  noHourlyForecast: {
    en: 'No hourly forecast covers the next hour.',
    fr: 'Aucune prévision horaire ne couvre l’heure à venir.',
    de: 'Keine stündliche Vorhersage deckt die nächste Stunde ab.',
    es: 'Ninguna previsión horaria cubre la próxima hora.',
  },
  noPrecipitation: {
    en: 'No precipitation expected within the hour.',
    fr: 'Pas de précipitations prévues dans l’heure.',
    de: 'Kein Niederschlag in der nächsten Stunde erwartet.',
    es: 'No se esperan precipitaciones en la próxima hora.',
  },
  noDayForecast: {
    en: 'No forecast for this day.',
    fr: 'Pas de prévision pour ce jour.',
    de: 'Keine Vorhersage für diesen Tag.',
    es: 'No hay previsión para este día.',
  },
  noCounty: {
    en: 'This house is not in a county Met Éireann issues warnings for.',
    fr: 'Cette maison n’est pas dans un comté couvert par les vigilances de Met Éireann.',
    de: 'Dieses Zuhause liegt in keinem County, für das Met Éireann warnt.',
    es: 'Esta vivienda no está en un condado cubierto por los avisos de Met Éireann.',
  },
  warningsUnknown: {
    en: 'The Met Éireann warnings are unavailable for now.',
    fr: 'Les vigilances de Met Éireann sont indisponibles pour le moment.',
    de: 'Die Warnungen von Met Éireann sind im Moment nicht verfügbar.',
    es: 'Los avisos de Met Éireann no están disponibles por ahora.',
  },
  noLocation: {
    en: 'No house of Gladys has a location: set it in Settings → Houses.',
    fr: 'Aucune maison de Gladys n’a de position : renseignez-la dans Paramètres → Maisons.',
    de: 'Kein Zuhause in Gladys hat einen Standort: Lege ihn unter Einstellungen → Zuhause fest.',
    es: 'Ninguna vivienda de Gladys tiene ubicación: indíquela en Configuración → Viviendas.',
  },
  throttled: {
    en: 'Met Éireann asks to slow down (too many requests from your Internet connection): retrying later.',
    fr: 'Met Éireann demande de ralentir (trop de requêtes depuis votre connexion Internet) : nouvel essai plus tard.',
    de: 'Met Éireann bittet darum, langsamer zu werden (zu viele Anfragen von deiner Internetverbindung): neuer Versuch später.',
    es: 'Met Éireann pide reducir el ritmo (demasiadas solicitudes desde su conexión a Internet): se reintentará más tarde.',
  },
  forbidden: {
    en: 'Met Éireann refuses the requests (HTTP 403): retrying in 6 hours. Update the integration if this persists.',
    fr: 'Met Éireann refuse les requêtes (HTTP 403) : nouvel essai dans 6 heures. Mettez à jour l’intégration si cela persiste.',
    de: 'Met Éireann lehnt die Anfragen ab (HTTP 403): neuer Versuch in 6 Stunden. Aktualisiere die Integration, wenn das anhält.',
    es: 'Met Éireann rechaza las solicitudes (HTTP 403): se reintentará dentro de 6 horas. Actualice la integración si persiste.',
  },
  noForecast: {
    en: 'Met Éireann has no usable forecast for the location of your house: check it in Settings → Houses.',
    fr: 'Met Éireann n’a pas de prévision utilisable pour la position de votre maison : vérifiez-la dans Paramètres → Maisons.',
    de: 'Met Éireann hat keine brauchbare Vorhersage für den Standort deines Zuhauses: Prüfe ihn unter Einstellungen → Zuhause.',
    es: 'Met Éireann no tiene una previsión utilizable para la ubicación de su vivienda: compruébela en Configuración → Viviendas.',
  },
  unreachable: {
    en: 'Met Éireann is unreachable for now: retrying in a few minutes.',
    fr: 'Met Éireann est injoignable pour le moment : nouvel essai dans quelques minutes.',
    de: 'Met Éireann ist im Moment nicht erreichbar: neuer Versuch in ein paar Minuten.',
    es: 'Met Éireann no está disponible por ahora: se reintentará en unos minutos.',
  },
});

const plural = (count, one, many) => (count > 1 ? many : one);

// Texts built from values, one function per language.
const TEMPLATES = Object.freeze({
  label: {
    en: (noun, intensity) => `${intensity} ${noun}`,
    fr: (noun, intensity) => `${noun} ${intensity}`,
    de: (noun, intensity) => `${intensity} ${noun}`,
    es: (noun, intensity) => `${noun} ${intensity}`,
  },
  thunder: {
    en: () => ' with thunder',
    fr: () => ' avec orage',
    de: () => ' mit Gewitter',
    es: () => ' con tormenta',
  },
  chance: {
    en: (probability) => ` (${probability}% chance)`,
    fr: (probability) => ` (probabilité ${probability} %)`,
    de: (probability) => ` (Wahrscheinlichkeit ${probability} %)`,
    es: (probability) => ` (probabilidad del ${probability} %)`,
  },
  now: {
    en: (label, chance) => `${label} now${chance}.`,
    fr: (label, chance) => `${label} en ce moment${chance}.`,
    de: (label, chance) => `${label} im Moment${chance}.`,
    es: (label, chance) => `${label} en este momento${chance}.`,
  },
  expected: {
    en: (label, minutes, chance) =>
      `${label} expected in ${minutes} ${plural(minutes, 'minute', 'minutes')}${chance}.`,
    fr: (label, minutes, chance) =>
      `${label} attendue dans ${minutes} ${plural(minutes, 'minute', 'minutes')}${chance}.`,
    de: (label, minutes, chance) =>
      `${label} in ${minutes} ${plural(minutes, 'Minute', 'Minuten')} erwartet${chance}.`,
    es: (label, minutes, chance) =>
      `${label} prevista dentro de ${minutes} ${plural(minutes, 'minuto', 'minutos')}${chance}.`,
  },
  temperatures: {
    en: (min, max, unit) => `${min} to ${max} ${unit}`,
    fr: (min, max, unit) => `de ${min} à ${max} ${unit}`,
    de: (min, max, unit) => `${min} bis ${max} ${unit}`,
    es: (min, max, unit) => `de ${min} a ${max} ${unit}`,
  },
  precipitation: {
    en: (amount, unit, chance) => `${amount} ${unit} of precipitation${chance}`,
    fr: (amount, unit, chance) => `${amount} ${unit} de précipitations${chance}`,
    de: (amount, unit, chance) => `${amount} ${unit} Niederschlag${chance}`,
    es: (amount, unit, chance) => `${amount} ${unit} de precipitación${chance}`,
  },
  dry: {
    en: (chance) => `no precipitation${chance}`,
    fr: (chance) => `pas de précipitations${chance}`,
    de: (chance) => `kein Niederschlag${chance}`,
    es: (chance) => `sin precipitación${chance}`,
  },
  day: {
    en: (day, parts) => `${day}: ${parts.join(', ')}.`,
    fr: (day, parts) => `${day} : ${parts.join(', ')}.`,
    de: (day, parts) => `${day}: ${parts.join(', ')}.`,
    es: (day, parts) => `${day}: ${parts.join(', ')}.`,
  },
  // Fahrenheit for the English text only: the others are metric countries.
  // The numbers take the decimal separator of each language.
  testSucceeded: {
    en: ({ us, metric, house, time, warnings }) =>
      `It works: ${formatNumber(us, 'en')} °F (${formatNumber(metric, 'en')} °C) now at ${house}, forecast of ${time}. ${warnings.en}`,
    fr: ({ metric, house, time, warnings }) =>
      `Ça fonctionne : ${formatNumber(metric, 'fr')} °C en ce moment à ${house}, prévision de ${time}. ${warnings.fr}`,
    de: ({ metric, house, time, warnings }) =>
      `Es funktioniert: gerade ${formatNumber(metric, 'de')} °C in ${house}, Vorhersage von ${time}. ${warnings.de}`,
    es: ({ metric, house, time, warnings }) =>
      `Funciona: ${formatNumber(metric, 'es')} °C ahora en ${house}, previsión de las ${time}. ${warnings.es}`,
  },
  // The warnings of a county, counted (test action, warnings action).
  warningCount: {
    en: (count, county) =>
      count === 0
        ? `No Met Éireann warning for ${county}.`
        : `${count} Met Éireann ${plural(count, 'warning', 'warnings')} for ${county}`,
    fr: (count, county) =>
      count === 0
        ? `Aucune vigilance Met Éireann pour ${county}.`
        : `${count} ${plural(count, 'vigilance', 'vigilances')} Met Éireann pour ${county}`,
    de: (count, county) =>
      count === 0
        ? `Keine Warnung von Met Éireann für ${county}.`
        : `${count} ${plural(count, 'Warnung', 'Warnungen')} von Met Éireann für ${county}`,
    es: (count, county) =>
      count === 0
        ? `Ningún aviso de Met Éireann para ${county}.`
        : `${count} ${plural(count, 'aviso', 'avisos')} de Met Éireann para ${county}`,
  },
  // "Orange wind warning", without the change.
  warningName: {
    en: (level, type) => `${level} ${type} warning`,
    fr: (level, type) => `vigilance ${type} ${level}`,
    de: (level, type) => `${level} Warnung (${type})`,
    es: (level, type) => `aviso ${level} por ${type}`,
  },
  period: {
    en: (from, to) => (from ? `, from ${from} to ${to}` : `, until ${to}`),
    fr: (from, to) => (from ? `, du ${from} au ${to}` : `, jusqu’au ${to}`),
    de: (from, to) => (from ? `, von ${from} bis ${to}` : `, bis ${to}`),
    es: (from, to) => (from ? `, del ${from} al ${to}` : `, hasta el ${to}`),
  },
  warningChange: {
    en: (name, change, county, period) => `${name} ${change} for ${county}${period}.`,
    fr: (name, change, county, period) => `${name} ${change} pour ${county}${period}.`,
    de: (name, change, county, period) => `${name} für ${county} ${change}${period}.`,
    es: (name, change, county, period) => `${name} ${change} para ${county}${period}.`,
  },
});

/**
 * @description Pick the language of a text: the setting, or with 'auto' the
 * language of the last request of the core. An unknown language is English.
 * @param {string} setting - The `language` setting ('auto', 'en', 'fr', 'de', 'es').
 * @param {string|null} [lastSeen] - The language of the last core request.
 * @returns {string} 'en', 'fr', 'de' or 'es'.
 * @example
 * resolveLanguage('auto', 'fr-FR'); // -> 'fr'
 */
function resolveLanguage(setting, lastSeen = null) {
  const wanted = setting === 'auto' ? lastSeen : setting;
  if (typeof wanted !== 'string') {
    return LANGUAGES.EN;
  }
  const prefix = wanted.toLowerCase().slice(0, 2);
  return Object.values(LANGUAGES).includes(prefix) ? prefix : LANGUAGES.EN;
}

/**
 * @description A text of a table in a language, English when unknown.
 * @param {object} table - A table of `{ en, fr, de, es }`.
 * @param {string} key - The key in the table.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The text.
 * @example
 * pick(MESSAGES, 'noPrecipitation', 'de');
 */
function pick(table, key, language) {
  const texts = table[key];
  return texts[language] ?? texts.en;
}

/**
 * @description The function of a template in a language, English when unknown.
 * @param {string} key - A TEMPLATES key.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {Function} The template.
 * @example
 * template('thunder', 'es')();
 */
function template(key, language) {
  return TEMPLATES[key][language] ?? TEMPLATES[key].en;
}

/**
 * @description A template filled in every language, for the texts Gladys
 * localizes itself (action results).
 * @param {string} key - A TEMPLATES key.
 * @param {...*} args - The values of the template.
 * @returns {object} `{ en, fr, de, es }`.
 * @example
 * localized('testSucceeded', values);
 */
function localized(key, ...args) {
  return Object.fromEntries(
    Object.values(LANGUAGES).map((language) => [language, TEMPLATES[key][language](...args)]),
  );
}

/**
 * @description Format a number with the decimal separator of a language.
 * @param {number} value - The number.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The formatted number.
 * @example
 * formatNumber(5.2, 'fr'); // -> '5,2'
 */
function formatNumber(value, language) {
  return new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * @description The name of a condition, as the weather widget of Gladys says it.
 * @param {string} condition - A Gladys condition.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The capitalized name.
 * @example
 * conditionName('partly-cloudy', 'fr'); // -> 'Peu nuageux'
 */
function conditionName(condition, language) {
  return pick(
    CONDITION_NAMES,
    Object.hasOwn(CONDITION_NAMES, condition) ? condition : 'unknown',
    language,
  );
}

/**
 * @description Name a precipitation: "Light rain", "Neige forte".
 * @param {string} type - 'rain', 'sleet' or 'snow'.
 * @param {string} intensity - 'light', 'moderate' or 'heavy'.
 * @param {boolean} thunder - With thunder.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The capitalized name.
 * @example
 * precipitationLabel('snow', 'heavy', false, 'fr'); // -> 'Neige forte'
 */
function precipitationLabel(type, intensity, thunder, language) {
  const lang = Object.values(LANGUAGES).includes(language) ? language : LANGUAGES.EN;
  const noun = (TYPE_NOUNS[type] ?? TYPE_NOUNS.rain)[lang];
  const words = (INTENSITY_WORDS[intensity] ?? INTENSITY_WORDS.light)[lang];
  const label = template('label', lang)(noun, words) + (thunder ? template('thunder', lang)() : '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * @description The sentence of the next hour, ready to put in a message.
 * @param {object} reading - A readNextHour() result.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * nextHourSentence(reading, 'en'); // -> 'Light rain expected in 35 minutes.'
 */
function nextHourSentence(reading, language) {
  if (!reading.available) {
    return pick(MESSAGES, 'noHourlyForecast', language);
  }
  if (reading.minutesUntil === null) {
    return pick(MESSAGES, 'noPrecipitation', language);
  }
  const label = precipitationLabel(reading.type, reading.intensity, reading.thunder, language);
  const chance =
    reading.probability === null ? '' : template('chance', language)(reading.probability);
  if (reading.minutesUntil === 0) {
    return template('now', language)(label, chance);
  }
  return template('expected', language)(label, reading.minutesUntil, chance);
}

/**
 * @description The sentence of a day, ready to put in a message:
 * "Tomorrow: rain, 8 to 14 °C, 5.2 mm of precipitation (70% chance)."
 * @param {object} values - The day, in the unit system of the outputs.
 * @param {string} values.day - 'today' or 'tomorrow'.
 * @param {string} values.condition - The Gladys condition.
 * @param {number} values.min - The minimum temperature.
 * @param {number} values.max - The maximum temperature.
 * @param {number|null} values.precipitation - The amount, or null.
 * @param {number|null} values.probability - 0-100, or null.
 * @param {object} values.labels - The unit labels (units.js).
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * daySentence({ day: 'tomorrow', condition: 'rain', min: 8, max: 14, precipitation: 5.2, probability: null, labels }, 'en');
 */
function daySentence({ day, condition, min, max, precipitation, probability, labels }, language) {
  const number = (value) => formatNumber(value, language);
  let name = conditionName(condition, language);
  if (language !== LANGUAGES.DE) {
    // German nouns keep their capital; the others read as a sentence.
    name = name.charAt(0).toLowerCase() + name.slice(1);
  }
  const parts = [
    name,
    template('temperatures', language)(number(min), number(max), labels.temperature),
  ];
  const chance = probability === null ? '' : template('chance', language)(probability);
  if (precipitation !== null && precipitation > 0) {
    parts.push(
      template('precipitation', language)(number(precipitation), labels.precipitation, chance),
    );
  } else if (precipitation !== null) {
    parts.push(template('dry', language)(chance));
  }
  return template('day', language)(pick(DAY_NAMES, day, language), parts);
}

/**
 * @description Format a warning time: short weekday, day, month and hour, in
 * the time zone of Gladys.
 * @param {number} ms - The instant.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {string} E.g. 'Sat 24 Oct, 14:00'.
 * @example
 * formatWhen(Date.UTC(2026, 9, 24, 13), 'en', 'Europe/Dublin');
 */
function formatWhen(ms, language, timeZone) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(ms);
}

/**
 * @description Name a warning: "Orange wind warning", "Vigilance vent orange".
 * @param {object} warning - A parsed warning (warnings.js).
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The capitalized name.
 * @example
 * warningName({ level: 'orange', type: 'wind' }, 'fr'); // -> 'Vigilance vent orange'
 */
function warningName(warning, language) {
  const lang = Object.values(LANGUAGES).includes(language) ? language : LANGUAGES.EN;
  const name = template('warningName', lang)(
    pick(LEVEL_NAMES, warning.level, lang),
    pick(WARNING_TYPE_NAMES, warning.type, lang),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * @description The period of a warning: ", from Sat 24 Oct, 07:00 to …".
 * @param {object} warning - A parsed warning.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @param {string} timeZone - An IANA time zone name.
 * @param {number} now - The current time in ms: a warning in effect has no
 * start.
 * @returns {string} The period, empty without an expiry.
 * @example
 * warningPeriod(warning, 'en', 'Europe/Dublin', Date.now());
 */
function warningPeriod(warning, language, timeZone, now) {
  if (warning.expiry === null) {
    return '';
  }
  const from =
    warning.onset !== null && warning.onset > now
      ? formatWhen(warning.onset, language, timeZone)
      : null;
  return template('period', language)(from, formatWhen(warning.expiry, language, timeZone));
}

/**
 * @description The sentence of a warning change, ready to put in a message:
 * "Orange wind warning issued for Kerry, from Sat 24 Oct, 14:00 to Sun 25
 * Oct, 09:00."
 * @param {object} values - Values.
 * @param {string} values.change - One of warnings.js CHANGES.
 * @param {object} values.warning - The parsed warning.
 * @param {string} values.county - The county name.
 * @param {string} values.timeZone - An IANA time zone name.
 * @param {number} values.now - The current time in ms.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * warningChangeSentence({ change: 'issued', warning, county: 'Kerry', timeZone, now }, 'en');
 */
function warningChangeSentence({ change, warning, county, timeZone, now }, language) {
  const period = change === 'lifted' ? '' : warningPeriod(warning, language, timeZone, now);
  return template('warningChange', language)(
    warningName(warning, language),
    pick(CHANGE_WORDS, change, language),
    county,
    period,
  );
}

/**
 * @description The sentence of the warnings of a county: "2 Met Éireann
 * warnings for Kerry: Orange rain warning, until Sat 24 Oct, 14:00; …".
 * @param {Array<object>} warnings - The warnings of the county.
 * @param {object} options - Options.
 * @param {string} options.county - The county name.
 * @param {string} options.timeZone - An IANA time zone name.
 * @param {number} options.now - The current time in ms.
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {string} The sentence.
 * @example
 * warningsSentence(warnings, { county: 'Kerry', timeZone, now }, 'en');
 */
function warningsSentence(warnings, { county, timeZone, now }, language) {
  const count = template('warningCount', language)(warnings.length, county);
  if (warnings.length === 0) {
    return count;
  }
  const items = warnings.map(
    (warning) => warningName(warning, language) + warningPeriod(warning, language, timeZone, now),
  );
  return `${count}${language === LANGUAGES.FR ? ' : ' : ': '}${items.join('; ')}.`;
}

export {
  CHANGE_WORDS,
  CONDITION_NAMES,
  LEVEL_NAMES,
  WARNING_TYPE_NAMES,
  formatWhen,
  warningChangeSentence,
  warningName,
  warningPeriod,
  warningsSentence,
  DAY_NAMES,
  INTENSITY_WORDS,
  LANGUAGES,
  LOCALES,
  MESSAGES,
  TEMPLATES,
  TYPE_NOUNS,
  conditionName,
  daySentence,
  formatNumber,
  localized,
  nextHourSentence,
  pick,
  precipitationLabel,
  resolveLanguage,
  template,
};
