// -----------------------------------------------------------------------------
// Dashboard widgets, built from the last reading (no request to Voltalis).
//
//   - appliances: every appliance (or the ones chosen in the widget settings)
//                 as a list — what it does (comfort, eco, frost protection, a
//                 temperature, on, off), who decided (the program or a manual
//                 setting, and until when), a badge (manual, fault, command
//                 waiting), the details on tap — and the buttons "Back to
//                 program" and "Frost protection" for these appliances, and
//                 "Refresh";
//   - energy:     the energy of today and yesterday, the power now, and a bar
//                 chart of the last 24 hours, for the whole home or the chosen
//                 appliances (from the hours Voltalis measures);
//   - status:     the connection to Voltalis, the appliances in manual mode,
//                 the faults, the requests of the last hour, and "Refresh".
//
// The content stays within the budget of the core (8 components, 1 focal,
// 2 texts, 1 status, 4 buttons) and every text exists in the four languages
// (test/widgets.test.js runs validateWidgetContent on them).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { HOUR_MS, localStamp, localDay, stateOf } from './voltalis.js';
import { t, ago, formatNumber } from './i18n.js';

const WIDGETS = { APPLIANCES: 'appliances', ENERGY: 'energy', STATUS: 'status' };
const WIDGET_ACTIONS = { ALL_AUTO: 'all_auto', ALL_FROST: 'all_frost', REFRESH: 'refresh' };
// A list card holds 8 rows at most.
const MAX_ITEMS = 8;
const TTL_SECONDS = 60;
const CHART_HOURS = 24;

const isFahrenheit = (units) => units === 'us' || units === 'imperial';

/**
 * @description A temperature in the unit of the user: "20.5 °C", "68.9 °F".
 * @param {number|null} celsius - The temperature.
 * @param {string} units - metric or us.
 * @param {string} language - The language.
 * @returns {string} The text ("—" when unknown).
 */
function formatTemperature(celsius, units, language) {
  if (celsius === null || celsius === undefined) return '—';
  if (isFahrenheit(units)) return `${formatNumber((celsius * 9) / 5 + 32, language)} °F`;
  return `${formatNumber(celsius, language)} °C`;
}

/**
 * @description The energy of today, of yesterday and of each of the last 24
 * hours, summed over appliances. The hours are keyed by the time on site.
 * @param {object[]} hoursList - Per appliance, hour key (`YYYY-MM-DDTHH`) -> Wh.
 * @param {number} now - Now (ms).
 * @param {string} timezone - IANA timezone of the site.
 * @returns {{ todayKwh: number, yesterdayKwh: number, points: Array<{t: string, v: number}> }}
 *   The summary (kWh rounded to 0.01 / 0.001).
 */
function energySummary(hoursList, now, timezone) {
  const total = new Map();
  for (const hours of hoursList) {
    for (const [hour, wh] of Object.entries(hours ?? {})) {
      total.set(hour, (total.get(hour) ?? 0) + Number(wh));
    }
  }
  const today = localDay(now, timezone);
  const yesterday = localDay(now - 24 * HOUR_MS, timezone);
  let todayWh = 0;
  let yesterdayWh = 0;
  for (const [hour, wh] of total) {
    if (hour.startsWith(today)) todayWh += wh;
    else if (hour.startsWith(yesterday)) yesterdayWh += wh;
  }
  // The clock of the site, read as if it were UTC, walks the hour keys; the
  // real instants label the chart.
  const siteHour = Date.parse(`${localStamp(now, timezone).slice(0, 13)}:00:00Z`);
  const realHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const points = [];
  for (let back = CHART_HOURS - 1; back >= 0; back -= 1) {
    const key = new Date(siteHour - back * HOUR_MS).toISOString().slice(0, 13);
    points.push({
      t: new Date(realHour - back * HOUR_MS).toISOString(),
      v: Math.round(total.get(key) ?? 0) / 1000,
    });
  }
  return {
    todayKwh: Math.round(todayWh / 10) / 100,
    yesterdayKwh: Math.round(yesterdayWh / 10) / 100,
    points,
  };
}

/**
 * @description What an appliance does: "Comfort", "19.5 °C", "Off".
 * @param {object} model - A parsed appliance.
 * @param {string} units - metric or us.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function stateLabel(model, units, language) {
  const state = stateOf(model);
  if (state === 'temperature' && model.target !== null) {
    return formatTemperature(model.target, units, language);
  }
  return t(`state_${state ?? 'unknown'}`, language);
}

/**
 * @description Who decided what the appliance does: the program, or a manual
 * setting and its end.
 * @param {object} model - A parsed appliance.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function sourceLabel(model, language) {
  if (model.manual) {
    // "2026-11-15T18:30:00" on site -> "18:30" (or the day when it is not today).
    const end = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(model.endDate ?? '');
    if (end && model.untilFurtherNotice !== true) {
      return t('sourceManualUntil', language, { end: `${end[3]}/${end[2]} ${end[4]}` });
    }
    return t('sourceManual', language);
  }
  const name = model.progName && !/^(program|quicksettings)\./.test(model.progName);
  return name
    ? t('sourceProgramNamed', language, { name: model.progName.slice(0, 30) })
    : t('sourceProgram', language);
}

const isFault = (model) => Boolean(model.health) && !['ok', 'test'].includes(model.health);

/**
 * @description The badge of an appliance.
 * @param {object} model - A parsed appliance.
 * @param {boolean} waiting - A command is not confirmed yet.
 * @param {string} language - The language.
 * @returns {{text: string, color: string}|undefined} The badge.
 */
function badgeOf(model, waiting, language) {
  if (waiting) return { text: t('badgeWaiting', language), color: WIDGET_COLORS.WARNING };
  if (isFault(model)) return { text: t('badgeFault', language), color: WIDGET_COLORS.DANGER };
  if (model.manual) return { text: t('badgeManual', language), color: WIDGET_COLORS.INFO };
  return undefined;
}

/**
 * @description The details of an appliance, shown when its row is tapped.
 * @param {object} model - A parsed appliance.
 * @param {object} options - Options.
 * @returns {string} One fact per line.
 */
function detailsOf(model, { units, language }) {
  const lines = [];
  // French typography: a (non-breaking) space before the colon.
  const separator = language === 'fr' ? ' : ' : ': ';
  const line = (key, value) => lines.push(`${t(key, language)}${separator}${value}`);
  line('detailType', t(`type_${model.type}`, language));
  line('detailState', t(`state_${stateOf(model) ?? 'unknown'}`, language));
  line('detailSource', sourceLabel(model, language));
  if (model.kinds.includes('temperature')) {
    line('detailSetpoint', formatTemperature(model.target ?? model.defaultTarget, units, language));
  }
  if (model.health) line('detailHealth', t(`health_${model.health}`, language));
  if (model.energyKwh !== null && model.energyKwh !== undefined) {
    line('detailIndex', `${formatNumber(model.energyKwh, language)} kWh`);
  }
  return lines.join('\n');
}

/**
 * @description The appliances widget.
 * @param {object} options - Options.
 * @param {Array<{model: object, name: string, waiting: boolean}>} options.appliances - The appliances to show.
 * @param {number} options.hidden - Appliances left out (more than 8).
 * @param {string} options.connection - ok, unconfigured, refused, rate_limited, error, unknown.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} options.language - The language.
 * @param {string} [options.units] - metric or us.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildAppliancesWidget({
  appliances,
  hidden = 0,
  connection,
  lastSuccessAt,
  language,
  units = 'metric',
  now,
}) {
  const components = [];
  if (lastSuccessAt) {
    components.push({
      type: 'text',
      variant: 'caption',
      text:
        hidden > 0
          ? t('captionUpdatedHidden', language, {
              ago: ago(lastSuccessAt, now, language),
              n: hidden,
            })
          : t('captionUpdated', language, { ago: ago(lastSuccessAt, now, language) }),
    });
  }
  if (appliances.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: appliances.slice(0, MAX_ITEMS).map(({ model, name, waiting }) => {
        const badge = badgeOf(model, waiting, language);
        return {
          title: name.slice(0, 60),
          subtitle: `${stateLabel(model, units, language)} · ${sourceLabel(model, language)}`,
          ...(badge ? { badge } : {}),
          description: detailsOf(model, { units, language }),
        };
      }),
    });
    components.push(
      {
        type: 'button',
        label: t('buttonAllAuto', language),
        icon: 'calendar',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.ALL_AUTO, confirm: true },
      },
      {
        type: 'button',
        label: t('buttonAllFrost', language),
        icon: 'moon',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.ALL_FROST, confirm: true },
      },
    );
  } else {
    const key = connection === 'ok' ? 'emptyAppliances' : `connection_${connection}_hint`;
    components.push({ type: 'text', variant: 'body', text: t(key, language) });
  }
  components.push({
    type: 'button',
    label: t('buttonRefresh', language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The energy widget.
 * @param {object} options - Options.
 * @param {object[]} options.hours - Per appliance (or the site alone), hour key -> Wh.
 * @param {number|null} options.powerW - The power of the home now (null: not shown).
 * @param {number} options.appliances - Appliances counted (0: the whole home).
 * @param {string} options.connection - The connection state.
 * @param {string} options.language - The language.
 * @param {string} options.timezone - IANA timezone of the site.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildEnergyWidget({ hours, powerW, appliances, connection, language, timezone, now }) {
  if (!hours.some((entry) => Object.keys(entry ?? {}).length > 0)) {
    const key = connection === 'ok' ? 'emptyEnergy' : `connection_${connection}_hint`;
    return {
      ttl_seconds: TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: t(key, language) }],
    };
  }
  const summary = energySummary(hours, now, timezone);
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'value',
        value: summary.todayKwh,
        unit: 'kWh',
        label: t('tileToday', language),
        icon: 'zap',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        value: summary.yesterdayKwh,
        unit: 'kWh',
        label: t('tileYesterday', language),
        icon: 'calendar',
      },
      ...(powerW === null || powerW === undefined
        ? []
        : [
            {
              type: 'value',
              value: Math.round(powerW),
              unit: 'W',
              label: t('tilePower', language),
              icon: 'activity',
              color: powerW > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
            },
          ]),
      {
        type: 'chart',
        chart_type: 'bar',
        title: t('chartTitle', language),
        unit: 'kWh',
        series: [{ name: t('chartSeries', language), points: summary.points }],
      },
      {
        type: 'text',
        variant: 'caption',
        text:
          appliances > 0
            ? t('energyCaption', language, { n: appliances })
            : t('energyCaptionSite', language),
      },
    ],
  };
}

const CONNECTION_COLOR = {
  ok: WIDGET_COLORS.SUCCESS,
  unconfigured: WIDGET_COLORS.WARNING,
  refused: WIDGET_COLORS.DANGER,
  rate_limited: WIDGET_COLORS.WARNING,
  error: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

/**
 * @description The connection widget.
 * @param {object} options - Options.
 * @param {string} options.connection - ok, unconfigured, refused, rate_limited, error, unknown.
 * @param {number} options.manual - Appliances in manual mode.
 * @param {number} options.total - Appliances.
 * @param {number} options.faults - Appliances whose self-diagnosis is not OK.
 * @param {number} options.requests - Requests of the last hour.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {number} options.refreshMinutes - The reading interval.
 * @param {number} options.pausedUntil - End of a slow-down (ms, 0: none).
 * @param {string} options.language - The language.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildStatusWidget({
  connection,
  manual,
  total,
  faults = 0,
  requests,
  lastSuccessAt,
  refreshMinutes,
  pausedUntil = 0,
  language,
  now,
}) {
  const components = [
    {
      type: 'value',
      value: `${manual}/${total}`,
      label: t('tileManual', language),
      icon: 'sliders',
      color: manual > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: requests,
      label: t('tileRequests', language),
      icon: 'activity',
    },
  ];
  const rows = [
    {
      label: t('rowConnection', language),
      value: t(`connection_${connection}`, language),
      color: CONNECTION_COLOR[connection] ?? WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('rowLastReading', language),
      value: ago(lastSuccessAt, now, language),
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('rowInterval', language),
      value: t('everyMinutes', language, { n: refreshMinutes }),
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (faults > 0) {
    rows.push({
      label: t('rowFaults', language),
      value: String(faults),
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (pausedUntil > now) {
    rows.push({
      label: t('rowPaused', language),
      value: t('inMinutes', language, { n: Math.ceil((pausedUntil - now) / 60000) }),
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items: rows });
  if (connection !== 'ok' && connection !== 'unknown') {
    components.push({
      type: 'text',
      variant: 'body',
      text: t(`connection_${connection}_hint`, language),
    });
  }
  components.push({
    type: 'button',
    label: t('buttonRefresh', language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  MAX_ITEMS,
  CHART_HOURS,
  formatTemperature,
  energySummary,
  stateLabel,
  sourceLabel,
  isFault,
  badgeOf,
  detailsOf,
  buildAppliancesWidget,
  buildEnergyWidget,
  buildStatusWidget,
};
