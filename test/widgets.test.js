import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { parseAppliances, HOUR_MS } from '../src/voltalis.js';
import {
  buildAppliancesWidget,
  buildEnergyWidget,
  buildStatusWidget,
  energySummary,
  formatTemperature,
  stateLabel,
  sourceLabel,
  detailsOf,
  badgeOf,
  isFault,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  CHART_HOURS,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { APPLIANCES, SETTINGS, DIAGNOSTICS } from './helpers/fixtures.js';

// 11:42 in Paris.
const NOW = Date.parse('2026-11-15T10:42:00Z');
const STATES = ['ok', 'unknown', 'unconfigured', 'refused', 'rate_limited', 'error'];
const [SALON, CHAMBRE, BALLON] = parseAppliances(APPLIANCES, SETTINGS, DIAGNOSTICS).map((item) => ({
  ...item,
  energyKwh: 12.34,
}));
const entry = (model, waiting = false) => ({ model, name: model.name, waiting });
const list = (overrides = {}) =>
  buildAppliancesWidget({
    appliances: [entry(SALON), entry(CHAMBRE), entry(BALLON)],
    connection: 'ok',
    lastSuccessAt: NOW - 60000,
    language: 'en',
    now: NOW,
    ...overrides,
  });
// 30 hours of 400 Wh, keyed by the hour in Paris (UTC+1).
const HOURS = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [
    new Date(NOW + HOUR_MS - i * HOUR_MS).toISOString().slice(0, 13),
    400,
  ]),
);
const energy = (overrides = {}) =>
  buildEnergyWidget({
    hours: [HOURS],
    powerW: 1250,
    appliances: 0,
    connection: 'ok',
    language: 'en',
    timezone: 'Europe/Paris',
    now: NOW,
    ...overrides,
  });
const status = (overrides = {}) =>
  buildStatusWidget({
    connection: 'ok',
    manual: 1,
    total: 3,
    faults: 0,
    requests: 31,
    lastSuccessAt: NOW - 30000,
    refreshMinutes: 2,
    language: 'en',
    now: NOW,
    ...overrides,
  });
const find = (content, type) => content.components.filter((c) => c.type === type);

test('every widget content is valid, in every language and every connection state', () => {
  const many = Array.from({ length: 12 }, (_, i) => entry({ ...SALON, id: String(i) }));
  for (const language of LANGUAGES) {
    for (const units of ['metric', 'us']) {
      assert.deepEqual(validateWidgetContent(list({ language, units })), [], language);
    }
    assert.deepEqual(validateWidgetContent(list({ language, appliances: many, hidden: 4 })), []);
    assert.deepEqual(validateWidgetContent(energy({ language })), [], language);
    assert.deepEqual(validateWidgetContent(energy({ language, powerW: null, appliances: 2 })), []);
    for (const connection of STATES) {
      assert.deepEqual(validateWidgetContent(list({ language, connection, appliances: [] })), []);
      assert.deepEqual(validateWidgetContent(energy({ language, connection, hours: [{}] })), []);
      assert.deepEqual(
        validateWidgetContent(
          status({ language, connection, faults: 2, pausedUntil: NOW + 120000 }),
        ),
        [],
        `${language} ${connection}`,
      );
    }
  }
});

test('the appliances: what they do, who decided, badges, buttons', () => {
  const content = list();
  const [cards] = find(content, 'card-list');
  assert.deepEqual(
    cards.items.map((item) => [item.title, item.subtitle, item.badge?.text]),
    [
      ['Salon', 'Comfort · program', undefined],
      ['Chambre', 'Eco · manual until 15/11 22:30', 'Manual'],
      ['Chauffe-eau', 'Off · program “Semaine”', undefined],
    ],
  );
  assert.deepEqual(
    find(content, 'button').map((b) => [b.action.key, b.action.confirm]),
    [
      [WIDGET_ACTIONS.ALL_AUTO, true],
      [WIDGET_ACTIONS.ALL_FROST, true],
      [WIDGET_ACTIONS.REFRESH, undefined],
    ],
  );
  assert.match(find(content, 'text')[0].text, /Read 1 min ago/);
  assert.match(cards.items[0].description, /Type: Heater\nDoes now: Comfort\n/);
  assert.match(cards.items[0].description, /Setpoint: 19.5 °C/);
  assert.match(cards.items[0].description, /Self-diagnosis: OK/);
  assert.match(cards.items[0].description, /Energy index: 12.3 kWh/);
  assert.doesNotMatch(cards.items[1].description, /Setpoint/, 'no temperature mode');
  // French typography, and the names of MyVoltalis.
  assert.match(detailsOf(SALON, { units: 'metric', language: 'fr' }), /Fait maintenant : Confort/);
});

test('labels and badges', () => {
  assert.equal(
    stateLabel({ ...SALON, kind: 'temperature', target: 20.5 }, 'metric', 'fr'),
    '20,5 °C',
  );
  assert.equal(stateLabel({ ...SALON, kind: 'temperature', target: 20 }, 'us', 'en'), '68 °F');
  assert.equal(stateLabel({ ...SALON, kind: 'frost' }, 'metric', 'fr'), 'Hors-gel');
  assert.equal(stateLabel({ ...SALON, isOn: null }, 'metric', 'en'), 'Unknown');
  assert.equal(formatTemperature(null, 'metric', 'en'), '—');
  assert.equal(sourceLabel({ ...CHAMBRE, untilFurtherNotice: true }, 'fr'), 'manuel');
  assert.equal(sourceLabel({ ...CHAMBRE, endDate: null }, 'en'), 'manual');
  assert.equal(sourceLabel(BALLON, 'fr'), 'programmation « Semaine »');
  assert.equal(sourceLabel({ ...SALON, progName: 'quicksettings.athome' }, 'de'), 'Programm');
  assert.equal(badgeOf(SALON, true, 'en').text, 'Sending…');
  assert.equal(badgeOf({ ...CHAMBRE, health: 'nok' }, false, 'en').text, 'Fault');
  assert.equal(badgeOf(SALON, false, 'en'), undefined);
  assert.equal(isFault({ health: 'test' }), false);
  assert.equal(isFault({ health: null }), false);
  assert.equal(isFault({ health: 'no_consumption' }), true);
});

test('more than eight appliances: the first eight, and a hint', () => {
  const many = Array.from({ length: 12 }, (_, i) => entry({ ...SALON, id: String(i) }));
  const content = list({ appliances: many, hidden: 4 });
  assert.equal(find(content, 'card-list')[0].items.length, MAX_ITEMS);
  assert.match(find(content, 'text')[0].text, /4 more/);
  assert.equal(MAX_ITEMS, 8);
});

test('without appliance: a hint that fits the connection, and still "Refresh"', () => {
  const empty = list({ appliances: [], lastSuccessAt: 0, connection: 'refused' });
  assert.match(find(empty, 'text')[0].text, /refuses the e-mail or the password/);
  assert.deepEqual(
    find(empty, 'button').map((b) => b.action.key),
    [WIDGET_ACTIONS.REFRESH],
  );
  assert.match(find(list({ appliances: [] }), 'text')[1].text, /No appliance/);
});

test('the energy: today, yesterday, 24 bars, by the clock of the site', () => {
  const summary = energySummary([HOURS, HOURS], NOW, 'Europe/Paris');
  // 11:42 in Paris: the hours 00 to 11 of today, the 18 remembered of yesterday.
  assert.equal(summary.todayKwh, 9.6);
  assert.equal(summary.yesterdayKwh, 14.4);
  assert.equal(summary.points.length, CHART_HOURS);
  assert.deepEqual(summary.points.at(-1), { t: '2026-11-15T10:00:00.000Z', v: 0.8 });
  assert.equal(summary.points[0].t, '2026-11-14T11:00:00.000Z');
  assert.deepEqual(energySummary([{}, undefined], NOW, 'Europe/Paris').todayKwh, 0);

  const content = energy();
  assert.deepEqual(
    find(content, 'value').map((v) => [v.value, v.unit]),
    [
      [4.8, 'kWh'],
      [7.2, 'kWh'],
      [1250, 'W'],
    ],
  );
  const [chart] = find(content, 'chart');
  assert.equal(chart.chart_type, 'bar');
  assert.equal(chart.series[0].points.length, 24);
  assert.match(find(content, 'text')[0].text, /whole home/);
  // Chosen appliances: no power of the home, another caption.
  const chosen = energy({ powerW: null, appliances: 2, language: 'fr' });
  assert.equal(find(chosen, 'value').length, 2);
  assert.match(find(chosen, 'text')[0].text, /2 appareil\(s\)/);
  assert.match(find(energy({ hours: [{}] }), 'text')[0].text, /no consumption yet/);
});

test('the status: tiles, rows, faults, slow-down, hint', () => {
  const content = status({ faults: 1, pausedUntil: NOW + 5 * 60000, connection: 'rate_limited' });
  assert.deepEqual(
    find(content, 'value').map((v) => v.value),
    ['1/3', 31],
  );
  const [rows] = find(content, 'status');
  assert.deepEqual(
    rows.items.map((row) => row.value),
    ['Too many requests', 'just now', 'every 2 min', '1', 'in 5 min'],
  );
  assert.match(find(content, 'text')[0].text, /slow down/);
  assert.equal(find(status(), 'text').length, 0);
  assert.equal(find(status(), 'status')[0].items.length, 3);
});
