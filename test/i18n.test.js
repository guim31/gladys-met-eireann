// -----------------------------------------------------------------------------
// Every text shown to the user exists in the four languages of the Gladys
// interface: English, French, German and Spanish. Gladys falls back to English
// on a missing language, so an omission would go unnoticed: these tests walk
// the whole manifest and every table of src/texts.js, without skipping any
// object, render the built texts in every language, and check that the four
// documentation files exist with the same sections.
//
// German says "du", never the polite "Sie" (decided by the maintainer for all
// his integrations); Spanish says "usted".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS } from '../src/api.js';
import { connectionStatus } from '../src/app.js';
import { LANGUAGE_CHOICES } from '../src/config.js';
import { INTENSITIES, PRECIPITATION_TYPES } from '../src/next-hour.js';
import { DAYS } from '../src/scene-actions.js';
import {
  CHANGE_WORDS,
  CONDITION_NAMES,
  DAY_NAMES,
  INTENSITY_WORDS,
  LANGUAGES,
  LEVEL_NAMES,
  LOCALES,
  MESSAGES,
  TEMPLATES,
  TYPE_NOUNS,
  WARNING_TYPE_NAMES,
  daySentence,
  localized,
  nextHourSentence,
  warningChangeSentence,
  warningsSentence,
} from '../src/texts.js';
import { unitLabels } from '../src/units.js';
import { CHANGES, LEVELS, WARNING_TYPES } from '../src/warnings.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const EXPECTED_LANGUAGES = ['de', 'en', 'es', 'fr'];
const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;
// A language key marks a multilingual object, whatever else it holds.
const LANGUAGE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * @description The problems of one multilingual text object.
 * @param {object} texts - `{ en, fr, de, es }`.
 * @param {string} where - Its path, for the messages.
 * @param {number} maxLength - The longest text allowed.
 * @returns {Array<string>} The problems, empty when fine.
 */
function checkTexts(texts, where, maxLength) {
  const problems = [];
  const keys = Object.keys(texts).sort();
  if (keys.join() !== EXPECTED_LANGUAGES.join()) {
    problems.push(`${where}: languages [${keys}], expected [${EXPECTED_LANGUAGES}]`);
  }
  for (const [language, text] of Object.entries(texts)) {
    if (typeof text !== 'string' || text.trim() === '') {
      problems.push(`${where}.${language}: empty`);
    } else if (text.length > maxLength) {
      problems.push(`${where}.${language}: ${text.length} characters, ${maxLength} at most`);
    }
  }
  if (typeof texts.de === 'string' && POLITE_GERMAN.test(texts.de)) {
    problems.push(`${where}.de: polite "${texts.de.match(POLITE_GERMAN)[0]}", German says "du"`);
  }
  return problems;
}

// Length limits of the manifest texts, by key; the store and the core cut
// beyond them, and a long label breaks a form or a card.
const MANIFEST_LIMITS = { label: 60, placeholder: 100, description: 400 };

/**
 * @description Walk a manifest and check every multilingual object it holds.
 * @param {object} root - The manifest.
 * @returns {{problems: Array<string>, count: number}} The problems and how
 * many objects were checked.
 */
function checkManifest(root) {
  const problems = [];
  let count = 0;
  const walk = (node, path, key) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`, key));
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Object.keys(node).some((k) => LANGUAGE_KEY.test(k))) {
      count += 1;
      problems.push(...checkTexts(node, path, MANIFEST_LIMITS[key] ?? 400));
      return;
    }
    for (const [childKey, child] of Object.entries(node)) {
      const label = node.key ?? node.value;
      walk(child, `${path}${label ? `(${label})` : ''}.${childKey}`, childKey);
    }
  };
  walk(root, 'manifest', null);
  return { problems, count };
}

test('the guard catches a missing language, an empty text and a polite German', () => {
  const broken = structuredClone(manifest);
  delete broken.config_schema[1].label.de;
  broken.scene_triggers[0].label.es = ' ';
  broken.scene_actions[0].description.de = 'Liest die Vorhersage Ihres Zuhauses.';
  broken.actions[0].label.it = 'Prova';
  const { problems } = checkManifest(broken);
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.match(problems.join('\n'), /county\)\.label: languages \[en,es,fr\]/);
  assert.match(problems.join('\n'), /\.es: empty/);
  assert.match(problems.join('\n'), /polite "Ihres"/);
  assert.match(problems.join('\n'), /languages \[de,en,es,fr,it\]/);
});

test('every multilingual object of the manifest has en, fr, de and es', () => {
  const { problems, count } = checkManifest(manifest);
  assert.deepEqual(problems, []);
  // Guards the walker itself: it must reach the whole manifest.
  assert.ok(count >= 75, `only ${count} multilingual objects found`);
});

test('the language setting offers the four languages', () => {
  const field = manifest.config_schema.find((entry) => entry.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGUAGE_CHOICES,
  );
  assert.deepEqual(['auto', ...Object.values(LANGUAGES)], LANGUAGE_CHOICES);
});

test('every table of the code has en, fr, de and es', () => {
  const problems = [];
  const tables = { MESSAGES, CONDITION_NAMES, TYPE_NOUNS, INTENSITY_WORDS, DAY_NAMES };
  for (const [name, table] of Object.entries(tables)) {
    for (const [key, texts] of Object.entries(table)) {
      problems.push(...checkTexts(texts, `${name}.${key}`, 200));
    }
  }
  assert.deepEqual(
    Object.keys(CONDITION_NAMES).sort(),
    Object.values(WEATHER_CONDITIONS).sort(),
    'a name for every condition of Gladys',
  );
  assert.deepEqual(Object.keys(TYPE_NOUNS).sort(), Object.values(PRECIPITATION_TYPES).sort());
  assert.deepEqual(Object.keys(INTENSITY_WORDS).sort(), Object.values(INTENSITIES).sort());
  assert.deepEqual(Object.keys(DAY_NAMES).sort(), Object.values(DAYS).sort());
  problems.push(...checkTexts(LOCALES, 'LOCALES', 10));
  for (const [key, templates] of Object.entries(TEMPLATES)) {
    const keys = Object.keys(templates).sort();
    if (keys.join() !== EXPECTED_LANGUAGES.join()) {
      problems.push(`TEMPLATES.${key}: languages [${keys}]`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the next-hour sentences read in every language, whatever the reading', () => {
  const problems = [];
  const cases = [{ available: false }, { available: true, minutesUntil: null }];
  for (const type of Object.values(PRECIPITATION_TYPES)) {
    for (const intensity of Object.values(INTENSITIES)) {
      for (const thunder of [false, true]) {
        for (const minutesUntil of [0, 1, 45]) {
          for (const probability of [null, 100]) {
            cases.push({ available: true, type, intensity, thunder, minutesUntil, probability });
          }
        }
      }
    }
  }
  for (const [index, reading] of cases.entries()) {
    const texts = Object.fromEntries(
      Object.values(LANGUAGES).map((language) => [language, nextHourSentence(reading, language)]),
    );
    problems.push(...checkTexts(texts, `sentence ${index}`, 120));
  }
  assert.deepEqual(problems, []);
  const reading = {
    available: true,
    type: 'sleet',
    intensity: 'heavy',
    thunder: true,
    minutesUntil: 12,
    probability: 70,
  };
  assert.equal(
    nextHourSentence(reading, 'de'),
    'Starker Schneeregen mit Gewitter in 12 Minuten erwartet (Wahrscheinlichkeit 70 %).',
  );
  assert.equal(
    nextHourSentence(reading, 'es'),
    'Aguanieve fuerte con tormenta prevista dentro de 12 minutos (probabilidad del 70 %).',
  );
});

test('the day sentences read in every language, every condition', () => {
  const problems = [];
  for (const condition of Object.values(WEATHER_CONDITIONS)) {
    for (const [precipitation, probability] of [
      [null, null],
      [0, null],
      [2.5, 40],
    ]) {
      const texts = Object.fromEntries(
        Object.values(LANGUAGES).map((language) => [
          language,
          daySentence(
            {
              day: 'today',
              condition,
              min: -3.5,
              max: 12,
              precipitation,
              probability,
              labels: unitLabels('metric'),
            },
            language,
          ),
        ]),
      );
      problems.push(...checkTexts(texts, `${condition}/${precipitation}`, 160));
    }
  }
  assert.deepEqual(problems, []);
  assert.equal(
    daySentence(
      {
        day: 'tomorrow',
        condition: 'snow',
        min: -3.5,
        max: 1,
        precipitation: 4.2,
        probability: null,
        labels: unitLabels('metric'),
      },
      'de',
    ),
    'Morgen: Schnee, -3,5 bis 1 °C, 4,2 mm Niederschlag.',
  );
});

test('the statuses and the test answer have the four languages', () => {
  const problems = [
    ...checkTexts(
      localized('testSucceeded', {
        us: 66,
        metric: 18.9,
        house: 'Maison',
        time: '15:05',
        warnings: {
          en: '3 Met Éireann warnings for Roscommon: Yellow low temperature warning.',
          fr: '3 vigilances Met Éireann pour Roscommon : Vigilance vagues-submersion orange.',
          de: '3 Warnungen von Met Éireann für Roscommon: Gelbe Warnung (Schnee und Glätte).',
          es: '3 avisos de Met Éireann para Roscommon: Aviso amarillo por altas temperaturas.',
        },
      }),
      'testSucceeded',
      200,
    ),
  ];
  const summaries = [
    { houses: 0, refreshed: 0, error: null },
    ...Object.values(ERROR_KINDS).map((kind) => ({ houses: 1, refreshed: 0, error: { kind } })),
  ];
  for (const summary of summaries) {
    const { message } = connectionStatus(summary);
    problems.push(...checkTexts(message, `status ${JSON.stringify(summary)}`, 200));
  }
  assert.deepEqual(problems, []);
});

/**
 * @param {string} language - 'en', 'fr', 'de' or 'es'.
 * @returns {Promise<string>} The documentation in that language.
 */
async function readDoc(language) {
  return readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
}

test('the four documentation files exist, with the same sections', async () => {
  const outlines = {};
  for (const language of EXPECTED_LANGUAGES) {
    const doc = await readDoc(language);
    assert.ok(doc.length >= 300, `docs/${language}.md is too short for the store`);
    outlines[language] = doc
      .split('\n')
      .filter((line) => /^#{1,3} /.test(line))
      .map((line) => line.match(/^#+/)[0].length);
  }
  for (const language of EXPECTED_LANGUAGES) {
    assert.deepEqual(outlines[language], outlines.en, `docs/${language}.md: other sections`);
  }
  assert.ok(outlines.en.filter((level) => level === 2).length >= 8, 'the template sections');
});

test('the documentation credits Met Éireann and names every key of the manifest', async () => {
  const keys = [
    ...manifest.scene_triggers.map((trigger) => trigger.key),
    ...manifest.scene_actions.map((action) => action.key),
  ];
  for (const language of EXPECTED_LANGUAGES) {
    const doc = await readDoc(language);
    assert.match(doc, /Copyright Met Éireann/, language);
    assert.match(doc, /CC BY 4\.0/, language);
    if (language === 'de') {
      assert.doesNotMatch(doc, POLITE_GERMAN, 'German says "du"');
    }
    for (const label of [
      ...manifest.scene_triggers.map((trigger) => trigger.label[language]),
      ...manifest.scene_actions.map((action) => action.label[language]),
    ]) {
      assert.ok(doc.includes(label), `docs/${language}.md: "${label}"`);
    }
  }
  assert.equal(keys.length, 5);
});

test('the warning sentences read in every language, every change, level and phenomenon', () => {
  const problems = [];
  const now = Date.UTC(2026, 9, 23, 18);
  for (const change of Object.values(CHANGES)) {
    for (const level of LEVELS) {
      for (const type of WARNING_TYPES) {
        const warning = { level, type, onset: now + 3600000, expiry: now + 86400000 };
        const texts = Object.fromEntries(
          Object.values(LANGUAGES).map((language) => [
            language,
            warningChangeSentence(
              { change, warning, county: 'Roscommon', timeZone: 'Europe/Dublin', now },
              language,
            ),
          ]),
        );
        problems.push(...checkTexts(texts, `${change}/${level}/${type}`, 160));
      }
    }
  }
  for (const table of [LEVEL_NAMES, WARNING_TYPE_NAMES, CHANGE_WORDS]) {
    for (const [key, texts] of Object.entries(table)) {
      problems.push(...checkTexts(texts, key, 40));
    }
  }
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(WARNING_TYPE_NAMES), WARNING_TYPES);
  assert.deepEqual(Object.keys(CHANGE_WORDS), Object.values(CHANGES));
  const warning = { level: 'red', type: 'snow', onset: null, expiry: now + 3600000 };
  assert.equal(
    warningsSentence([warning], { county: 'Wicklow', timeZone: 'Europe/Dublin', now }, 'de'),
    '1 Warnung von Met Éireann für Wicklow: Rote Warnung (Schnee und Glätte), bis Fr., 23. Okt., 20:00.',
  );
});
