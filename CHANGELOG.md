# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- The appliances behind a Voltalis box through the service of the MyVoltalis app, with the e-mail and the password of the account; every appliance read in one request every 1, 2, 5 or 10 minutes, a "Test the connection" button.
- One device per appliance (heater, water heater, other load): mode off, manual or program; preset frost protection, eco or comfort; setpoint from 7 to 30 °C by half degrees when the appliance takes one; an energy index that Gladys turns into a consumption and a cost.
- One device for the home: power now and energy index, from what Voltalis measures.
- Commands shown at once, written as a manual setting of Voltalis and confirmed by the next reading.
- Scene triggers: the mode of an appliance changes (program or MyVoltalis app), an appliance goes in fault, an appliance is back to normal; each one filtered by appliance.
- Scene actions: set a manual mode for a duration or until further notice, go back to the program, switch a quick setting or one of your programs, read the appliances now.
- Dashboard widgets: the appliances (mode, program or manual, faults, "Back to program" and "Frost protection"), the energy of today, of yesterday and of the last 24 hours, and the connection to Voltalis.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
