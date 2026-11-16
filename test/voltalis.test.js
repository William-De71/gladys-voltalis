// The Voltalis data model: parsing, commands, manual settings, energy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppliances,
  stateOf,
  fallbackKind,
  normalizeChange,
  buildSetting,
  expectedOf,
  encodeTarget,
  localStamp,
  localDay,
  hourKey,
  accountSteps,
  realtimePower,
} from '../src/voltalis.js';
import { APPLIANCES, SETTINGS, DIAGNOSTICS, REALTIME, T0, step } from './helpers/fixtures.js';

const [salon, chambre, ballon] = parseAppliances(APPLIANCES, SETTINGS, DIAGNOSTICS);

test('parses the appliances: type, modes, what they do, who decided', () => {
  assert.deepEqual(
    [salon.id, salon.name, salon.type, salon.kinds, salon.hasEcov],
    ['101', 'Salon', 'heater', ['eco', 'comfort', 'temperature', 'frost'], false],
  );
  assert.deepEqual(
    [salon.isOn, salon.kind, salon.manual, salon.target],
    [true, 'comfort', false, 19.5],
  );
  assert.deepEqual(
    [chambre.kinds, chambre.hasEcov, chambre.kind],
    [['eco', 'comfort', 'frost'], true, 'eco'],
  );
  assert.deepEqual([chambre.manual, chambre.endDate], [true, '2026-11-15T22:30:00']);
  assert.deepEqual(
    [ballon.type, ballon.kinds, ballon.isOn, ballon.progName],
    ['water_heater', ['normal'], false, 'Semaine'],
  );
  assert.deepEqual(
    [salon.settingId, chambre.settingId, ballon.settingId],
    ['9101', '9102', '9103'],
  );
  assert.deepEqual([salon.health, ballon.health], ['ok', 'ok']);
  assert.deepEqual([stateOf(salon), stateOf(chambre), stateOf(ballon)], ['comfort', 'eco', 'off']);
});

test('parsing survives missing or odd answers', () => {
  assert.deepEqual(parseAppliances(null), []);
  assert.deepEqual(parseAppliances([{ name: 'no id' }, null]), []);
  const [bare] = parseAppliances([{ id: 5 }]);
  assert.deepEqual(
    [bare.type, bare.kinds, bare.isOn, bare.kind, bare.settingId, bare.health, stateOf(bare)],
    ['other', [], null, null, null, null, null],
  );
  // The self-diagnosis sometimes comes in lower case; an unknown status is ignored.
  const [a, b] = parseAppliances(
    [{ id: 1 }, { id: 2 }],
    [],
    [
      { csApplianceId: 1, status: 'comm_error' },
      { csApplianceId: 2, status: 'WHATEVER' },
    ],
  );
  assert.deepEqual([a.health, b.health], ['comm_error', null]);
  // Without the list of manual settings, the id of the appliance itself is used.
  assert.equal(parseAppliances(APPLIANCES)[1].settingId, '9102');
});

test('a setpoint is rounded to half a degree, within 7 to 30', () => {
  assert.equal(encodeTarget(19.7), 19.5);
  assert.equal(encodeTarget('21'), 21);
  for (const wrong of [6, 31, 'abc', null, ''])
    assert.throws(() => encodeTarget(wrong), RangeError);
});

test('commands are normalized, and refused when the appliance cannot', () => {
  assert.deepEqual(normalizeChange(salon, { action: 'manual', kind: 'eco' }), {
    action: 'manual',
    kind: 'eco',
    target: 16,
    hours: null,
  });
  assert.deepEqual(normalizeChange(salon, { action: 'manual', target: 21.2, hours: 2 }), {
    action: 'manual',
    kind: 'temperature',
    target: 21,
    hours: 2,
  });
  // "Manual" without a mode keeps what the appliance does.
  assert.equal(normalizeChange(salon, { action: 'manual' }).kind, 'comfort');
  assert.equal(normalizeChange(ballon, { action: 'manual' }).kind, 'normal');
  assert.equal(normalizeChange(salon, { action: 'manual', hours: 0 }).hours, null);
  assert.throws(
    () => normalizeChange(chambre, { action: 'manual', target: 20 }),
    /no temperature mode/,
  );
  assert.throws(() => normalizeChange(ballon, { action: 'manual', kind: 'eco' }), RangeError);
  assert.throws(() => normalizeChange(salon, { action: 'manual', kind: 'boost' }), RangeError);
  assert.throws(() => normalizeChange(salon, { action: 'manual', hours: -1 }), RangeError);
  assert.throws(() => normalizeChange(salon, { action: 'explode' }), RangeError);
  assert.equal(fallbackKind({ kind: null, kinds: ['comfort', 'frost'] }), 'comfort');
  assert.equal(fallbackKind({ kind: null, kinds: [] }), 'normal');
});

test('a manual setting is written as Voltalis expects it', () => {
  const eco = buildSetting(
    chambre,
    normalizeChange(chambre, { action: 'manual', kind: 'eco' }),
    T0,
    'Europe/Paris',
  );
  assert.deepEqual(eco, {
    idAppliance: 102,
    mode: 'ECOV',
    temperatureTarget: 16,
    enabled: true,
    untilFurtherNotice: true,
    isOn: true,
    endDate: null,
  });
  const timed = buildSetting(
    salon,
    normalizeChange(salon, { action: 'manual', target: 21, hours: 2 }),
    T0,
    'Europe/Paris',
  );
  assert.deepEqual(
    [timed.mode, timed.temperatureTarget, timed.untilFurtherNotice, timed.endDate],
    ['TEMPERATURE', 21, false, '2026-11-15T12:10:00'],
  );
  const off = buildSetting(ballon, normalizeChange(ballon, { action: 'off' }), T0, 'Europe/Paris');
  assert.deepEqual([off.enabled, off.isOn, off.mode], [true, false, 'NORMAL']);
  const auto = buildSetting(salon, normalizeChange(salon, { action: 'auto' }), T0, 'Europe/Paris');
  assert.deepEqual(
    [auto.enabled, auto.untilFurtherNotice, auto.isOn, auto.endDate, auto.mode],
    [false, false, true, '2026-11-15T10:10:00', 'CONFORT'],
  );
});

test('what a command will show', () => {
  assert.deepEqual(expectedOf({ action: 'auto' }), { manual: false });
  assert.deepEqual(expectedOf({ action: 'off' }), { isOn: false, manual: true });
  assert.deepEqual(expectedOf({ action: 'manual', kind: 'eco', target: 16 }), {
    isOn: true,
    manual: true,
    kind: 'eco',
  });
  assert.equal(expectedOf({ action: 'manual', kind: 'temperature', target: 21 }).target, 21);
});

test('the clock of the site', () => {
  assert.equal(localStamp(T0, 'Europe/Paris'), '2026-11-15T10:10:00');
  assert.equal(
    localStamp(Date.parse('2026-07-01T22:30:00Z'), 'Europe/Paris'),
    '2026-07-02T00:30:00',
  );
  assert.equal(localDay(Date.parse('2026-07-01T22:30:00Z'), 'Europe/Paris'), '2026-07-02');
  // An unknown timezone falls back to UTC instead of throwing.
  assert.equal(localStamp(T0, 'Nowhere/Land'), '2026-11-15T09:10:00');
});

test('an hour is stamped with its end', () => {
  assert.equal(hourKey('2026-11-15T14:00:00'), '2026-11-15T13');
  assert.equal(hourKey('2026-11-16T00:00:00+01:00'), '2026-11-15T23');
  assert.equal(hourKey('nonsense'), null);
});

test('the energy index only takes what is new of each hour', () => {
  const first = accountSteps(null, [step(9, 800), step(10, 300)]);
  assert.equal(first.deltaWh, 1100);
  assert.equal(first.record.kwh, 1.1);
  assert.deepEqual(
    [...first.byHour],
    [
      ['2026-11-15T08', 800],
      ['2026-11-15T09', 300],
    ],
  );
  // The running hour grew, a new hour started, a finished hour did not move.
  const second = accountSteps(first.record, [step(9, 800), step(10, 700), step(11, 50)]);
  assert.equal(second.deltaWh, 450);
  assert.equal(second.record.kwh, 1.55);
  assert.deepEqual(
    [...second.byHour],
    [
      ['2026-11-15T09', 400],
      ['2026-11-15T10', 50],
    ],
  );
  // A value corrected downwards, a glitch, a broken step: nothing is counted.
  const third = accountSteps(second.record, [
    step(10, 600),
    step(12, 999999),
    step(13, -5),
    { stepTimestampOnSite: 'x', totalConsumptionInWh: 10 },
    null,
  ]);
  assert.equal(third.deltaWh, 0);
  assert.equal(third.record.kwh, 1.55);
  assert.equal(accountSteps(null, undefined).record.kwh, 0);
});

test('only the last hours stay remembered as counted', () => {
  const steps = [];
  for (let day = 1; day <= 4; day += 1) {
    for (let hour = 1; hour <= 23; hour += 1) {
      steps.push({
        stepTimestampOnSite: `2026-11-0${day}T${String(hour).padStart(2, '0')}:00:00`,
        totalConsumptionInWh: 10,
      });
    }
  }
  const { record } = accountSteps(null, steps);
  assert.equal(Object.keys(record.counted).length, 60);
  assert.ok(record.counted['2026-11-04T22']);
  assert.equal(record.counted['2026-11-01T00'], undefined);
});

test('the power of the home comes from its last 10-minute step', () => {
  assert.equal(realtimePower(REALTIME), 1500);
  assert.equal(realtimePower({ consumptions: [{ totalConsumptionInWh: 100 }] }), 600);
  assert.equal(realtimePower({ consumptions: [] }), null);
  assert.equal(realtimePower(null), null);
});
