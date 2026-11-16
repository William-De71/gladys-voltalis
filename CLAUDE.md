# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the Voltalis box: a Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The appliances come from the service behind the
MyVoltalis app (`https://api.myvoltalis.com`), with the e-mail and the password
of the account. Voltalis does **not document** this API: the routes are the
ones the community integrations for Home Assistant use (see NOTICE), and it was
never tried on a real box. Transport: cloud.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run coverage                          # tests with the coverage of node --test
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the clock
                        (tick), the readings (appliances, then the slower
                        diagnosis / power / energy), the commands, the
                        commanded values shown until confirmed, the errors
                        (refused credentials, 429), the status
src/voltalis-api.js     the HTTP client: session (login + default site), one
                        new session on a 401, requests spaced, error classes;
                        never logs a secret
src/voltalis.js         the Voltalis data model: appliances -> parsed models,
                        commands -> manual settings, hours -> energy index,
                        the clock of the site
src/device.js           one Gladys device per appliance and one for the home,
                        their features and states
src/constants.js        Gladys core values the SDK does not export (thermostat
                        mode / preset)
src/events.js           scene trigger detection (transitions), action keys and
                        the parsing of the action fields
src/widgets.js          appliances, energy and status dashboard widgets
src/state.js            /data/state.json: trigger snapshots, energy indexes,
                        energy of the last 48 hours
src/config.js           configuration (e-mail, password, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: the device
  external ids `ext:<selector>:appliance:<Voltalis appliance id>` and
  `ext:<selector>:site:<Voltalis site id>` (URI-encoded, never a name), the
  feature keys (`mode`, `preset`, `target_temperature`, `energy`, `power`),
  feature `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema`, `actions`, the select values (`1`, `2`, `5`, `10`,
  `auto`…), the widgets and their settings, the widget button actions
  (`all_auto`, `all_frost`, `refresh`), the scene triggers (fields, options,
  variables) and scene actions (fields, options, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **The API is undocumented.** Never invent a route or a field: the ones used
  are listed at the top of `src/voltalis-api.js` and come from the projects in
  NOTICE. Every answer is parsed defensively (a missing field is `null`, a
  wrong shape an empty list), and a secondary reading that fails (diagnosis,
  power, energy, manual settings) never fails the reading of the appliances.
- **One device per APPLIANCE, one for the HOME.** The features follow
  `availableModes`: `preset` when the appliance has eco / comfort / frost
  protection, `target_temperature` when it has the temperature mode; a relay
  has `mode` and `energy` only. Only the default site of the account is read.
- **Category / type pairs** come from the SDK constants and the core 5.3.0:
  `thermostat` / `mode` (OFF = manual stop, HEATING = manual setting, AUTO =
  program), `preset` (FROST, ECO, COMFORT; SCHEDULE written = back to the
  program), `target-temperature`; `energy-sensor` / `power` (watt) and `index`
  (kilowatt-hour, the one Gladys turns into a consumption and a cost).
- **Writes are manual settings**: `PUT manualsetting/{id}` with `enabled`,
  `isOn`, `mode`, `temperatureTarget`, `untilFurtherNotice` and `endDate` (the
  time ON SITE, `YYYY-MM-DDTHH:mm:00`, no offset). Back to the program is
  `enabled: false` ending now. `ECOV` is sent instead of `ECO` when the
  appliance lists it. Setpoints: 7 to 30 °C by 0.5.
- **Energy**: Voltalis gives the energy of each hour, stamped with the END of
  the hour in the time of the site; the running hour grows. `accountSteps`
  adds only the increase of each hour, never lets the index go down, ignores
  more than 40 kWh in one hour, and the record lives in /data. Never publish
  an hourly value as an index.
- **`should_poll` stays false**: one `GET managed-appliance` reads every
  appliance on the integration's own clock (1, 2, 5 or 10 minutes); the
  diagnosis and the power every 10 minutes, the hours of the day every 15.
  Never add a request per appliance.
- **A command never waits in `onSetValue`** (5 s ack): it is checked, shown at
  once and sent without awaiting; one reading follows 5 s later. The commanded
  values win over the cloud for 3 minutes at most. A 429 slows the readings
  down (the interval doubles, up to 30 minutes); refused credentials are tried
  again every 30 minutes or as soon as they change.
- **The password** is a `secret`: never logged, never in /data, never in a
  scene variable nor an error message; neither is the token nor the e-mail.
- **Scene events**: one per transition between two readings of an appliance
  the user added (baseline at the first reading, kept in /data across
  restarts); never as the consequence of a command of the integration
  (10 minutes), nor of a program switched by the `set_program` action
  (3 minutes).
- **Gladys does not pass DEBUG / LOG_LEVEL to the container**: never tell a
  store user to set them; "Test the connection" is the diagnostic button.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **No copied code.** The protocol facts come from three MIT projects for
  Home Assistant, credited in NOTICE; no code is copied from them.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `>=5.3.0` for `keywords` and `countries` (`["FR"]`: Voltalis only
  equips homes in France); no permission. Transport: `["cloud"]`.
- **CI smoke test.** `ci.yml` counts the features of a heater (4), of a relay
  (2) and of the home (2) in the Docker image: update it with the features.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
