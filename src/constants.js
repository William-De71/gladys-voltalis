// -----------------------------------------------------------------------------
// Values of the Gladys core the SDK does not export (server/utils/constants.js
// of Gladys 5.3.0). They are stored in device states and in users' scenes, and
// the core never changes the meaning of an existing value.
// -----------------------------------------------------------------------------

// What a thermostat does (thermostat/mode).
const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, COOLING: 2, AUTO: 3 };

// Which temperature it aims for (thermostat/preset).
const THERMOSTAT_PRESET = { SCHEDULE: 0, FROST: 1, AWAY: 2, ECO: 3, NIGHT: 4, COMFORT: 5 };

export { THERMOSTAT_MODE, THERMOSTAT_PRESET };
