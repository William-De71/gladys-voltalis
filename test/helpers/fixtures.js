// -----------------------------------------------------------------------------
// Made-up Voltalis answers, shaped like the ones the community integrations
// for Home Assistant describe (see NOTICE): appliances with their
// `programming`, manual settings, self-diagnosis, 10-minute steps and hours of
// a day. Never a real account.
// -----------------------------------------------------------------------------

import { createVoltalisApi } from '../../src/voltalis-api.js';

// 10:10 in Paris (UTC+1).
const T0 = Date.parse('2026-11-15T09:10:00Z');
const SITE = { id: '4242', name: '', city: 'Lyon', timezone: 'Europe/Paris' };

// A heater following the default program, a heater in manual eco (a newer
// modulator: ECOV, no temperature mode), and a water heater switched off by
// the user's program.
const APPLIANCES = [
  {
    id: 101,
    name: 'Salon',
    applianceType: 'HEATER',
    modulatorType: 'VX_WIRE',
    availableModes: ['ECO', 'CONFORT', 'TEMPERATURE', 'HORS_GEL'],
    heatingLevel: 2,
    programming: {
      progType: 'DEFAULT',
      progName: 'program.default',
      idManualSetting: null,
      isOn: true,
      untilFurtherNotice: null,
      mode: 'CONFORT',
      idPlanning: 1,
      endDate: null,
      temperatureTarget: 19.5,
      defaultTemperature: 19,
    },
  },
  {
    id: 102,
    name: 'Chambre',
    applianceType: 'HEATER',
    modulatorType: 'VX_WIRE',
    availableModes: ['ECOV', 'CONFORT', 'HORS_GEL'],
    heatingLevel: 1,
    programming: {
      progType: 'MANUAL',
      progName: '',
      idManualSetting: 9102,
      isOn: true,
      untilFurtherNotice: false,
      mode: 'ECOV',
      idPlanning: null,
      endDate: '2026-11-15T22:30:00',
      temperatureTarget: 16,
      defaultTemperature: 16,
    },
  },
  {
    id: 103,
    name: 'Chauffe-eau',
    applianceType: 'WATER_HEATER',
    modulatorType: 'VX_RELAY',
    availableModes: ['NORMAL'],
    heatingLevel: 0,
    programming: {
      progType: 'USER',
      progName: 'Semaine',
      idManualSetting: null,
      isOn: false,
      untilFurtherNotice: null,
      mode: 'NORMAL',
      idPlanning: 7,
      endDate: null,
      temperatureTarget: null,
      defaultTemperature: null,
    },
  },
];
const [SALON, CHAMBRE, BALLON] = APPLIANCES;

const SETTINGS = APPLIANCES.map((appliance) => ({
  id: 9000 + appliance.id,
  idAppliance: appliance.id,
  enabled: appliance.programming.progType === 'MANUAL',
  untilFurtherNotice: false,
  isOn: true,
  mode: appliance.programming.mode,
  endDate: null,
  temperatureTarget: 18,
}));

const DIAGNOSTICS = APPLIANCES.map((appliance) => ({ csApplianceId: appliance.id, status: 'OK' }));

const REALTIME = {
  aggregationStepInSeconds: 600,
  consumptions: [{ stepTimestampInUtc: '2026-11-15T09:00:00Z', totalConsumptionInWh: 250 }],
};

const step = (hour, wh) => ({
  stepTimestampOnSite: `2026-11-15T${String(hour).padStart(2, '0')}:00:00`,
  totalConsumptionInWh: wh,
});
// The hours of the day so far: stamped with their end, the running one grows.
const DAY = {
  dataPoints: [step(8, 900), step(9, 1500), step(10, 1200), step(11, 300)],
  perAppliance: {
    101: [step(8, 400), step(9, 800), step(10, 700), step(11, 200)],
    102: [step(8, 100), step(9, 100), step(10, 100), step(11, 0)],
    103: [step(8, 400), step(9, 600), step(10, 400), step(11, 0)],
  },
};

const QUICK_SETTINGS = [
  { id: 1, name: 'quicksettings.athome', enabled: true },
  { id: 2, name: 'quicksettings.shortleave', enabled: false },
  { id: 3, name: 'quicksettings.longleave', enabled: false },
];
const PROGRAMS = [
  { id: 7, name: 'Semaine', enabled: true },
  { id: 8, name: 'Vacances', enabled: false },
];

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description A deep copy of the appliances, changed by a function.
 * @param {Function} [change] - `(copy) => void`.
 * @returns {object[]} The copy.
 */
function variant(change = () => {}) {
  const list = copy(APPLIANCES);
  change(list);
  return list;
}

/**
 * @description A fake Voltalis API (no network): the answers it serves, the
 * writes it receives, an error to throw once.
 * @param {object} [options] - Answers to start from.
 * @returns {object} The fake API.
 */
function fakeApi({ appliances = APPLIANCES, day = DAY } = {}) {
  const fake = {
    appliances: copy(appliances),
    settings: copy(SETTINGS),
    diagnostics: copy(DIAGNOSTICS),
    realtime: copy(REALTIME),
    day: copy(day),
    quick: copy(QUICK_SETTINGS),
    programs: copy(PROGRAMS),
    calls: [],
    puts: [],
    switched: [],
    credentials: null,
    failNext: null,
    // Method name -> error thrown on every call.
    failOn: {},
    setCredentials(email, secret) {
      fake.credentials = email && secret ? { email, secret } : null;
    },
    hasCredentials: () => fake.credentials !== null,
    site: () => (fake.credentials ? { ...SITE } : null),
    requestsLastHour: () => fake.calls.length,
    enter(name) {
      fake.calls.push(name);
      if (fake.failOn[name]) throw fake.failOn[name];
      if (fake.failNext) {
        const error = fake.failNext;
        fake.failNext = null;
        throw error;
      }
    },
    async getAppliances() {
      fake.enter('getAppliances');
      return copy(fake.appliances);
    },
    async getManualSettings() {
      fake.enter('getManualSettings');
      return copy(fake.settings);
    },
    async putManualSetting(id, setting) {
      fake.enter('putManualSetting');
      fake.puts.push({ id: String(id), setting: copy(setting) });
    },
    async getDiagnostics() {
      fake.enter('getDiagnostics');
      return copy(fake.diagnostics);
    },
    async getRealtime() {
      fake.enter('getRealtime');
      return copy(fake.realtime);
    },
    async getDay(date) {
      fake.enter(`getDay:${date}`);
      return copy(fake.day);
    },
    async getQuickSettings() {
      fake.enter('getQuickSettings');
      return copy(fake.quick);
    },
    async getPrograms() {
      fake.enter('getPrograms');
      return copy(fake.programs);
    },
    async setQuickSetting(id, enabled) {
      fake.enter('setQuickSetting');
      fake.switched.push({ kind: 'quick', id, enabled });
    },
    async setProgram(id, name, enabled) {
      fake.enter('setProgram');
      fake.switched.push({ kind: 'program', id, name, enabled });
    },
  };
  return fake;
}

/**
 * @description A fake `fetch` answering from a handler.
 * @param {Function} handler - `(url, init, n) => { status, body }`.
 * @returns {Function & { requests: object[] }} The fetch.
 */
function fakeFetch(handler) {
  const requests = [];
  const impl = async (url, init = {}) => {
    requests.push({ url, ...init });
    const answer = await handler(url, init, requests.length);
    const text = answer.body === undefined ? '' : JSON.stringify(answer.body);
    return { status: answer.status ?? 200, text: async () => text };
  };
  impl.requests = requests;
  return impl;
}

/**
 * @description A real API client on a fake fetch and a fake clock.
 * @param {Function} handler - The fetch handler.
 * @returns {{ api: object, fetch: Function, clock: object }} The client.
 */
function apiWithFetch(handler) {
  const clock = { now: 1_800_000_000_000, slept: [] };
  const fetchImpl = fakeFetch(handler);
  const api = createVoltalisApi({
    fetchImpl,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.slept.push(ms);
      clock.now += ms;
    },
  });
  return { api, fetch: fetchImpl, clock };
}

// Ids of the fake Gladys (selector "test-integration").
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:test-integration:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  T0,
  SITE,
  APPLIANCES,
  SALON,
  CHAMBRE,
  BALLON,
  SETTINGS,
  DIAGNOSTICS,
  REALTIME,
  DAY,
  QUICK_SETTINGS,
  PROGRAMS,
  step,
  variant,
  fakeApi,
  fakeFetch,
  apiWithFetch,
  fakeGladys,
};
