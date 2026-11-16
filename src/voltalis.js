// -----------------------------------------------------------------------------
// The Voltalis data model: the answers of the API -> one parsed appliance per
// Voltalis appliance, the encoding of the manual settings, the energy
// accounting and the on-site clock.
//
// An appliance (a heater on its pilot wire, a water heater or another load on
// a relay) follows a PROGRAM (the default one, a user's program or a quick
// setting) unless a MANUAL SETTING overrides it: a mode (comfort, eco, frost
// protection, a temperature, or just "on"), on or off, until a date or until
// further notice. The API gives what the appliance does now in `programming`.
//
// Energy: Voltalis gives, per day, the energy of each hour, for the site and
// per appliance. The value of the running hour grows until the hour ends, so
// the integration remembers what it already counted of each hour and adds only
// the increase to a cumulated index, kept in /data.
// -----------------------------------------------------------------------------

const TEMPERATURE_RANGE = { min: 7, max: 30, step: 0.5 };
const HOUR_MS = 60 * 60 * 1000;
// More than this in one hour is a glitch, not a consumption (a 36 kVA supply).
const MAX_WH_PER_HOUR = 40000;
// Hours remembered as counted (two days and a margin).
const KEPT_COUNTED = 60;

// Voltalis mode -> the kind the integration works with. ECOV is the eco mode
// of the newer modulators: same meaning, another name to send back.
const KIND_BY_MODE = {
  ECO: 'eco',
  ECOV: 'eco',
  CONFORT: 'comfort',
  TEMPERATURE: 'temperature',
  HORS_GEL: 'frost',
  NORMAL: 'normal',
};
const MODE_BY_KIND = {
  eco: 'ECO',
  comfort: 'CONFORT',
  temperature: 'TEMPERATURE',
  frost: 'HORS_GEL',
  normal: 'NORMAL',
};
const KINDS = Object.keys(MODE_BY_KIND);
const PRESET_KINDS = ['frost', 'eco', 'comfort'];
const TYPE_BY_APPLIANCE = { HEATER: 'heater', WATER_HEATER: 'water_heater' };
const HEALTH_BY_STATUS = {
  OK: 'ok',
  NOK: 'nok',
  TEST_IN_PROGRESS: 'test',
  NO_CONSUMPTION: 'no_consumption',
  COMM_ERROR: 'comm_error',
};
// The temperature sent with a mode when Voltalis gives none.
const DEFAULT_TARGETS = { frost: 7, eco: 16, comfort: 20, temperature: 19, normal: 19 };

/**
 * @description A number of the API, or null.
 * @param {unknown} value - The raw value (number or numeric string).
 * @returns {number|null} The number.
 */
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description A setpoint rounded to the step.
 * @param {number} celsius - The setpoint.
 * @returns {number} °C, a multiple of 0.5.
 * @throws {RangeError} Not a number, or outside 7–30 °C.
 */
function encodeTarget(celsius) {
  const value = Number(celsius);
  if (celsius === null || celsius === '' || !Number.isFinite(value)) {
    throw new RangeError('The setpoint must be a number');
  }
  const rounded = Math.round(value / TEMPERATURE_RANGE.step) * TEMPERATURE_RANGE.step;
  if (rounded < TEMPERATURE_RANGE.min || rounded > TEMPERATURE_RANGE.max) {
    throw new RangeError(
      `The setpoint must be between ${TEMPERATURE_RANGE.min} and ${TEMPERATURE_RANGE.max} °C`,
    );
  }
  return rounded;
}

/**
 * @description Parse the appliances of a site.
 * @param {object[]} appliances - `GET managed-appliance`.
 * @param {object[]} [settings] - `GET manualsetting` (the id to write to).
 * @param {object[]} [diagnostics] - `GET autodiag`.
 * @returns {object[]} The appliances: `{ id, name, type, modulator, kinds,
 *   hasEcov, isOn, kind, manual, progType, progName, target, defaultTarget,
 *   endDate, untilFurtherNotice, settingId, health }`.
 */
function parseAppliances(appliances, settings = [], diagnostics = []) {
  const settingIds = new Map();
  for (const setting of Array.isArray(settings) ? settings : []) {
    if (setting?.id === undefined || setting?.id === null) continue;
    if (setting.idAppliance === undefined || setting.idAppliance === null) continue;
    settingIds.set(String(setting.idAppliance), String(setting.id));
  }
  const health = new Map();
  for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
    if (diagnostic?.csApplianceId === undefined || diagnostic?.csApplianceId === null) continue;
    const status = HEALTH_BY_STATUS[String(diagnostic.status ?? '').toUpperCase()];
    if (status) health.set(String(diagnostic.csApplianceId), status);
  }
  const result = [];
  for (const appliance of Array.isArray(appliances) ? appliances : []) {
    if (appliance?.id === undefined || appliance?.id === null) continue;
    const id = String(appliance.id);
    const modes = Array.isArray(appliance.availableModes) ? appliance.availableModes : [];
    const kinds = KINDS.filter((kind) => modes.some((mode) => KIND_BY_MODE[mode] === kind));
    const programming = appliance.programming ?? {};
    const progType = text(programming.progType).toUpperCase();
    const own = programming.idManualSetting;
    result.push({
      id,
      name: text(appliance.name),
      type: TYPE_BY_APPLIANCE[appliance.applianceType] ?? 'other',
      modulator: text(appliance.modulatorType),
      kinds,
      hasEcov: modes.includes('ECOV'),
      isOn: typeof programming.isOn === 'boolean' ? programming.isOn : null,
      kind: KIND_BY_MODE[programming.mode] ?? null,
      manual: progType === 'MANUAL',
      progType,
      progName: text(programming.progName),
      target: numberOrNull(programming.temperatureTarget),
      defaultTarget: numberOrNull(programming.defaultTemperature),
      endDate: text(programming.endDate) || null,
      untilFurtherNotice:
        typeof programming.untilFurtherNotice === 'boolean' ? programming.untilFurtherNotice : null,
      settingId: settingIds.get(id) ?? (own === undefined || own === null ? null : String(own)),
      health: health.get(id) ?? null,
    });
  }
  return result.sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * @description What an appliance does now, in one word.
 * @param {object} model - A parsed appliance.
 * @returns {string|null} off, comfort, eco, frost, temperature, normal (null: unknown).
 */
function stateOf(model) {
  if (model.isOn === false) return 'off';
  if (model.isOn === null) return null;
  return model.kind;
}

/**
 * @description The kind used when a command gives none: what the appliance
 * does, else eco, else the first mode it has.
 * @param {object} model - A parsed appliance.
 * @returns {string} A kind.
 */
function fallbackKind(model) {
  if (model.kind && (model.kinds.length === 0 || model.kinds.includes(model.kind))) {
    return model.kind;
  }
  if (model.kinds.includes('eco')) return 'eco';
  return model.kinds[0] ?? 'normal';
}

/**
 * @description The temperature sent with a kind.
 * @param {object} model - A parsed appliance.
 * @param {string} kind - The kind.
 * @param {number} [wanted] - A temperature asked for.
 * @returns {number} °C.
 */
function targetFor(model, kind, wanted) {
  if (wanted !== undefined && wanted !== null) return encodeTarget(wanted);
  if (kind === 'temperature' || kind === 'normal') {
    return model.target ?? model.defaultTarget ?? DEFAULT_TARGETS[kind];
  }
  return DEFAULT_TARGETS[kind] ?? DEFAULT_TARGETS.normal;
}

/**
 * @description Normalize a command into what the appliance will do.
 * @param {object} model - A parsed appliance.
 * @param {object} change - `{ action: 'manual'|'off'|'auto', kind?, target?, hours? }`.
 * @returns {{ action: string, kind: string, target: number, hours: number|null }}
 *   The command.
 * @throws {RangeError} A mode the appliance does not have, a wrong temperature
 *   or duration.
 */
function normalizeChange(model, change) {
  const action = change.action;
  if (!['manual', 'off', 'auto'].includes(action)) throw new RangeError('Unknown command');
  let kind = change.kind ?? (change.target !== undefined ? 'temperature' : fallbackKind(model));
  if (!KINDS.includes(kind)) throw new RangeError(`Unknown mode ${String(kind).slice(0, 20)}`);
  if (action === 'manual' && model.kinds.length > 0 && !model.kinds.includes(kind)) {
    throw new RangeError(`${model.name || model.id} has no ${kind} mode`);
  }
  if (action !== 'manual' && !model.kinds.includes(kind)) kind = fallbackKind(model);
  let hours = null;
  if (change.hours !== undefined && change.hours !== null && change.hours !== '') {
    hours = Number(change.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 30) {
      throw new RangeError('The duration must be between 0 and 720 hours');
    }
    if (hours === 0) hours = null;
  }
  return { action, kind, target: targetFor(model, kind, change.target), hours };
}

/**
 * @description The date and time on site, as Voltalis writes them.
 * @param {number} ms - The instant.
 * @param {string} timezone - IANA timezone of the site.
 * @returns {string} `YYYY-MM-DDTHH:mm:00`.
 */
function localStamp(ms, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(ms);
  } catch {
    return `${new Date(ms).toISOString().slice(0, 16)}:00`;
  }
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`;
}

/**
 * @description The day on site.
 * @param {number} ms - The instant.
 * @param {string} timezone - IANA timezone of the site.
 * @returns {string} `YYYY-MM-DD`.
 */
const localDay = (ms, timezone) => localStamp(ms, timezone).slice(0, 10);

/**
 * @description The body of `PUT manualsetting/{id}` for a command.
 * @param {object} model - A parsed appliance.
 * @param {object} command - A normalized command (normalizeChange).
 * @param {number} now - Now (ms).
 * @param {string} timezone - IANA timezone of the site.
 * @returns {object} The manual setting.
 */
function buildSetting(model, command, now, timezone) {
  const mode = command.kind === 'eco' && model.hasEcov ? 'ECOV' : MODE_BY_KIND[command.kind];
  const base = { idAppliance: Number(model.id), mode, temperatureTarget: command.target };
  if (command.action === 'auto') {
    // Back to the program: the manual setting is disabled and ends now.
    return {
      ...base,
      enabled: false,
      untilFurtherNotice: false,
      isOn: true,
      endDate: localStamp(now, timezone),
    };
  }
  return {
    ...base,
    enabled: true,
    untilFurtherNotice: command.hours === null,
    isOn: command.action !== 'off',
    endDate: command.hours === null ? null : localStamp(now + command.hours * HOUR_MS, timezone),
  };
}

/**
 * @description What the appliance shows once a command is applied.
 * @param {object} command - A normalized command.
 * @returns {object} `{ isOn, kind?, manual, target? }`.
 */
function expectedOf(command) {
  if (command.action === 'auto') return { manual: false };
  if (command.action === 'off') return { isOn: false, manual: true };
  return {
    isOn: true,
    manual: true,
    kind: command.kind,
    ...(command.kind === 'temperature' ? { target: command.target } : {}),
  };
}

/**
 * @description The key of the hour a step belongs to. Voltalis stamps an hour
 * with its END, in the time of the site: "2026-11-15T14:00:00" is the energy
 * used from 13:00 to 14:00.
 * @param {string} stamp - `stepTimestampOnSite`.
 * @returns {string|null} `YYYY-MM-DDTHH` (start of the hour, on site), or null.
 */
function hourKey(stamp) {
  const ms = Date.parse(`${String(stamp ?? '').slice(0, 19)}Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - HOUR_MS).toISOString().slice(0, 13);
}

/**
 * @description Add the hours of a day to an energy record.
 * @param {{kwh: number, counted: object}|null} record - The record (null: new).
 * @param {object[]} steps - `[{ stepTimestampOnSite, totalConsumptionInWh }]`.
 * @returns {{ record: object, deltaWh: number, byHour: Map<string, number> }}
 *   The new record, the energy added and its share per hour key.
 */
function accountSteps(record, steps) {
  const counted = { ...(record?.counted ?? {}) };
  const byHour = new Map();
  let deltaWh = 0;
  for (const step of Array.isArray(steps) ? steps : []) {
    const key = hourKey(step?.stepTimestampOnSite);
    const wh = numberOrNull(step?.totalConsumptionInWh);
    if (key === null || wh === null || wh < 0 || wh > MAX_WH_PER_HOUR) continue;
    const increase = wh - (counted[key] ?? 0);
    // A value that went down was corrected by Voltalis: the index never does.
    if (increase <= 0) continue;
    counted[key] = wh;
    deltaWh += increase;
    byHour.set(key, (byHour.get(key) ?? 0) + increase);
  }
  const keys = Object.keys(counted).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - KEPT_COUNTED))) delete counted[key];
  const kwh = Math.round(((record?.kwh ?? 0) + deltaWh / 1000) * 100000) / 100000;
  return { record: { kwh, counted }, deltaWh, byHour };
}

/**
 * @description The power of the site from its last 10-minute step.
 * @param {object} body - `{ aggregationStepInSeconds, consumptions }`.
 * @returns {number|null} Watts (null: unknown).
 */
function realtimePower(body) {
  const steps = Array.isArray(body?.consumptions) ? body.consumptions : [];
  const last = steps[steps.length - 1];
  const wh = numberOrNull(last?.totalConsumptionInWh);
  if (wh === null || wh < 0) return null;
  const seconds = numberOrNull(body?.aggregationStepInSeconds);
  const span = seconds && seconds > 0 ? seconds : 600;
  return Math.round((wh * 3600) / span);
}

export {
  TEMPERATURE_RANGE,
  HOUR_MS,
  MAX_WH_PER_HOUR,
  KINDS,
  PRESET_KINDS,
  DEFAULT_TARGETS,
  encodeTarget,
  parseAppliances,
  stateOf,
  fallbackKind,
  normalizeChange,
  localStamp,
  localDay,
  buildSetting,
  expectedOf,
  hourKey,
  accountSteps,
  realtimePower,
};
