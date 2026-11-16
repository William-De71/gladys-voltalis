// Scene triggers: one event per transition, none on the first reading nor for a
// change the integration asked for; event data within the limits of the core.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  MANUAL_MODES,
  QUICK_SETTINGS,
  detectEvents,
  snapshotOf,
  parseOnOff,
  manualChange,
} from '../src/events.js';
import { parseAppliances } from '../src/voltalis.js';
import { APPLIANCES, SETTINGS, DIAGNOSTICS } from './helpers/fixtures.js';

const [salon] = parseAppliances(APPLIANCES, SETTINGS, DIAGNOSTICS);
const context = (expected = false) => ({
  device: 'ext:test:appliance:101',
  name: 'Salon',
  isExpected: () => expected,
});
const run = (previous, model, expected) => detectEvents(previous, model, context(expected));

test('the first reading only sets the baseline', () => {
  const { events, snapshot } = run(null, salon);
  assert.deepEqual(events, []);
  assert.deepEqual(snapshot, { state: 'comfort', manual: false, health: 'ok' });
  assert.deepEqual(snapshotOf(salon), snapshot);
});

test('the mode changes: one event, with the previous mode', () => {
  const { snapshot: before } = run(null, salon);
  assert.deepEqual(run(before, salon).events, []);
  const eco = { ...salon, kind: 'eco' };
  const { events, snapshot } = run(before, eco);
  assert.deepEqual(events, [
    {
      key: TRIGGERS.MODE_CHANGED,
      data: {
        device: 'ext:test:appliance:101',
        device_name: 'Salon',
        mode: 'eco',
        previous_mode: 'comfort',
        manual: false,
        target_temperature: null,
      },
    },
  ]);
  assert.deepEqual(run(snapshot, eco).events, []);
  // Same mode, but now a manual setting: it changed hands.
  assert.equal(run(snapshot, { ...eco, manual: true }).events[0].data.manual, true);
  const temperature = run(snapshot, { ...salon, kind: 'temperature', target: 21 }).events[0];
  assert.deepEqual(
    [temperature.data.mode, temperature.data.target_temperature],
    ['temperature', 21],
  );
  assert.equal(run(snapshot, { ...salon, isOn: false }).events[0].data.mode, 'off');
});

test('a change the integration asked for fires nothing, but is remembered', () => {
  const { snapshot: before } = run(null, salon);
  const { events, snapshot } = run(before, { ...salon, kind: 'eco', manual: true }, true);
  assert.deepEqual(events, []);
  assert.deepEqual(snapshot, { state: 'eco', manual: true, health: 'ok' });
});

test('an unknown state is no transition', () => {
  const { snapshot: before } = run(null, salon);
  const unknown = run(before, { ...salon, isOn: null });
  assert.deepEqual(unknown.events, []);
  assert.deepEqual(run(unknown.snapshot, salon).events, []);
});

test('faults and recoveries of the self-diagnosis', () => {
  const { snapshot: ok } = run(null, salon);
  const fault = run(ok, { ...salon, health: 'comm_error' });
  assert.deepEqual(
    fault.events.map((e) => [e.key, e.data.status]),
    [[TRIGGERS.APPLIANCE_FAULT, 'comm_error']],
  );
  // No diagnosis this time: the last one is kept, nothing fires.
  const kept = run(fault.snapshot, { ...salon, health: null });
  assert.deepEqual(kept.events, []);
  assert.equal(kept.snapshot.health, 'comm_error');
  const back = run(kept.snapshot, salon);
  assert.deepEqual(
    back.events.map((e) => [e.key, e.data.status, e.data.previous_status]),
    [[TRIGGERS.APPLIANCE_RECOVERED, 'ok', 'comm_error']],
  );
  // A test of Voltalis is neither a fault nor a recovery…
  const testing = run(ok, { ...salon, health: 'test' });
  assert.deepEqual(testing.events, []);
  assert.deepEqual(run(testing.snapshot, salon).events, []);
  // …unless it ends badly.
  assert.equal(
    run(testing.snapshot, { ...salon, health: 'nok' }).events[0].key,
    TRIGGERS.APPLIANCE_FAULT,
  );
  // From one fault to another: nothing new.
  assert.deepEqual(run(fault.snapshot, { ...salon, health: 'nok' }).events, []);
});

test('event data stay flat, scalar and small', () => {
  const { snapshot } = run(null, salon);
  const { events } = run(snapshot, { ...salon, kind: 'eco', health: 'nok' });
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.ok(Object.keys(event.data).length <= 30);
    for (const value of Object.values(event.data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
  }
});

test('the fields of the scene actions', () => {
  assert.equal(parseOnOff('on'), true);
  assert.equal(parseOnOff(' OFF '), false);
  assert.equal(parseOnOff(true), true);
  assert.throws(() => parseOnOff('maybe'), RangeError);
  assert.deepEqual(manualChange({ mode: 'eco' }), { action: 'manual', kind: 'eco' });
  assert.deepEqual(manualChange({ mode: 'temperature', temperature: 21, hours: 2 }), {
    action: 'manual',
    kind: 'temperature',
    target: 21,
    hours: 2,
  });
  // A temperature given with another mode is ignored; an empty field is no field.
  assert.deepEqual(manualChange({ mode: 'comfort', temperature: 25, hours: '' }), {
    action: 'manual',
    kind: 'comfort',
  });
  assert.deepEqual(manualChange({ mode: 'off', hours: 3 }), { action: 'off', hours: 3 });
  assert.throws(() => manualChange({ mode: 'boost' }), RangeError);
  assert.throws(() => manualChange({}), RangeError);
  assert.equal(MANUAL_MODES.length, 6);
  assert.deepEqual(Object.keys(QUICK_SETTINGS), ['athome', 'shortleave', 'longleave']);
  assert.equal(Object.keys(SCENE_ACTIONS).length, 4);
});
