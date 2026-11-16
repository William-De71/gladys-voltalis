// -----------------------------------------------------------------------------
// One Gladys device per Voltalis appliance, and one for the site (the home).
//
// Appliance (external id `…:appliance:<Voltalis id>`):
//
//   key                 category / type                   unit          writable
//   mode                thermostat / mode                 -             yes (off, heating = manual, auto = program)
//   preset              thermostat / preset               -             yes (frost, eco, comfort)
//   target_temperature  thermostat / target-temperature   celsius       yes (7-30, 0.5)
//   energy              energy-sensor / index             kilowatt-hour no
//
// `preset` exists when the appliance has one of these modes (a heater on its
// pilot wire), `target_temperature` when it has the "temperature" mode.
//
// Site (external id `…:site:<Voltalis id>`):
//
//   power               energy-sensor / power             watt          no
//   energy              energy-sensor / index             kilowatt-hour no
//
// The feature keys, categories, types, units and bounds are forever (the
// Discovery "Update" button compares them): see test/structure.test.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { THERMOSTAT_MODE, THERMOSTAT_PRESET } from './constants.js';
import { TEMPERATURE_RANGE, PRESET_KINDS } from './voltalis.js';
import { t } from './i18n.js';

const DEVICE_TYPES = { APPLIANCE: 'appliance', SITE: 'site' };

const writable = { read_only: false, has_feedback: true };
const readOnly = { read_only: true, has_feedback: false };

const PRESET_BY_KIND = {
  frost: THERMOSTAT_PRESET.FROST,
  eco: THERMOSTAT_PRESET.ECO,
  comfort: THERMOSTAT_PRESET.COMFORT,
};
const KIND_BY_PRESET = Object.fromEntries(
  Object.entries(PRESET_BY_KIND).map(([kind, preset]) => [preset, kind]),
);

const energyIndex = {
  key: 'energy',
  category: CATEGORIES.ENERGY_SENSOR,
  type: TYPES.ENERGY_SENSOR.INDEX,
  unit: UNITS.KILOWATT_HOUR,
  min: 0,
  max: 10000000,
  ...readOnly,
  present: () => true,
  value: (m) =>
    m.energyKwh === null || m.energyKwh === undefined
      ? null
      : Math.round(m.energyKwh * 1000) / 1000,
};

// Order = order of the features in Gladys. `present` decides from the parsed
// appliance; `value` gives the state (null: nothing to publish).
const APPLIANCE_FEATURES = [
  {
    key: 'mode',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.MODE,
    min: THERMOSTAT_MODE.OFF,
    max: THERMOSTAT_MODE.AUTO,
    ...writable,
    supported_options: [
      { value: THERMOSTAT_MODE.OFF, label: 'Off' },
      { value: THERMOSTAT_MODE.HEATING, label: 'Manual' },
      { value: THERMOSTAT_MODE.AUTO, label: 'Program' },
    ],
    present: () => true,
    value: (m) => {
      if (m.isOn === null) return null;
      if (m.isOn === false) return THERMOSTAT_MODE.OFF;
      return m.manual ? THERMOSTAT_MODE.HEATING : THERMOSTAT_MODE.AUTO;
    },
  },
  {
    key: 'preset',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.PRESET,
    min: THERMOSTAT_PRESET.SCHEDULE,
    max: THERMOSTAT_PRESET.COMFORT,
    ...writable,
    present: (m) => m.kinds.some((kind) => PRESET_KINDS.includes(kind)),
    // "temperature" has no preset: the last one stays shown.
    value: (m) => PRESET_BY_KIND[m.kind] ?? null,
  },
  {
    key: 'target_temperature',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    min: TEMPERATURE_RANGE.min,
    max: TEMPERATURE_RANGE.max,
    step: TEMPERATURE_RANGE.step,
    ...writable,
    present: (m) => m.kinds.includes('temperature'),
    value: (m) => m.target ?? m.defaultTarget,
  },
  energyIndex,
];

const SITE_FEATURES = [
  {
    key: 'power',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.POWER,
    unit: UNITS.WATT,
    min: 0,
    max: 40000,
    ...readOnly,
    present: () => true,
    value: (m) => (m.powerW === null || m.powerW === undefined ? null : m.powerW),
  },
  energyIndex,
];

const FEATURE_KEYS = [...new Set([...APPLIANCE_FEATURES, ...SITE_FEATURES].map((f) => f.key))];

/**
 * @description The ids of an appliance or of the site. The Voltalis id is a
 * number; it is URI-encoded anyway so a colon could never cut a feature id.
 * @param {object} gladys - The Gladys client (externalIds).
 * @param {object} model - A parsed appliance, or the site (`isSite`).
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, model) {
  return gladys.externalIds(
    model.isSite ? DEVICE_TYPES.SITE : DEVICE_TYPES.APPLIANCE,
    encodeURIComponent(model.id),
  );
}

/**
 * @description The features a model has.
 * @param {object} model - A parsed appliance, or the site.
 * @returns {object[]} The feature specs.
 */
function featuresOf(model) {
  return (model.isSite ? SITE_FEATURES : APPLIANCE_FEATURES).filter((f) => f.present(model));
}

/**
 * @description The name of a device.
 * @param {object} model - A parsed appliance, or the site.
 * @param {string} [language] - The language (the site has no name of its own).
 * @returns {string} The name.
 */
function deviceName(model, language = 'en') {
  if (!model.isSite) return model.name || `Voltalis ${model.id}`;
  const place = model.name || model.city;
  return place ? `${t('siteName', language)} (${place})` : t('siteName', language);
}

/**
 * @description The Discovery payload of an appliance or of the site.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed appliance, or the site.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device.
 */
function buildDevice(gladys, model, language = 'en') {
  const ids = idsOf(gladys, model);
  return {
    name: deviceName(model, language),
    external_id: ids.device,
    model: model.isSite ? 'Voltalis' : `Voltalis ${model.modulator || ''}`.trim(),
    should_poll: false,
    params: model.isSite
      ? [{ name: 'VOLTALIS_SITE', value: String(model.id) }]
      : [
          { name: 'VOLTALIS_TYPE', value: model.type },
          { name: 'VOLTALIS_MODES', value: model.kinds.join(',') || 'none' },
        ],
    features: featuresOf(model).map((feature) => {
      // eslint-disable-next-line no-unused-vars
      const { key, present, value, ...fields } = feature;
      return {
        ...fields,
        name: t(`feature_${key}`, language),
        external_id: ids.feature(key),
      };
    }),
  };
}

/**
 * @description The states of an appliance or of the site.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed appliance, or the site.
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 */
function buildStates(gladys, model) {
  const ids = idsOf(gladys, model);
  return featuresOf(model).flatMap((feature) => {
    const state = feature.value(model);
    return state === null || state === undefined
      ? []
      : [{ device_feature_external_id: ids.feature(feature.key), state }];
  });
}

/**
 * @description What Discovery would compare: a change republishes the list.
 * @param {object} gladys - The Gladys client.
 * @param {object[]} models - Parsed appliances and the site.
 * @param {string} language - Language of the feature names.
 * @returns {string} A signature.
 */
function discoverySignature(gladys, models, language) {
  return JSON.stringify(
    models.map((model) => {
      const device = buildDevice(gladys, model, language);
      return [device.external_id, device.name, device.features.map((f) => [f.external_id, f.name])];
    }),
  );
}

export {
  DEVICE_TYPES,
  APPLIANCE_FEATURES,
  SITE_FEATURES,
  FEATURE_KEYS,
  PRESET_BY_KIND,
  KIND_BY_PRESET,
  idsOf,
  featuresOf,
  deviceName,
  buildDevice,
  buildStates,
  discoverySignature,
};
