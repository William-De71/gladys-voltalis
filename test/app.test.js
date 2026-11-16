// The whole integration against the fake Gladys of the SDK and a fake Voltalis
// API: readings, discovery, states, energy, commands, scene triggers and
// actions, widgets, errors, persistence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import {
  createApp,
  CONFIRM_DELAY_MS,
  PENDING_MS,
  REFUSED_RETRY_MS,
  SLOW_MS,
  ENERGY_MS,
} from '../src/app.js';
import { CredentialsError, RateLimitError, NetworkError, ApiError } from '../src/voltalis-api.js';
import { THERMOSTAT_MODE, THERMOSTAT_PRESET } from '../src/constants.js';
import { T0, SALON, CHAMBRE, BALLON, fakeApi, step } from './helpers/fixtures.js';

const CONFIG = { email: 'me@example.com', password: 'secret' };
const MINUTE = 60 * 1000;
const ext = (appliance) => `ext:test-integration:appliance:${appliance.id}`;
const SITE_EXT = 'ext:test-integration:site:4242';
const out = (answer) => answer.data?.outputs ?? answer.data ?? answer;
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A connected integration on a fake clock.
 * @param {object} [options] - Options.
 * @returns {Promise<object>} The handles.
 */
async function start({
  config = CONFIG,
  api = fakeApi(),
  statePath = null,
  created = true,
  devices = [],
} = {}) {
  const clock = { now: T0 };
  // `devices`: already added by the user before this start (a restart).
  const gladys = createFakeGladys({ config: { ...config }, devices });
  const app = createApp(gladys, {
    api,
    now: () => clock.now,
    statePath,
    tickMs: 0,
    timezone: 'Europe/Paris',
    logger: silent,
  });
  await gladys.connect();
  if (created && devices.length === 0) {
    for (const device of gladys.fake.discoveredDevices) await gladys.fake.deviceCreated(device);
  }
  const advance = async (ms) => {
    clock.now += ms;
    await app.tick();
  };
  const device = (appliance) => gladys.fake.devices.find((d) => d.external_id === ext(appliance));
  const featureOf = (appliance, key) =>
    device(appliance).features.find((f) => f.external_id === `${ext(appliance)}:${key}`);
  const state = (appliance, key) => gladys.fake.lastState(`${ext(appliance)}:${key}`);
  const set = (appliance, key, value) =>
    gladys.fake.setValue(device(appliance), featureOf(appliance, key), value);
  // Let a command sent without waiting reach the fake API.
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const programming = (appliance) => api.appliances.find((a) => a.id === appliance.id).programming;
  return { gladys, app, api, clock, advance, device, state, set, settle, programming };
}

test('without credentials: nothing is read, the status says what to do', async () => {
  const { gladys, api } = await start({ config: {} });
  assert.deepEqual(api.calls, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /e-mail et le mot de passe/);
  assert.equal(gladys.fake.discoveredDevices.length, 0);
});

test('the first reading: discovery, states, energy, status', async () => {
  const { gladys, api, state } = await start();
  assert.deepEqual(api.calls, [
    'getAppliances',
    'getManualSettings',
    'getDiagnostics',
    'getRealtime',
    'getDay:2026-11-15',
  ]);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => [d.name, d.features.length]),
    [
      ['Salon', 4],
      ['Chambre', 3],
      ['Chauffe-eau', 2],
      ['Logement Voltalis (Lyon)', 2],
    ],
  );
  assert.equal(state(SALON, 'mode'), THERMOSTAT_MODE.AUTO);
  assert.equal(state(SALON, 'preset'), THERMOSTAT_PRESET.COMFORT);
  assert.equal(state(SALON, 'target_temperature'), 19.5);
  assert.equal(state(SALON, 'energy'), 2.1);
  assert.equal(state(CHAMBRE, 'mode'), THERMOSTAT_MODE.HEATING);
  assert.equal(state(CHAMBRE, 'preset'), THERMOSTAT_PRESET.ECO);
  assert.equal(state(BALLON, 'mode'), THERMOSTAT_MODE.OFF);
  assert.equal(gladys.fake.lastState(`${SITE_EXT}:power`), 1500);
  assert.equal(gladys.fake.lastState(`${SITE_EXT}:energy`), 3.9);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    '3 Voltalis appliance(s), 1 in manual mode, read every 2 min.',
  );
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
});

test('the clock: appliances at the interval, slower readings less often', async () => {
  const { api, advance, gladys, state } = await start();
  api.calls.length = 0;
  await advance(MINUTE);
  assert.deepEqual(api.calls, [], 'not due yet');
  await advance(MINUTE);
  assert.deepEqual(api.calls, ['getAppliances']);
  // The running hour grew: only the increase joins the index.
  api.day.perAppliance[101].push(step(12, 0));
  api.day.perAppliance[101][3] = step(11, 500);
  api.day.dataPoints[3] = step(11, 900);
  api.realtime.consumptions[0].totalConsumptionInWh = 400;
  api.calls.length = 0;
  await advance(SLOW_MS);
  assert.deepEqual(api.calls, ['getAppliances', 'getDiagnostics', 'getRealtime']);
  await advance(ENERGY_MS - SLOW_MS);
  assert.ok(api.calls.includes('getDay:2026-11-15'));
  assert.equal(state(SALON, 'energy'), 2.4);
  assert.equal(gladys.fake.lastState(`${SITE_EXT}:energy`), 4.5);
  assert.equal(gladys.fake.lastState(`${SITE_EXT}:power`), 2400);
});

test('a new day: the end of yesterday is read once more', async () => {
  const { api, advance } = await start();
  api.calls.length = 0;
  await advance(14 * 60 * MINUTE);
  const days = api.calls.filter((call) => call.startsWith('getDay'));
  assert.deepEqual(days, ['getDay:2026-11-15', 'getDay:2026-11-16']);
});

test('a setpoint: shown at once, written as a manual temperature, then confirmed', async () => {
  const { api, set, state, settle, advance, app, programming, gladys } = await start();
  const ack = await set(SALON, 'target_temperature', 21.2);
  assert.notEqual(ack?.status, 'error');
  assert.equal(state(SALON, 'target_temperature'), 21);
  assert.equal(state(SALON, 'mode'), THERMOSTAT_MODE.HEATING);
  await settle();
  assert.deepEqual(api.puts, [
    {
      id: '9101',
      setting: {
        idAppliance: 101,
        mode: 'TEMPERATURE',
        temperatureTarget: 21,
        enabled: true,
        untilFurtherNotice: true,
        isOn: true,
        endDate: null,
      },
    },
  ]);
  // The cloud still returns the old values: the commanded ones win.
  api.calls.length = 0;
  await advance(CONFIRM_DELAY_MS);
  assert.deepEqual(api.calls, ['getAppliances']);
  assert.equal(state(SALON, 'target_temperature'), 21);
  assert.equal(app.pending.size, 1);
  // Then the cloud agrees.
  Object.assign(programming(SALON), {
    progType: 'MANUAL',
    mode: 'TEMPERATURE',
    temperatureTarget: 21,
  });
  await advance(2 * MINUTE);
  assert.equal(app.pending.size, 0);
  assert.equal(state(SALON, 'mode'), THERMOSTAT_MODE.HEATING);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'asked by Gladys: no trigger');
});

test('a command the cloud never applies gives way to the truth', async () => {
  const { set, state, advance, app, settle } = await start();
  await set(SALON, 'preset', THERMOSTAT_PRESET.ECO);
  await settle();
  assert.equal(state(SALON, 'preset'), THERMOSTAT_PRESET.ECO);
  await advance(PENDING_MS + MINUTE);
  assert.equal(app.pending.size, 0);
  assert.equal(state(SALON, 'preset'), THERMOSTAT_PRESET.COMFORT);
  assert.equal(state(SALON, 'mode'), THERMOSTAT_MODE.AUTO);
});

test('mode and preset writes: off, manual, program, frost, schedule', async () => {
  const { api, set, settle } = await start();
  await set(SALON, 'mode', THERMOSTAT_MODE.OFF);
  await set(CHAMBRE, 'mode', THERMOSTAT_MODE.AUTO);
  await set(BALLON, 'mode', THERMOSTAT_MODE.HEATING);
  await set(CHAMBRE, 'preset', THERMOSTAT_PRESET.FROST);
  await set(CHAMBRE, 'preset', THERMOSTAT_PRESET.SCHEDULE);
  await settle();
  assert.deepEqual(
    api.puts.map((p) => [p.id, p.setting.enabled, p.setting.isOn, p.setting.mode]),
    [
      ['9101', true, false, 'CONFORT'],
      ['9102', false, true, 'ECOV'],
      ['9103', true, true, 'NORMAL'],
      ['9102', true, true, 'HORS_GEL'],
      // Back to the program: the mode sent with it is the one shown, unused.
      ['9102', false, true, 'HORS_GEL'],
    ],
  );
  assert.equal(api.puts[1].setting.endDate, '2026-11-15T10:10:00');
});

test('wrong writes are refused before anything is sent', async () => {
  const { api, set, gladys, device, settle } = await start();
  for (const [appliance, key, value] of [
    [SALON, 'target_temperature', 45],
    [SALON, 'mode', THERMOSTAT_MODE.COOLING],
    [SALON, 'preset', THERMOSTAT_PRESET.NIGHT],
    [SALON, 'energy', 3],
  ]) {
    await assert.rejects(async () => {
      const ack = await set(appliance, key, value);
      if (ack?.status === 'error' || ack?.error) throw new Error(ack.error ?? 'refused');
    }, `${key}=${value}`);
  }
  const home = gladys.fake.devices.find((d) => d.external_id === SITE_EXT);
  await assert.rejects(async () => {
    const ack = await gladys.fake.setValue(home, home.features[0], 1);
    if (ack?.status === 'error' || ack?.error) throw new Error(ack.error ?? 'refused');
  });
  await settle();
  assert.deepEqual(api.puts, []);
  assert.ok(device(SALON));
});

test('a write Voltalis refuses: the commanded value is dropped', async () => {
  const { api, set, state, settle, app } = await start();
  api.failOn.putManualSetting = new ApiError(500);
  await set(SALON, 'preset', THERMOSTAT_PRESET.FROST);
  await settle();
  await settle();
  assert.equal(app.pending.size, 0);
  assert.equal(state(SALON, 'preset'), THERMOSTAT_PRESET.COMFORT);
});

test('the manual setting id is looked up when Voltalis did not give it', async () => {
  const api = fakeApi();
  const kept = api.settings.pop();
  const { set, settle } = await start({ api });
  api.settings.push(kept);
  await set(BALLON, 'mode', THERMOSTAT_MODE.HEATING);
  await settle();
  await settle();
  assert.equal(api.puts[0].id, '9103');
});

test('scene triggers: the program changes a mode, an appliance goes in fault', async () => {
  const { api, advance, gladys, programming } = await start();
  programming(SALON).mode = 'ECO';
  await advance(2 * MINUTE);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [e.key, e.data.device, e.data.mode, e.data.previous_mode]),
    [['mode_changed', ext(SALON), 'eco', 'comfort']],
  );
  api.diagnostics[1].status = 'COMM_ERROR';
  await advance(SLOW_MS);
  assert.deepEqual(
    gladys.fake.sceneEvents.slice(1).map((e) => [e.key, e.data.device_name, e.data.status]),
    [['appliance_fault', 'Chambre', 'comm_error']],
  );
  api.diagnostics[1].status = 'OK';
  await advance(SLOW_MS);
  assert.equal(gladys.fake.sceneEvents.at(-1).key, 'appliance_recovered');
  assert.equal(gladys.fake.sceneEvents.length, 3);
});

test('no trigger for an appliance the user did not add', async () => {
  const { advance, gladys, programming } = await start({ created: false });
  programming(SALON).mode = 'ECO';
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('scene action: a manual mode, for one appliance or all that have it', async () => {
  const { api, gladys } = await start();
  const one = await gladys.fake.sceneAction('set_manual', {
    device: ext(SALON),
    mode: 'temperature',
    temperature: 20.4,
    hours: 2,
  });
  assert.deepEqual(out(one), { count: 1, failed: 0 });
  assert.deepEqual(
    [api.puts[0].setting.mode, api.puts[0].setting.temperatureTarget, api.puts[0].setting.endDate],
    ['TEMPERATURE', 20.5, '2026-11-15T12:10:00'],
  );
  api.puts.length = 0;
  const frost = await gladys.fake.sceneAction('set_manual', { mode: 'frost' });
  assert.deepEqual(out(frost), { count: 2, failed: 0 });
  assert.deepEqual(
    api.puts.map((p) => [p.id, p.setting.mode]),
    [
      ['9101', 'HORS_GEL'],
      ['9102', 'HORS_GEL'],
    ],
  );
  api.puts.length = 0;
  const off = await gladys.fake.sceneAction('set_manual', { mode: 'off' });
  assert.equal(out(off).count, 3);
  assert.ok(api.puts.every((p) => p.setting.isOn === false));
});

/**
 * @description Run a scene action that must fail.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The action.
 * @param {object} fields - Its fields.
 * @param {RegExp} [pattern] - What the error says.
 */
async function failing(gladys, key, fields, pattern = /./) {
  let outcome;
  try {
    outcome = await gladys.fake.sceneAction(key, fields);
  } catch (err) {
    assert.match(err.message, pattern);
    return;
  }
  assert.ok(outcome?.error || outcome?.status === 'error', `${key} should fail`);
  assert.match(String(outcome.error?.message ?? outcome.error ?? outcome.message ?? ''), pattern);
}

test('scene action: wrong fields fail, nothing is written', async () => {
  const { api, gladys } = await start();
  await failing(gladys, 'set_manual', {
    device: ext(CHAMBRE),
    mode: 'temperature',
    temperature: 20,
  });
  await failing(gladys, 'set_manual', { device: ext(SALON), mode: 'boost' });
  await failing(gladys, 'set_manual', { device: 'ext:nope', mode: 'eco' });
  await failing(gladys, 'set_manual', { device: SITE_EXT, mode: 'eco' });
  await failing(gladys, 'set_manual', { device: ext(SALON), mode: 'temperature', temperature: 50 });
  assert.deepEqual(api.puts, []);
});

test('scene action: back to the program', async () => {
  const { api, gladys } = await start();
  const all = await gladys.fake.sceneAction('back_to_program', {});
  assert.deepEqual(out(all), { count: 1, failed: 0 });
  assert.deepEqual(
    api.puts.map((p) => [p.id, p.setting.enabled]),
    [['9102', false]],
    'only the appliance in manual mode',
  );
  const one = await gladys.fake.sceneAction('back_to_program', { device: ext(SALON) });
  assert.equal(out(one).count, 1);
});

test('scene action: several appliances, one refused', async () => {
  const api = fakeApi();
  const { gladys } = await start({ api });
  let n = 0;
  api.putManualSetting = async () => {
    n += 1;
    if (n === 1) throw new ApiError(500);
  };
  const outcome = await gladys.fake.sceneAction('set_manual', { mode: 'comfort' });
  assert.deepEqual(out(outcome), { count: 1, failed: 1 });
});

test('scene action: programs and quick settings, without firing "mode changed"', async () => {
  const { api, gladys, advance, programming } = await start();
  const quick = await gladys.fake.sceneAction('set_program', { program: 'longleave', state: 'on' });
  assert.deepEqual(out(quick), { program: 'quicksettings.longleave', enabled: true });
  const user = await gladys.fake.sceneAction('set_program', {
    program: 'user',
    name: ' vacances ',
    state: 'off',
  });
  assert.deepEqual(out(user), { program: 'Vacances', enabled: false });
  assert.deepEqual(api.switched, [
    { kind: 'quick', id: 3, enabled: true },
    { kind: 'program', id: 8, name: 'Vacances', enabled: false },
  ]);
  // The program now drives the heater: a consequence of the action, no trigger.
  programming(SALON).mode = 'HORS_GEL';
  await advance(CONFIRM_DELAY_MS);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  await failing(
    gladys,
    'set_program',
    { program: 'user', name: 'Nope', state: 'on' },
    /Semaine, Vacances/,
  );
  await failing(gladys, 'set_program', { program: 'user', state: 'on' }, /name/);
  await failing(gladys, 'set_program', { program: 'athome', state: 'maybe' });
});

test('scene action: read now', async () => {
  const { api, gladys, clock } = await start();
  api.calls.length = 0;
  const soon = await gladys.fake.sceneAction('refresh', {});
  assert.deepEqual(api.calls, [], 'read less than 30 s ago');
  assert.deepEqual(out(soon), { appliances: 3, manual: 1, power: 1500, energy_today: 3.9 });
  clock.now += MINUTE;
  await gladys.fake.sceneAction('refresh', {});
  assert.deepEqual(api.calls, ['getAppliances']);
  clock.now += MINUTE;
  api.failNext = new NetworkError('ENOTFOUND');
  await failing(gladys, 'refresh', {}, /error/);
});

test('"Test the connection" lists the appliances', async () => {
  const { gladys } = await start();
  const result = await gladys.fake.action('test_connection', {});
  const message = result.data?.message ?? result.message ?? result.data ?? result;
  assert.match(
    JSON.stringify(message),
    /Connexion réussie. 3 appareil\(s\) : Salon \(Radiateur, Confort, 4 fonctionnalités\)/,
  );
  const bare = await start({ config: {} });
  const refused = await bare.gladys.fake.action('test_connection', {});
  assert.match(JSON.stringify(refused), /MyVoltalis/);
});

test('refused credentials: said once, tried again later or when they change', async () => {
  const api = fakeApi();
  api.failNext = new CredentialsError('BAD_CREDENTIALS', 401);
  const { gladys, advance } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /BAD_CREDENTIALS/);
  api.calls.length = 0;
  await advance(10 * MINUTE);
  assert.deepEqual(api.calls, [], 'no hammering');
  await advance(REFUSED_RETRY_MS);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  const other = fakeApi();
  other.failNext = new CredentialsError('BAD_CREDENTIALS', 401);
  const second = await start({ api: other });
  await second.gladys.fake.configUpdated({ ...CONFIG, password: 'new' });
  assert.equal(second.gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(other.credentials, { email: 'me@example.com', secret: 'new' });
});

test('a slow-down and an unreachable API', async () => {
  const { api, gladys, advance } = await start();
  api.failNext = new RateLimitError(5 * MINUTE);
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /next reading in 5 min/);
  api.calls.length = 0;
  await advance(2 * MINUTE);
  assert.deepEqual(api.calls, []);
  await advance(4 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /3 Voltalis appliance/);
  api.failNext = new NetworkError('ENOTFOUND');
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /ENOTFOUND/);
});

test('a slower reading that fails does not fail the appliances', async () => {
  const api = fakeApi();
  api.failOn.getDiagnostics = new ApiError(500);
  api.failOn['getDay:2026-11-15'] = new NetworkError('timeout');
  const { gladys, state } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(state(SALON, 'mode'), THERMOSTAT_MODE.AUTO);
  assert.equal(state(SALON, 'energy'), undefined);
});

test('widgets: appliances, energy, status, buttons', async () => {
  const { gladys, api } = await start();
  const get = async (key, request) => {
    const answer = await gladys.fake.widgetGet(key, request);
    return out(answer).content ?? answer.data ?? answer;
  };
  const cards = await get('appliances', { settings: {}, language: 'fr' });
  const list = cards.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Chambre', 'Chauffe-eau', 'Salon'],
  );
  assert.match(list.items[2].subtitle, /Confort · programmation/);
  const chosen = await get('appliances', { settings: { devices: [ext(SALON)] }, language: 'en' });
  assert.equal(chosen.components.find((c) => c.type === 'card-list').items.length, 1);

  const energy = await get('energy', { settings: {}, language: 'en' });
  assert.deepEqual(
    energy.components.filter((c) => c.type === 'value').map((v) => v.value),
    [3.9, 0, 1500],
  );
  const part = await get('energy', {
    settings: { devices: [ext(SALON), ext(BALLON)] },
    language: 'en',
  });
  assert.deepEqual(
    part.components.filter((c) => c.type === 'value').map((v) => v.value),
    [3.5, 0],
  );
  const status = await get('status', { language: 'de' });
  assert.equal(status.components[0].value, '1/3');

  const toast = await gladys.fake.widgetAction('appliances', 'all_auto', {}, { settings: {} });
  assert.match(JSON.stringify(toast), /1 appareil\(s\) de retour au programme/);
  assert.deepEqual(
    api.puts.map((p) => p.id),
    ['9102'],
  );
  api.puts.length = 0;
  await gladys.fake.widgetAction('appliances', 'all_frost', {}, { settings: {} });
  assert.deepEqual(
    api.puts.map((p) => [p.id, p.setting.mode]),
    [
      ['9102', 'HORS_GEL'],
      ['9101', 'HORS_GEL'],
    ],
  );
  const refreshed = await gladys.fake.widgetAction('status', 'refresh', {}, {});
  assert.match(JSON.stringify(refreshed), /3 appliance\(s\) read/);
  let failed;
  try {
    const unknown = await gladys.fake.widgetAction('appliances', 'explode', {}, { settings: {} });
    failed = Boolean(unknown?.error) || unknown?.status === 'error';
  } catch {
    failed = true;
  }
  assert.ok(failed, 'an unknown button fails');
  assert.ok(gladys.fake.widgetRefreshes.length > 0);
});

test('the language of the last widget names the devices', async () => {
  const { gladys } = await start({ created: false });
  assert.equal(
    gladys.fake.discoveredDevices.at(-1).name,
    'Logement Voltalis (Lyon)',
    'Europe/Paris',
  );
  await gladys.fake.widgetGet('status', { language: 'de' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.discoveredDevices.at(-1).name, 'Voltalis-Zuhause (Lyon)');
  await gladys.fake.configUpdated({ ...CONFIG, language: 'es' });
  assert.equal(gladys.fake.discoveredDevices.at(-1).name, 'Vivienda Voltalis (Lyon)');
});

test('a new interval is applied at once', async () => {
  const { gladys, api, advance } = await start();
  api.calls.length = 0;
  await gladys.fake.configUpdated({ ...CONFIG, refresh_minutes: '10' });
  assert.deepEqual(api.calls, ['getAppliances']);
  api.calls.length = 0;
  await advance(5 * MINUTE);
  assert.deepEqual(api.calls, []);
  assert.match(gladys.fake.connectionStatus.message.en, /every 10 min/);
});

test('the state survives a restart: no double count, no missed trigger', async () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'voltalis-')), 'state.json');
  const first = await start({ statePath });
  await first.gladys.fake.shutdown('SIGTERM');
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
  const saved = readFileSync(statePath, 'utf8');
  assert.doesNotMatch(saved, /secret|me@example/);
  assert.equal(JSON.parse(saved).energy['101'].kwh, 2.1);

  // While the integration was down, the program moved the heater to eco.
  const api = fakeApi();
  api.appliances[0].programming.mode = 'ECO';
  const second = await start({ statePath, api, devices: first.gladys.fake.devices });
  assert.equal(second.state(SALON, 'energy'), 2.1, 'the same hours are not counted twice');
  assert.deepEqual(
    second.gladys.fake.sceneEvents.map((e) => e.key),
    ['mode_changed'],
  );
});
