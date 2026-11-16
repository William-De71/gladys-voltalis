// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { parseAppliances } from '../src/voltalis.js';
import {
  buildDevice,
  buildStates,
  discoverySignature,
  FEATURE_KEYS,
  PRESET_BY_KIND,
  KIND_BY_PRESET,
} from '../src/device.js';
import { THERMOSTAT_MODE, THERMOSTAT_PRESET } from '../src/constants.js';
import { LANGUAGES } from '../src/i18n.js';
import { APPLIANCES, SETTINGS, DIAGNOSTICS, SITE, fakeGladys } from './helpers/fixtures.js';

// Parsed appliances as app.js keeps them: with their energy index.
const [salon, chambre, ballon] = parseAppliances(APPLIANCES, SETTINGS, DIAGNOSTICS).map((item) => ({
  ...item,
  energyKwh: 3.5,
}));
const site = { isSite: true, ...SITE, powerW: 1500, energyKwh: 42.1234 };
const models = [salon, chambre, ballon, site];
const devices = (language) => models.map((model) => buildDevice(fakeGladys, model, language));
const keysOf = (model) =>
  buildDevice(fakeGladys, model).features.map((f) => f.external_id.split(':').pop());
const statesOf = (model) =>
  Object.fromEntries(
    buildStates(fakeGladys, model).map((s) => [
      s.device_feature_external_id.split(':').pop(),
      s.state,
    ]),
  );

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core 5.3.0
// (server/utils/constants.js), and the pairs the front labels
// (front/src/config/i18n: deviceFeatureCategory.<category>.<type>).
const UNITS_OF = {
  [CATEGORIES.THERMOSTAT]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.ENERGY_SENSOR]: [UNITS.WATT, UNITS.KILOWATT, UNITS.KILOWATT_HOUR, UNITS.WATT_HOUR],
};
// thermostat mode / preset carry no unit in the core.
const NO_UNIT = [TYPES.THERMOSTAT.MODE, TYPES.THERMOSTAT.PRESET];
const PAIRS = [
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.MODE],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.PRESET],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.POWER],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.INDEX],
];
const WRITABLE = ['target_temperature', 'mode', 'preset'];

test('devices are never polled by Gladys: the integration has its own clock', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        const key = feature.external_id.split(':').pop();
        assert.equal(feature.read_only, !WRITABLE.includes(key), feature.external_id);
        assert.equal(feature.has_feedback, WRITABLE.includes(key), feature.external_id);
        assert.ok(feature.name, feature.external_id);
        assert.doesNotMatch(feature.name, /^feature_/, feature.external_id);
        for (const field of ['present', 'value', 'key']) assert.equal(feature[field], undefined);
      }
    }
  }
});

test('every category / type pair is a known one, every unit belongs to its category', () => {
  assert.equal(TYPES.THERMOSTAT.PRESET, 'preset', 'the SDK knows the preset type');
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (NO_UNIT.includes(feature.type)) {
        assert.equal(feature.unit, undefined, feature.external_id);
      } else {
        assert.ok(UNITS_OF[feature.category].includes(feature.unit), feature.external_id);
      }
    }
  }
});

test('the features follow what the appliance can do', () => {
  assert.deepEqual(keysOf(salon), ['mode', 'preset', 'target_temperature', 'energy']);
  assert.deepEqual(keysOf(chambre), ['mode', 'preset', 'energy'], 'no temperature mode');
  assert.deepEqual(keysOf(ballon), ['mode', 'energy'], 'a relay: on or off');
  assert.deepEqual(keysOf(site), ['power', 'energy']);
  for (const key of FEATURE_KEYS) assert.match(key, /^[a-z_]+$/);
});

test('the states: off / manual / program, preset, setpoint, index', () => {
  assert.deepEqual(statesOf(salon), {
    mode: THERMOSTAT_MODE.AUTO,
    preset: THERMOSTAT_PRESET.COMFORT,
    target_temperature: 19.5,
    energy: 3.5,
  });
  assert.deepEqual(statesOf(chambre), {
    mode: THERMOSTAT_MODE.HEATING,
    preset: THERMOSTAT_PRESET.ECO,
    energy: 3.5,
  });
  assert.deepEqual(statesOf(ballon), { mode: THERMOSTAT_MODE.OFF, energy: 3.5 });
  assert.deepEqual(statesOf(site), { power: 1500, energy: 42.123 });
  // The temperature mode has no preset; the default setpoint is shown without one.
  const temperature = statesOf({ ...salon, kind: 'temperature', target: null });
  assert.deepEqual([temperature.preset, temperature.target_temperature], [undefined, 19]);
  assert.equal(statesOf({ ...salon, kind: 'frost' }).preset, THERMOSTAT_PRESET.FROST);
  // Unknown values are not published.
  assert.deepEqual(statesOf({ ...ballon, isOn: null, energyKwh: null }), {});
  assert.deepEqual(statesOf({ ...site, powerW: null, energyKwh: null }), {});
});

test('the setpoint: 7 to 30 °C by half degrees; the mode: off, manual or program', () => {
  const [mode, preset, setpoint] = buildDevice(fakeGladys, salon).features;
  assert.deepEqual([setpoint.min, setpoint.max, setpoint.step], [7, 30, 0.5]);
  assert.deepEqual(
    mode.supported_options.map((o) => o.value),
    [THERMOSTAT_MODE.OFF, THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.AUTO],
  );
  for (const option of mode.supported_options) {
    assert.ok(option.value >= mode.min && option.value <= mode.max);
  }
  for (const value of Object.values(PRESET_BY_KIND)) {
    assert.ok(value >= preset.min && value <= preset.max);
    assert.ok(KIND_BY_PRESET[value]);
  }
});

test('external ids come from the Voltalis ids, never from the names', () => {
  const device = buildDevice(fakeGladys, salon, 'fr');
  assert.equal(device.external_id, 'ext:test-integration:appliance:101');
  const renamed = buildDevice(fakeGladys, { ...salon, name: 'Séjour' }, 'fr');
  assert.deepEqual(
    renamed.features.map((f) => f.external_id),
    device.features.map((f) => f.external_id),
  );
  assert.equal(renamed.name, 'Séjour');
  assert.equal(device.features[2].name, 'Consigne');
  assert.equal(buildDevice(fakeGladys, { ...salon, name: '' }).name, 'Voltalis 101');
  assert.deepEqual(device.params, [
    { name: 'VOLTALIS_TYPE', value: 'heater' },
    { name: 'VOLTALIS_MODES', value: 'eco,comfort,temperature,frost' },
  ]);
  assert.equal(device.model, 'Voltalis VX_WIRE');
  const home = buildDevice(fakeGladys, site, 'fr');
  assert.equal(home.external_id, 'ext:test-integration:site:4242');
  assert.equal(home.name, 'Logement Voltalis (Lyon)');
  assert.equal(buildDevice(fakeGladys, { ...site, city: '' }, 'de').name, 'Voltalis-Zuhause');
  assert.notEqual(
    discoverySignature(fakeGladys, models, 'fr'),
    discoverySignature(fakeGladys, models, 'en'),
  );
});

test('the whole Discovery batch and the states are accepted by the fake Gladys', async () => {
  for (const language of LANGUAGES) {
    const gladys = createFakeGladys();
    await gladys.connect();
    await gladys.publishDiscoveredDevices(
      models.map((model) => buildDevice(gladys, model, language)),
    );
    assert.equal(gladys.fake.discoveredDevices.length, 4);
    await gladys.publishStates(models.flatMap((model) => buildStates(gladys, model)));
    assert.equal(gladys.fake.requests.filter((r) => r.status >= 400).length, 0);
    await gladys.disconnect();
  }
});
