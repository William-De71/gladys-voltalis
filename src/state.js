// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (mode
// 0600, the only writable place of the container):
//   - `snapshots`: per Voltalis appliance, the values the scene triggers
//     compare (what it does, manual or program, self-diagnosis);
//   - `energy`: per appliance and for the site (id `site`), the cumulated
//     index (kWh) and what was already counted of each hour (src/voltalis.js);
//   - `hours`: per appliance and for the site, the energy of each of the last
//     48 hours (Wh, keyed by the hour on site, `YYYY-MM-DDTHH`), for the
//     energy widget.
// A missing or unreadable file is an empty state: nothing fires on the first
// reading, the index starts from the hours of today (Gladys only uses its
// increases).
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
// Hours of history kept per appliance.
const KEPT_HOURS = 49;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * @description Create the store.
 * @param {object} [options] - Options.
 * @param {string|null} [options.path] - The file (null: memory only, tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The store.
 */
function createState({ path = DEFAULT_PATH, logger = null } = {}) {
  let data = { snapshots: {}, energy: {}, hours: {} };
  let dirty = false;

  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      data = {
        snapshots: isObject(parsed?.snapshots) ? parsed.snapshots : {},
        energy: isObject(parsed?.energy) ? parsed.energy : {},
        hours: isObject(parsed?.hours) ? parsed.hours : {},
      };
    } catch (err) {
      if (err.code !== 'ENOENT') logger?.warn(`Unreadable ${path}, starting afresh`);
    }
  }

  return {
    snapshot: (id) => data.snapshots[id] ?? null,
    setSnapshot(id, snapshot) {
      if (JSON.stringify(data.snapshots[id]) === JSON.stringify(snapshot)) return;
      data.snapshots[id] = snapshot;
      dirty = true;
    },
    /**
     * @param {string} id - The appliance id, or `site`.
     * @returns {{kwh: number, counted: object}|null} Its energy record.
     */
    energy: (id) => data.energy[id] ?? null,
    setEnergy(id, record) {
      if (JSON.stringify(data.energy[id]) === JSON.stringify(record)) return;
      data.energy[id] = record;
      dirty = true;
    },
    /**
     * @description Add energy to the hours of an appliance, and drop the old hours.
     * @param {string} id - The appliance id, or `site`.
     * @param {Map<string, number>} byHour - Hour key -> Wh.
     */
    addHours(id, byHour) {
      const hours = { ...(data.hours[id] ?? {}) };
      for (const [hour, wh] of byHour) {
        hours[hour] = Math.round(((hours[hour] ?? 0) + wh) * 10) / 10;
      }
      const keys = Object.keys(hours).sort();
      for (const hour of keys.slice(0, Math.max(0, keys.length - KEPT_HOURS))) delete hours[hour];
      if (JSON.stringify(hours) === JSON.stringify(data.hours[id] ?? {})) return;
      data.hours[id] = hours;
      dirty = true;
    },
    /**
     * @param {string} id - The appliance id, or `site`.
     * @returns {object} Hour key -> Wh.
     */
    hours: (id) => data.hours[id] ?? {},
    /**
     * @description Drop the appliances Voltalis no longer lists.
     * @param {string[]} ids - The ids to keep.
     */
    keep(ids) {
      const wanted = new Set(ids);
      for (const bucket of [data.snapshots, data.energy, data.hours]) {
        for (const id of Object.keys(bucket)) {
          if (!wanted.has(id)) {
            delete bucket[id];
            dirty = true;
          }
        }
      }
    },
    /** @description Write the file when something changed (atomically). */
    save() {
      if (!dirty || !path) return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
        renameSync(temporary, path);
        dirty = false;
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
}

export { DEFAULT_PATH, KEPT_HOURS, createState };
