// -----------------------------------------------------------------------------
// Scene triggers and scene actions.
//
// Triggers fire on a TRANSITION between two readings of an appliance, never on
// a snapshot: the first reading only sets the baseline. The last values are
// kept in /data across restarts (state.js), so a change made while the
// integration restarted still fires once, and nothing fires twice.
// A change the integration itself asked for (a feature, a scene action, a
// widget button) never fires: a scene bound to it would loop. These triggers
// tell what the Voltalis program, the MyVoltalis app or Voltalis itself did.
// -----------------------------------------------------------------------------

import { stateOf } from './voltalis.js';

const TRIGGERS = {
  MODE_CHANGED: 'mode_changed',
  APPLIANCE_FAULT: 'appliance_fault',
  APPLIANCE_RECOVERED: 'appliance_recovered',
};

const SCENE_ACTIONS = {
  SET_MANUAL: 'set_manual',
  BACK_TO_PROGRAM: 'back_to_program',
  SET_PROGRAM: 'set_program',
  REFRESH: 'refresh',
};

// The values of the "mode" field of set_manual (off is not a Voltalis mode).
const MANUAL_MODES = ['comfort', 'eco', 'frost', 'temperature', 'normal', 'off'];
// The quick settings of Voltalis, by the value of the "program" field.
const QUICK_SETTINGS = {
  athome: 'quicksettings.athome',
  shortleave: 'quicksettings.shortleave',
  longleave: 'quicksettings.longleave',
};

/**
 * @description What is remembered of an appliance between two readings.
 * @param {object} model - A parsed appliance.
 * @returns {{ state: string|null, manual: boolean, health: string|null }} The snapshot.
 */
function snapshotOf(model) {
  return { state: stateOf(model), manual: model.manual, health: model.health };
}

/**
 * @description The scene events of a new reading of an appliance.
 * @param {object|null} previous - The snapshot of the previous reading (null:
 *   first reading, nothing fires).
 * @param {object} model - The parsed appliance.
 * @param {object} context - Context.
 * @param {string} context.device - The Gladys external id of the appliance.
 * @param {string} context.name - Its name.
 * @param {Function} context.isExpected - `(snapshot) => boolean`: the
 *   integration asked for this state.
 * @returns {{ events: Array<{key: string, data: object}>, snapshot: object }} The events.
 */
function detectEvents(previous, model, context) {
  const snapshot = snapshotOf(model);
  // An unknown health keeps the last known one: no reading, no transition.
  if (snapshot.health === null && previous?.health) snapshot.health = previous.health;
  const events = [];
  if (!previous) return { events, snapshot };
  const base = { device: context.device, device_name: context.name };

  if (
    previous.state &&
    snapshot.state &&
    (previous.state !== snapshot.state || previous.manual !== snapshot.manual) &&
    !context.isExpected(snapshot)
  ) {
    events.push({
      key: TRIGGERS.MODE_CHANGED,
      data: {
        ...base,
        mode: snapshot.state,
        previous_mode: previous.state,
        manual: snapshot.manual,
        target_temperature: snapshot.state === 'temperature' ? model.target : null,
      },
    });
  }
  if (previous.health && snapshot.health && previous.health !== snapshot.health) {
    // "test" is Voltalis checking the appliance: neither a fault nor a recovery.
    if (previous.health === 'ok' && !['ok', 'test'].includes(snapshot.health)) {
      events.push({ key: TRIGGERS.APPLIANCE_FAULT, data: { ...base, status: snapshot.health } });
    } else if (snapshot.health === 'ok' && previous.health !== 'test') {
      events.push({
        key: TRIGGERS.APPLIANCE_RECOVERED,
        data: { ...base, status: snapshot.health, previous_status: previous.health },
      });
    } else if (previous.health === 'test' && !['ok', 'test'].includes(snapshot.health)) {
      events.push({ key: TRIGGERS.APPLIANCE_FAULT, data: { ...base, status: snapshot.health } });
    }
  }
  return { events, snapshot };
}

/**
 * @description Read an "on / off" field of a scene action.
 * @param {unknown} raw - The resolved field value.
 * @returns {boolean} On.
 * @throws {RangeError} Neither on nor off.
 */
function parseOnOff(raw) {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (['on', 'true', '1'].includes(text)) return true;
  if (['off', 'false', '0'].includes(text)) return false;
  throw new RangeError(`"${String(raw).slice(0, 20)}" is neither on nor off`);
}

/**
 * @description The command of the set_manual action.
 * @param {object} fields - `{ mode, temperature?, hours? }`.
 * @returns {object} `{ action, kind?, target?, hours? }` for normalizeChange.
 * @throws {RangeError} An unknown mode.
 */
function manualChange(fields = {}) {
  const mode = String(fields.mode ?? '')
    .trim()
    .toLowerCase();
  if (!MANUAL_MODES.includes(mode)) throw new RangeError(`Unknown mode "${mode.slice(0, 20)}"`);
  const given = (value) => value !== undefined && value !== null && value !== '';
  const hours = given(fields.hours) ? { hours: fields.hours } : {};
  if (mode === 'off') return { action: 'off', ...hours };
  return {
    action: 'manual',
    kind: mode,
    ...(mode === 'temperature' && given(fields.temperature) ? { target: fields.temperature } : {}),
    ...hours,
  };
}

export {
  TRIGGERS,
  SCENE_ACTIONS,
  MANUAL_MODES,
  QUICK_SETTINGS,
  snapshotOf,
  detectEvents,
  parseOnOff,
  manualChange,
};
