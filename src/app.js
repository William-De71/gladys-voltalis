// -----------------------------------------------------------------------------
// The Voltalis integration: every handler, registered on a Gladys client.
//
//   - one request, `GET managed-appliance`, reads what every appliance does at
//     the chosen interval (1, 2, 5 or 10 minutes) on the integration's own
//     clock: the devices are never polled by Gladys (`should_poll: false`).
//     Slower readings ride along: the self-diagnosis and the power of the home
//     every 10 minutes, the hours of the day (energy) every 15 minutes;
//   - one Gladys device per Voltalis appliance and one for the home
//     (device.js), only the changed states are published
//     (publishChangedStates, with a 30-minute heartbeat); the hours Voltalis
//     measures are cumulated into an energy index (voltalis.js);
//   - a command (a feature, a scene action, a widget button) writes the manual
//     setting of the appliance (`PUT manualsetting/{id}`) and is shown at
//     once; one reading follows to confirm it. Meanwhile, and for 3 minutes at
//     most, the commanded values win over what the cloud still returns;
//   - scene triggers on transitions (events.js), scene actions, three widgets
//     (widgets.js), one configuration button ("Test the connection").
//
// Transport: cloud (Voltalis API). index.js only creates the SDK client; the
// tests drive this module with the fake Gladys of the SDK and a fake API.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  guessLanguage,
  resolveTimezone,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import {
  parseAppliances,
  normalizeChange,
  buildSetting,
  expectedOf,
  accountSteps,
  realtimePower,
  stateOf,
  localDay,
  HOUR_MS,
} from './voltalis.js';
import { createVoltalisApi, CredentialsError, RateLimitError, ApiError } from './voltalis-api.js';
import {
  buildDevice,
  buildStates,
  featuresOf,
  idsOf,
  deviceName,
  discoverySignature,
  KIND_BY_PRESET,
} from './device.js';
import { THERMOSTAT_MODE, THERMOSTAT_PRESET } from './constants.js';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  QUICK_SETTINGS,
  detectEvents,
  parseOnOff,
  manualChange,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  buildAppliancesWidget,
  buildEnergyWidget,
  buildStatusWidget,
  energySummary,
  isFault,
} from './widgets.js';
import { createState, DEFAULT_PATH } from './state.js';
import { t, all, isLanguage } from './i18n.js';

const ACTIONS = { TEST: 'test_connection' };
const SITE_KEY = 'site';
// The clock: the due readings are checked this often.
const TICK_MS = 10 * 1000;
// The reading that confirms a command comes this long after it.
const CONFIRM_DELAY_MS = 5 * 1000;
// The commanded values win over the cloud answers this long at most.
const PENDING_MS = 3 * 60 * 1000;
// A change the integration asked for never fires a trigger within this delay.
const EXPECTED_MS = 10 * 60 * 1000;
// After a program is switched from a scene, no "mode changed" fires this long.
const QUIET_MS = 3 * 60 * 1000;
// A refresh button or action reads again only past this delay.
const MIN_MANUAL_GAP_MS = 30 * 1000;
// The self-diagnosis and the power of the home are read this often.
const SLOW_MS = 10 * 60 * 1000;
// The hours of the day are read this often (Voltalis fills them hour by hour).
const ENERGY_MS = 15 * 60 * 1000;
// The ids of the manual settings are read again this often.
const SETTINGS_MS = 6 * HOUR_MS;
// Refused credentials are tried again this often.
const REFUSED_RETRY_MS = 30 * 60 * 1000;
// Slow-down after a 429: the interval doubles each time, up to this.
const MAX_PAUSE_MS = 30 * 60 * 1000;
// requestWidgetRefresh: at most once every 10 s per widget.
const WIDGET_REFRESH_GAP_MS = 10 * 1000;
// publishChangedStates also re-sends an unchanged value this old.
const HEARTBEAT_MS = 30 * 60 * 1000;
const PENDING_KEYS = ['isOn', 'kind', 'manual', 'target'];

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {object} [options.api] - A Voltalis API client (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {string|null} [options.statePath] - File of the state (null: memory).
 * @param {number} [options.tickMs] - Clock period, 0 for none (tests).
 * @param {string} [options.timezone] - IANA timezone of Gladys (language
 *   guess, and the days when Voltalis gives no timezone for the site).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    api = createVoltalisApi(),
    now = () => Date.now(),
    statePath = DEFAULT_PATH,
    tickMs = TICK_MS,
    timezone = resolveTimezone(),
    logger = sdkLogger,
  } = {},
) {
  const state = createState({ path: statePath, logger });
  let config = normalizeConfig({});
  let language = null;
  // id -> parsed appliance as the cloud returned it, with energyKwh. What
  // Gladys sees is this with the commanded values on top (view()).
  let cloud = new Map();
  // The home: `{ isSite, id, name, city, powerW, energyKwh }`.
  let site = null;
  let settings = [];
  let settingsAt = -Infinity;
  let diagnostics = [];
  let slowAt = -Infinity;
  let energyAt = -Infinity;
  let energyDay = null;
  let lastDiscovery = null;
  let connection = 'unknown';
  let connectionDetail = null;
  let lastSuccessAt = 0;
  let lastAttemptAt = 0;
  let nextPollAt = 0;
  let pausedUntil = 0;
  let backoff = 0;
  let quietUntil = 0;
  let lastStatus = null;
  let polling = null;
  let timer = null;
  let running = Promise.resolve();
  // id -> { isOn?, kind?, manual?, target?, until } — commanded, not confirmed yet.
  const pending = new Map();
  // id -> { isOn?, kind?, manual, until } — what the integration asked for.
  const expected = new Map();
  const widgetRefreshedAt = new Map();

  const textLanguage = () =>
    config.language !== AUTO_LANGUAGE ? config.language : (language ?? guessLanguage(timezone));
  const intervalMs = () => config.refreshMinutes * 60 * 1000;
  const siteTimezone = () => api.site?.()?.timezone || timezone;
  const appliances = () => [...cloud.values()].map(view);
  const appliance = (id) => (cloud.has(id) ? view(cloud.get(id)) : null);
  const devices = () => (site ? [...appliances(), site] : appliances());
  const nameOf = (model) => deviceName(model, textLanguage());
  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));
  const externalIdOf = (model) => idsOf(gladys, model).device;
  const byExternalId = (externalId) =>
    devices().find((model) => externalIdOf(model) === externalId) ?? null;

  // --- Publishing ---------------------------------------------------------------

  /** @description Offer every appliance and the home on the Discovery screen. */
  async function publishDiscovery({ force = false } = {}) {
    if (!gladys.connected) return;
    const list = devices();
    const signature = discoverySignature(gladys, list, textLanguage());
    if (!force && signature === lastDiscovery) return;
    try {
      await gladys.publishDiscoveredDevices(
        list.map((model) => buildDevice(gladys, model, textLanguage())),
      );
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
  }

  /**
   * @description Publish the changed states of the devices the user created.
   * @param {object[]} list - Parsed appliances, or the site.
   */
  async function publishStates(list) {
    if (!gladys.connected) return;
    const created = createdIds();
    const states = list
      .filter((model) => created.has(externalIdOf(model)))
      .flatMap((model) => buildStates(gladys, model));
    if (states.length === 0) return;
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.error('Unable to publish the states', err);
    }
  }

  /** @description Ask Gladys to fetch the widgets again (10 s apart at least). */
  function refreshWidgets() {
    if (!gladys.connected) return;
    Object.values(WIDGETS).forEach((key) => {
      const last = widgetRefreshedAt.get(key) ?? -Infinity;
      if (now() - last < WIDGET_REFRESH_GAP_MS) return;
      widgetRefreshedAt.set(key, now());
      try {
        gladys.requestWidgetRefresh(key);
      } catch (err) {
        logger.warn(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    });
  }

  /**
   * @description The message of the current connection state.
   * @returns {{connected: boolean, message: object}|null} The status (null: unknown yet).
   */
  function statusMessage() {
    if (connection === 'unconfigured') {
      return { connected: false, message: all('statusUnconfigured') };
    }
    if (connection === 'refused') {
      return {
        connected: false,
        message: all('statusRefused', { reason: connectionDetail ?? 'BAD_CREDENTIALS' }),
      };
    }
    if (connection === 'rate_limited') {
      return {
        connected: true,
        message: all('statusRateLimited', {
          n: Math.max(1, Math.ceil((pausedUntil - now()) / 60000)),
        }),
      };
    }
    if (connection === 'error') {
      return {
        connected: false,
        message: all('statusError', { error: connectionDetail ?? 'network' }),
      };
    }
    if (connection === 'ok' && cloud.size === 0) {
      return { connected: true, message: all('statusNoAppliance') };
    }
    if (connection === 'ok') {
      const list = appliances();
      return {
        connected: true,
        message: all('statusOk', {
          count: list.length,
          manual: list.filter((model) => model.manual).length,
          minutes: config.refreshMinutes,
        }),
      };
    }
    return null;
  }

  /** @description Show the state of the connection in the Configuration screen. */
  async function reportStatus() {
    const status = statusMessage();
    if (!status) return;
    const signature = JSON.stringify(status);
    if (!gladys.connected || signature === lastStatus) return;
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the status', err);
    }
  }

  /**
   * @description Fire a scene event; a refusal is logged, never thrown.
   * @param {string} key - The trigger.
   * @param {object} data - Its data.
   */
  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Readings -----------------------------------------------------------------

  /**
   * @description An appliance with the values commanded but not confirmed yet
   * on top of the cloud values (never changes `pending`).
   * @param {object} model - The appliance as the cloud returned it.
   * @returns {object} The appliance Gladys sees.
   */
  function view(model) {
    const entry = pending.get(model.id);
    if (!entry || now() >= entry.until) return model;
    const result = { ...model };
    for (const key of PENDING_KEYS) {
      if (key in entry) result[key] = entry[key];
    }
    return result;
  }

  /**
   * @description Drop the commanded values a new reading confirms, and the
   * late ones: from then on the cloud is right.
   * @param {object} model - The appliance as the cloud returned it.
   */
  function confirmPending(model) {
    const entry = pending.get(model.id);
    if (!entry) return;
    if (now() >= entry.until) {
      pending.delete(model.id);
      return;
    }
    for (const key of PENDING_KEYS) {
      if (key in entry && model[key] === entry[key]) delete entry[key];
    }
    if (!PENDING_KEYS.some((key) => key in entry)) pending.delete(model.id);
  }

  /**
   * @description Whether the integration asked for this state of an appliance.
   * @param {string} id - The appliance id.
   * @param {object} snapshot - `{ state, manual }`.
   * @returns {boolean} Asked for.
   */
  function isExpected(id, snapshot) {
    if (now() < quietUntil) return true;
    const entry = expected.get(id);
    if (!entry) return false;
    if (now() >= entry.until) {
      expected.delete(id);
      return false;
    }
    if (entry.manual !== snapshot.manual) return false;
    if (!entry.manual) {
      // Back to the program: whatever the program does now was asked for, once.
      expected.delete(id);
      return true;
    }
    return entry.isOn === false ? snapshot.state === 'off' : entry.kind === snapshot.state;
  }

  /**
   * @description Run a secondary reading: a failure keeps the previous value,
   * unless Voltalis refuses the account or asks to slow down.
   * @param {string} what - Its name, for the log.
   * @param {Function} task - `() => Promise`.
   * @param {unknown} fallback - The value kept on failure.
   * @returns {Promise<unknown>} The result.
   */
  async function secondary(what, task, fallback) {
    try {
      return await task();
    } catch (err) {
      if (err instanceof CredentialsError || err instanceof RateLimitError) throw err;
      logger.warn(`Voltalis ${what} not read: ${err.message}`);
      return fallback;
    }
  }

  /**
   * @description Add the hours of a day to the energy indexes.
   * @param {object} day - `{ dataPoints, perAppliance }`.
   */
  function ingestDay(day) {
    const account = (id, steps) => {
      const result = accountSteps(state.energy(id), steps);
      if (result.deltaWh <= 0 && state.energy(id)) return;
      state.setEnergy(id, result.record);
      if (result.byHour.size > 0) state.addHours(id, result.byHour);
    };
    if (Array.isArray(day?.dataPoints)) account(SITE_KEY, day.dataPoints);
    const perAppliance = day?.perAppliance;
    if (perAppliance && typeof perAppliance === 'object') {
      for (const [id, steps] of Object.entries(perAppliance)) account(String(id), steps);
    }
  }

  /** @description Read the hours of today (and the end of yesterday once). */
  async function readEnergy() {
    const today = localDay(now(), siteTimezone());
    if (energyDay !== null && energyDay !== today) {
      // A new day: the last hours of yesterday were filled after our last reading.
      const yesterday = await secondary('consumption', () => api.getDay(energyDay), null);
      if (yesterday) ingestDay(yesterday);
    }
    const day = await secondary('consumption', () => api.getDay(today), null);
    if (day) ingestDay(day);
    energyDay = today;
    energyAt = now();
  }

  /**
   * @description Take a new list of appliances in: parse, detect the scene
   * events, remember the snapshots.
   * @param {object[]} raw - The answer of the API.
   * @returns {Promise<object[]>} The parsed appliances.
   */
  async function ingest(raw) {
    const parsed = parseAppliances(raw, settings, diagnostics);
    const events = [];
    const created = createdIds();
    const next = new Map();
    for (const item of parsed) {
      confirmPending(item);
      const model = { ...item, energyKwh: state.energy(item.id)?.kwh ?? null };
      next.set(item.id, model);
      const result = detectEvents(state.snapshot(item.id), model, {
        device: externalIdOf(model),
        name: deviceName(model),
        isExpected: (snapshot) => isExpected(item.id, snapshot),
      });
      state.setSnapshot(item.id, result.snapshot);
      if (created.has(externalIdOf(model))) events.push(...result.events);
    }
    cloud = next;
    const account = api.site?.();
    if (account) {
      site = {
        isSite: true,
        id: account.id,
        name: account.name,
        city: account.city,
        powerW: site?.id === account.id ? site.powerW : null,
        energyKwh: state.energy(SITE_KEY)?.kwh ?? null,
      };
    }
    // An empty answer never wipes the energy indexes.
    if (cloud.size > 0) state.keep([...cloud.keys(), SITE_KEY]);
    state.save();
    for (const event of events) await fire(event.key, event.data);
    return appliances();
  }

  /**
   * @description Read the appliances, and the slower readings that are due.
   * @param {string} reason - timer, manual, scan, connected, confirm.
   * @returns {Promise<boolean>} The reading worked.
   */
  function poll(reason = 'timer') {
    if (polling) return polling;
    polling = (async () => {
      lastAttemptAt = now();
      nextPollAt = now() + intervalMs();
      if (!api.hasCredentials()) {
        connection = 'unconfigured';
        await reportStatus();
        refreshWidgets();
        return false;
      }
      try {
        const raw = await api.getAppliances();
        const unknown = raw.some(
          (item) => !settings.some((entry) => String(entry?.idAppliance) === String(item?.id)),
        );
        if (unknown || now() - settingsAt >= SETTINGS_MS) {
          settings = await secondary('manual settings', () => api.getManualSettings(), settings);
          settingsAt = now();
        }
        let power = null;
        if (now() - slowAt >= SLOW_MS) {
          diagnostics = await secondary('self-diagnosis', () => api.getDiagnostics(), diagnostics);
          power = realtimePower(await secondary('power', () => api.getRealtime(1), null));
          slowAt = now();
        }
        if (now() - energyAt >= ENERGY_MS) await readEnergy();
        connection = 'ok';
        connectionDetail = null;
        backoff = 0;
        pausedUntil = 0;
        lastSuccessAt = now();
        nextPollAt = now() + intervalMs();
        const parsed = await ingest(raw);
        if (site && power !== null) site.powerW = power;
        logger.debug?.(`Read ${parsed.length} appliance(s) (${reason})`);
        await publishDiscovery();
        await publishStates(devices());
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        await reportStatus();
        refreshWidgets();
      }
    })().finally(() => {
      polling = null;
    });
    return polling;
  }

  /**
   * @description Record an API failure: refused credentials, slow-down or
   * unreachable API.
   * @param {Error} err - The error.
   */
  function handleError(err) {
    if (err instanceof CredentialsError) {
      connection = err.reason === 'MISSING' ? 'unconfigured' : 'refused';
      connectionDetail = err.reason;
      pausedUntil = now() + REFUSED_RETRY_MS;
      nextPollAt = pausedUntil;
      logger.warn(`Voltalis refused the credentials (${err.reason})`);
    } else if (err instanceof RateLimitError) {
      backoff += 1;
      const pause = Math.min(MAX_PAUSE_MS, Math.max(err.retryAfterMs, intervalMs() * 2 ** backoff));
      connection = 'rate_limited';
      pausedUntil = now() + pause;
      nextPollAt = pausedUntil;
      logger.warn(`Voltalis limits the requests: next reading in ${Math.round(pause / 60000)} min`);
    } else {
      connection = 'error';
      connectionDetail = err instanceof ApiError ? `HTTP ${err.status}` : err.message?.slice(0, 80);
      logger.warn(`Voltalis reading failed: ${err.message}`);
    }
  }

  /** @description The clock: the due reading. */
  async function tick() {
    if (!gladys.connected) return;
    if (now() >= nextPollAt && now() >= pausedUntil) await poll('timer');
  }

  // --- Commands -----------------------------------------------------------------

  /**
   * @description Publish the appliances touched by a command.
   * @param {string[]} ids - Appliance ids.
   */
  async function afterCommand(ids) {
    await publishStates(ids.map(appliance).filter(Boolean));
    refreshWidgets();
  }

  /**
   * @description Check a command and show it at once (synchronous: a wrong
   * value throws before anything changes).
   * @param {object} model - The parsed appliance.
   * @param {object} change - `{ action, kind?, target?, hours? }`.
   * @returns {Function} `() => Promise<void>`: sends it to Voltalis.
   */
  function prepare(model, change) {
    if (!api.hasCredentials()) throw new Error('Voltalis is not configured');
    const command = normalizeChange(model, change);
    const shown = expectedOf(command);
    pending.set(model.id, {
      ...(pending.get(model.id) ?? {}),
      ...shown,
      until: now() + PENDING_MS,
    });
    expected.set(model.id, { ...shown, until: now() + EXPECTED_MS });
    return async () => {
      try {
        let settingId = cloud.get(model.id)?.settingId ?? model.settingId;
        if (!settingId) {
          settings = await api.getManualSettings();
          settingsAt = now();
          const entry = settings.find((item) => String(item?.idAppliance) === model.id);
          settingId = entry?.id === undefined || entry?.id === null ? null : String(entry.id);
        }
        if (!settingId) throw new Error(`Voltalis has no manual setting for ${nameOf(model)}`);
        await api.putManualSetting(settingId, buildSetting(model, command, now(), siteTimezone()));
        // One reading confirms the command.
        nextPollAt = Math.min(nextPollAt, now() + CONFIRM_DELAY_MS);
      } catch (err) {
        // The commanded values are dropped: the next reading shows the truth.
        pending.delete(model.id);
        expected.delete(model.id);
        if (err instanceof RateLimitError || err instanceof CredentialsError) handleError(err);
        await afterCommand([model.id]);
        throw err;
      }
    };
  }

  /**
   * @description The same change on several appliances.
   * @param {object[]} list - Parsed appliances.
   * @param {object} change - The change.
   * @returns {Promise<{count: number, failed: number}>} The outcome.
   */
  async function commandMany(list, change) {
    let count = 0;
    let failed = 0;
    for (const model of list) {
      try {
        const send = prepare(model, change);
        await afterCommand([model.id]);
        await send();
        count += 1;
      } catch (err) {
        // One appliance chosen: its error is the error of the action.
        if (list.length === 1) throw err;
        failed += 1;
        logger.warn(`Command for ${nameOf(model)} failed: ${err.message}`);
      }
    }
    return { count, failed };
  }

  /**
   * @description An appliance chosen in a scene action or a widget.
   * @param {string} externalId - The Gladys external id.
   * @returns {object} The parsed appliance.
   */
  function requireAppliance(externalId) {
    const model = byExternalId(externalId);
    if (!model || model.isSite) {
      throw new Error('Unknown Voltalis appliance: read the appliances again');
    }
    return model;
  }

  gladys.onSetValue(async (device, deviceFeature, value) => {
    const model = requireAppliance(device.external_id);
    const key = String(deviceFeature.external_id).slice(device.external_id.length + 1);
    let change;
    switch (key) {
      case 'target_temperature':
        change = { action: 'manual', kind: 'temperature', target: Number(value) };
        break;
      case 'mode': {
        const mode = Number(value);
        if (mode === THERMOSTAT_MODE.OFF) change = { action: 'off' };
        else if (mode === THERMOSTAT_MODE.HEATING) change = { action: 'manual' };
        else if (mode === THERMOSTAT_MODE.AUTO) change = { action: 'auto' };
        else throw new Error(`Mode ${value} is not available on Voltalis`);
        break;
      }
      case 'preset': {
        const preset = Number(value);
        if (preset === THERMOSTAT_PRESET.SCHEDULE) change = { action: 'auto' };
        else if (KIND_BY_PRESET[preset])
          change = { action: 'manual', kind: KIND_BY_PRESET[preset] };
        else throw new Error(`Preset ${value} is not available on Voltalis`);
        break;
      }
      default:
        throw new Error(`The feature ${key} is read-only`);
    }
    // The answer of Gladys is awaited 5 s: the command is shown at once and
    // sent without waiting for Voltalis.
    const send = prepare(model, change);
    await afterCommand([model.id]);
    send().catch((err) => logger.warn(`Command for ${nameOf(model)} failed: ${err.message}`));
  });

  // --- Scene actions ----------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.SET_MANUAL, async (fields = {}) => {
    const change = manualChange(fields);
    // Every appliance: only the ones that have this mode.
    const list = fields.device
      ? [requireAppliance(fields.device)]
      : appliances().filter((model) => !change.kind || model.kinds.includes(change.kind));
    return commandMany(list, change);
  });

  gladys.onSceneAction(SCENE_ACTIONS.BACK_TO_PROGRAM, async (fields = {}) => {
    const list = fields.device
      ? [requireAppliance(fields.device)]
      : appliances().filter((model) => model.manual);
    return commandMany(list, { action: 'auto' });
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_PROGRAM, async (fields = {}) => {
    if (!api.hasCredentials()) throw new Error('Voltalis is not configured');
    const enabled = parseOnOff(fields.state);
    const choice = String(fields.program ?? '').trim();
    let found;
    if (QUICK_SETTINGS[choice]) {
      const list = await api.getQuickSettings();
      found = list.find((item) => item?.name === QUICK_SETTINGS[choice]);
      if (!found) throw new Error(`Voltalis has no quick setting "${choice}" on this account`);
      quietUntil = now() + QUIET_MS;
      await api.setQuickSetting(found.id, enabled);
    } else {
      const wanted = String(fields.name ?? '')
        .trim()
        .toLowerCase();
      if (!wanted) throw new Error('Give the name of the program');
      const list = await api.getPrograms();
      found = list.find(
        (item) =>
          String(item?.name ?? '')
            .trim()
            .toLowerCase() === wanted,
      );
      if (!found) {
        const names = list.map((item) => item?.name).filter(Boolean);
        throw new Error(
          `No Voltalis program named "${wanted.slice(0, 40)}" (${names.join(', ').slice(0, 200) || 'none'})`,
        );
      }
      quietUntil = now() + QUIET_MS;
      await api.setProgram(found.id, found.name, enabled);
    }
    nextPollAt = Math.min(nextPollAt, now() + CONFIRM_DELAY_MS);
    return { program: String(found.name ?? choice).slice(0, 200), enabled };
  });

  gladys.onSceneAction(SCENE_ACTIONS.REFRESH, async () => {
    if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
      const ok = await poll('manual');
      if (!ok) throw new Error(`Voltalis reading failed (${connection})`);
    }
    const list = appliances();
    const summary = energySummary([state.hours(SITE_KEY)], now(), siteTimezone());
    return {
      appliances: list.length,
      manual: list.filter((model) => model.manual).length,
      power: site?.powerW ?? 0,
      energy_today: summary.todayKwh,
    };
  });

  // --- Configuration button ----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!api.hasCredentials()) return all('statusUnconfigured');
    const ok = await poll('manual');
    if (!ok) return statusMessage()?.message ?? all('statusError', { error: 'network' });
    if (cloud.size === 0) return all('statusNoAppliance');
    return all((lang) => {
      const list = appliances()
        .map((model) =>
          t('testAppliance', lang, {
            name: nameOf(model),
            type: t(`type_${model.type}`, lang),
            state: t(`state_${stateOf(model) ?? 'unknown'}`, lang),
            features: featuresOf(model).length,
          }),
        )
        .join(' · ');
      return t('testOk', lang, { count: cloud.size, list }).slice(0, 2000);
    });
  });

  // --- Widgets ------------------------------------------------------------------------

  /**
   * @description Remember the language of the last widget request (the
   * feature names follow it when the configuration says "automatic").
   * @param {string} lang - The language of the request.
   */
  function rememberLanguage(lang) {
    if (!isLanguage(lang) || lang === language) return;
    const before = textLanguage();
    language = lang;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
    if (textLanguage() !== before) publishDiscovery();
  }

  /**
   * @description The appliances chosen in the settings of a widget (all when
   * none is chosen).
   * @param {object} settings - The widget settings.
   * @returns {object[]} The appliances, sorted by name.
   */
  function chosenAppliances({ devices: wanted } = {}) {
    const ids = Array.isArray(wanted) ? wanted : [];
    const list = appliances().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const chosen = list.filter((model) => ids.includes(externalIdOf(model)));
    return chosen.length > 0 ? chosen : list;
  }

  gladys.onWidgetGet(WIDGETS.APPLIANCES, async (request = {}) => {
    const { settings: s = {}, language: lang, units } = request;
    rememberLanguage(lang);
    const list = chosenAppliances(s);
    return buildAppliancesWidget({
      appliances: list.slice(0, MAX_ITEMS).map((model) => ({
        model,
        name: nameOf(model),
        waiting: pending.has(model.id),
      })),
      hidden: Math.max(0, list.length - MAX_ITEMS),
      connection,
      lastSuccessAt,
      language: isLanguage(lang) ? lang : textLanguage(),
      units,
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.ENERGY, async ({ settings: s = {}, language: lang } = {}) => {
    rememberLanguage(lang);
    const ids = Array.isArray(s.devices) ? s.devices : [];
    const chosen = appliances().filter((model) => ids.includes(externalIdOf(model)));
    // Nothing chosen (or the home itself): the whole home.
    const whole = chosen.length === 0;
    return buildEnergyWidget({
      hours: whole ? [state.hours(SITE_KEY)] : chosen.map((model) => state.hours(model.id)),
      powerW: whole ? (site?.powerW ?? null) : null,
      appliances: chosen.length,
      connection,
      language: isLanguage(lang) ? lang : textLanguage(),
      timezone: siteTimezone(),
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.STATUS, async ({ language: lang } = {}) => {
    rememberLanguage(lang);
    const list = appliances();
    return buildStatusWidget({
      connection,
      manual: list.filter((model) => model.manual).length,
      total: list.length,
      faults: list.filter(isFault).length,
      requests: api.requestsLastHour(),
      lastSuccessAt,
      refreshMinutes: config.refreshMinutes,
      pausedUntil,
      language: isLanguage(lang) ? lang : textLanguage(),
      now: now(),
    });
  });

  /**
   * @description The buttons of the widgets.
   * @param {string} actionKey - The button.
   * @param {object} [_params] - Its params (none).
   * @param {object} [context] - `{ settings }` of the widget.
   * @returns {Promise<object>} The toast.
   */
  async function widgetAction(actionKey, _params = {}, { settings: s } = {}) {
    if (actionKey === WIDGET_ACTIONS.ALL_AUTO || actionKey === WIDGET_ACTIONS.ALL_FROST) {
      const frost = actionKey === WIDGET_ACTIONS.ALL_FROST;
      const list = chosenAppliances(s).filter((model) =>
        frost ? model.kinds.includes('frost') : model.manual,
      );
      if (list.length === 0) return all(frost ? 'toastNoAppliance' : 'toastAllAuto', { n: 0 });
      let outcome;
      try {
        outcome = await commandMany(
          list,
          frost ? { action: 'manual', kind: 'frost' } : { action: 'auto' },
        );
      } catch (err) {
        logger.warn(`Widget command failed: ${err.message}`);
        outcome = { count: 0, failed: list.length };
      }
      return all((lang) =>
        t(outcome.failed ? 'toastPartial' : frost ? 'toastAllFrost' : 'toastAllAuto', lang, {
          n: outcome.count,
          failed: outcome.failed,
        }),
      );
    }
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
        const ok = await poll('manual');
        if (!ok) {
          return all((lang) =>
            t('toastFailed', lang, { error: t(`connection_${connection}`, lang) }),
          );
        }
      }
      return all('toastRefreshed', { n: cloud.size });
    }
    throw new Error(`Unknown button ${actionKey}`);
  }
  gladys.onWidgetAction(WIDGETS.APPLIANCES, widgetAction);
  gladys.onWidgetAction(WIDGETS.ENERGY, widgetAction);
  gladys.onWidgetAction(WIDGETS.STATUS, widgetAction);

  // --- Devices and configuration --------------------------------------------------

  gladys.onScanRequest(async () => {
    await poll('scan');
    await publishDiscovery({ force: true });
  });

  gladys.onDeviceCreated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
  });

  /** @description Forget what was read with other credentials. */
  function resetReadings() {
    connection = 'unknown';
    connectionDetail = null;
    pausedUntil = 0;
    backoff = 0;
    lastStatus = null;
    settings = [];
    settingsAt = -Infinity;
    diagnostics = [];
    slowAt = -Infinity;
    energyAt = -Infinity;
  }

  gladys.onConfigUpdated(async (raw) => {
    const previous = { ...config, language: textLanguage() };
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    const credentialsChanged =
      config.email !== previous.email || config.password !== previous.password;
    if (credentialsChanged) resetReadings();
    if (textLanguage() !== previous.language) await publishDiscovery();
    if (credentialsChanged || config.refreshMinutes !== previous.refreshMinutes) {
      nextPollAt = 0;
      await tick();
    } else {
      refreshWidgets();
    }
  });

  gladys.on('connected', async () => {
    const raw = gladys.config ?? {};
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    lastStatus = null;
    lastDiscovery = null;
    nextPollAt = 0;
    running = poll('connected');
    await running;
    if (tickMs > 0 && timer === null) {
      timer = setInterval(() => {
        running = tick().catch((err) => logger.error('Tick failed', err));
      }, tickMs);
      timer.unref?.();
    }
  });

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stop();
    await running;
    state.save();
  });

  return {
    poll,
    tick,
    stop,
    state,
    appliances,
    site: () => site,
    connection: () => connection,
    pending,
  };
}

export {
  ACTIONS,
  SITE_KEY,
  TICK_MS,
  CONFIRM_DELAY_MS,
  PENDING_MS,
  MIN_MANUAL_GAP_MS,
  SLOW_MS,
  ENERGY_MS,
  REFUSED_RETRY_MS,
  MAX_PAUSE_MS,
  TRIGGERS,
  createApp,
};
