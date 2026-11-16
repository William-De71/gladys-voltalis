// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on the made-up appliances of a home, on a fixed morning
// (Sunday 15 November 2026, 8:42 in Paris): a living room in comfort by the
// program, a bedroom in manual eco until the evening, a bathroom at a
// temperature with a command being sent, an office in frost protection whose
// self-diagnosis fails, a water heater switched off by the program; the
// energy of the last hours (more at night for the water heater, and in the
// morning), and the connection to Voltalis.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildAppliancesWidget, buildEnergyWidget, buildStatusWidget } =
  await load('src/widgets.js');
const { parseAppliances, HOUR_MS } = await load('src/voltalis.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-11-15T07:42:00Z');
const TIMEZONE = 'Europe/Paris';
const HEATER = ['ECO', 'CONFORT', 'TEMPERATURE', 'HORS_GEL'];
const appliance = (id, type, modes, programming) => ({
  id,
  name: '',
  applianceType: type,
  modulatorType: type === 'HEATER' ? 'VX_WIRE' : 'VX_RELAY',
  availableModes: modes,
  programming: { isOn: true, temperatureTarget: 19, defaultTemperature: 19, ...programming },
});
const APPLIANCES = [
  appliance(1, 'HEATER', HEATER, { progType: 'USER', progName: 'Semaine', mode: 'CONFORT' }),
  appliance(2, 'HEATER', HEATER, {
    progType: 'MANUAL',
    mode: 'ECO',
    untilFurtherNotice: false,
    endDate: '2026-11-15T18:30:00',
  }),
  appliance(3, 'HEATER', HEATER, {
    progType: 'MANUAL',
    mode: 'TEMPERATURE',
    temperatureTarget: 21.5,
    untilFurtherNotice: true,
  }),
  appliance(4, 'HEATER', HEATER, { progType: 'USER', progName: 'Semaine', mode: 'HORS_GEL' }),
  appliance(5, 'WATER_HEATER', ['NORMAL'], {
    progType: 'USER',
    progName: 'Semaine',
    mode: 'NORMAL',
    isOn: false,
  }),
];
const DIAGNOSTICS = [1, 2, 3, 4, 5].map((id) => ({
  csApplianceId: id,
  status: id === 4 ? 'COMM_ERROR' : 'OK',
}));
const NAMES = {
  en: ['Living room', 'Bedroom', 'Bathroom', 'Office', 'Water heater'],
  fr: ['Salon', 'Chambre', 'Salle de bains', 'Bureau', 'Chauffe-eau'],
  de: ['Wohnzimmer', 'Schlafzimmer', 'Badezimmer', 'Büro', 'Warmwasser'],
  es: ['Salón', 'Dormitorio', 'Baño', 'Despacho', 'Calentador'],
};
const WAITING = new Set(['3']);

// 30 hours of energy for the whole home, keyed by the hour in Paris (UTC+1):
// the water heater at night, a morning peak, an evening one.
const hours = {};
for (let i = 0; i < 30; i += 1) {
  const site = new Date(NOW + HOUR_MS - i * HOUR_MS);
  const local = site.getUTCHours();
  const wh = local < 6 ? 2400 : local < 9 ? 3100 : local < 17 ? 1300 : local < 22 ? 2600 : 1700;
  hours[site.toISOString().slice(0, 13)] =
    i === 0 ? Math.round((wh * 42) / 60) : wh + ((i * 137) % 300);
}

const contents = {};
for (const language of LANGUAGES) {
  const appliances = parseAppliances(APPLIANCES, [], DIAGNOSTICS).map((parsed, i) => {
    const model = { ...parsed, name: NAMES[language][i], energyKwh: 812.4 + i * 97.3 };
    return { model, name: model.name, waiting: WAITING.has(parsed.id) };
  });
  contents[language] = {
    appliances: buildAppliancesWidget({
      appliances,
      connection: 'ok',
      lastSuccessAt: NOW - 60 * 1000,
      language,
      units: 'metric',
      now: NOW,
    }),
    energy: buildEnergyWidget({
      hours: [hours],
      powerW: 2230,
      appliances: 0,
      connection: 'ok',
      language,
      timezone: TIMEZONE,
      now: NOW,
    }),
    status: buildStatusWidget({
      connection: 'ok',
      manual: 2,
      total: 5,
      faults: 1,
      requests: 41,
      lastSuccessAt: NOW - 60 * 1000,
      refreshMinutes: 2,
      language,
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
