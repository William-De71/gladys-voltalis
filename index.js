// -----------------------------------------------------------------------------
// Entry point of the Voltalis external integration.
//
// The appliances behind a Voltalis box (heaters on their pilot wire, water
// heater, other loads), through the API of the MyVoltalis app and the e-mail
// and password of the account:
//   - devices: one per appliance (mode off / manual / program, preset frost
//     protection / eco / comfort, setpoint when the appliance takes one, energy
//     index) and one for the home (power, energy index), offered on the
//     Discovery screen (see src/device.js);
//   - scene triggers: the mode of an appliance changes (program or app), an
//     appliance goes in fault, or recovers;
//   - scene actions: set a manual mode (for a duration or until further
//     notice), go back to the program, switch a program or a quick setting,
//     read now;
//   - dashboard widgets: the appliances (with "Back to program" and "Frost
//     protection"), the energy of the last 24 hours, the connection.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the language guess, the days as a fallback)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createVoltalisApi } from './src/voltalis-api.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys, { api: createVoltalisApi({ userAgent: `gladys-voltalis/${version}` }) });

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Voltalis integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
