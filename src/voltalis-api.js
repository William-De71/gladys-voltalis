// -----------------------------------------------------------------------------
// Client of the Voltalis API, the one behind the MyVoltalis app and web site
// (https://api.myvoltalis.com). Voltalis publishes no documentation: the
// routes and fields below are the ones the community integrations for Home
// Assistant use (see NOTICE), and the error answers were checked against the
// real API.
//
//   POST   /auth/login                              { login, password } -> { token }
//   GET    /api/account/me                          the account, its default site
//   GET    /api/site/{site}/managed-appliance       appliances and what they do
//   GET    /api/site/{site}/manualsetting           one manual setting per appliance
//   PUT    /api/site/{site}/manualsetting/{id}      change it
//   GET    /api/site/{site}/autodiag                self-diagnosis per appliance
//   GET    /api/site/{site}/consumption/realtime    10-minute steps of the site
//   GET    /api/site/{site}/consumption/day/{day}/full-data   hours of a day
//   GET    /api/site/{site}/quicksettings           the three quick settings
//   PUT    /api/site/{site}/quicksettings/{id}/enable
//   GET    /api/site/{site}/programming/program     the user's programs
//   PUT    /api/site/{site}/programming/program/{id}
//
// - Wrong e-mail or password: 401 with
//   `[{ "description": "backend.error.subscriber.badcredentials" }]`.
// - A missing or expired token: 401 on any other route. The client logs in
//   again once, then gives up.
// - Requests go one at a time, a short pause apart: the API is not public,
//   the integration stays as discreet as the app.
// - The password and the token are never logged nor put in an error message.
// -----------------------------------------------------------------------------

const API_URL = 'https://api.myvoltalis.com';
const LOGIN_PATH = '/auth/login';
const ME_PATH = '/api/account/me';
// Two requests to the API are this far apart at least.
const MIN_INTERVAL_MS = 500;
const TIMEOUT_MS = 20 * 1000;
// A 429 asks to wait this long before the next request.
const RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The e-mail / password pair is refused. */
class CredentialsError extends Error {
  /**
   * @param {string} reason - MISSING, BAD_CREDENTIALS, UNAUTHORIZED…
   * @param {number|null} status - HTTP status.
   */
  constructor(reason, status = null) {
    super(`Voltalis refused the credentials (${reason})`);
    this.name = 'CredentialsError';
    this.reason = reason;
    this.status = status;
  }
}

/** Voltalis asks to slow down (429). */
class RateLimitError extends Error {
  /** @param {number} retryAfterMs - The wait before the next request. */
  constructor(retryAfterMs) {
    super('Voltalis limits the requests');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Any other HTTP error of the API. */
class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} [detail] - A short detail, free of any secret.
   */
  constructor(status, detail = '') {
    super(`Voltalis API error ${status}${detail ? ` (${detail})` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** The API cannot be reached (DNS, timeout, connection refused). */
class NetworkError extends Error {
  /** @param {string} message - What failed (never a URL with a secret). */
  constructor(message) {
    super(`Voltalis API unreachable: ${message}`);
    this.name = 'NetworkError';
  }
}

/**
 * @description The error code Voltalis gives ("backend.error.…"), if any.
 * @param {unknown} body - The parsed answer: an array of errors, or an object.
 * @returns {string} The code, 80 characters at most ('' when none).
 */
function errorCode(body) {
  const first = Array.isArray(body) ? body[0] : body;
  const code = first?.description ?? first?.error ?? '';
  return typeof code === 'string' ? code.slice(0, 80) : '';
}

/**
 * @description Create a Voltalis API client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - `fetch` (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {number} [options.minIntervalMs] - Spacing of two API requests.
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @param {string} [options.userAgent] - User-Agent header.
 * @returns {object} The client.
 * @example
 * const api = createVoltalisApi();
 * api.setCredentials('me@example.com', 'password');
 * const appliances = await api.getAppliances();
 */
function createVoltalisApi({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minIntervalMs = MIN_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS,
  userAgent = 'gladys-voltalis',
} = {}) {
  let login = '';
  let password = '';
  let token = null;
  // The default site of the account: `{ id, name, city, timezone }`.
  let site = null;
  let session = null;
  // The queue of API requests: one at a time, spaced.
  let queue = Promise.resolve();
  let nextSlot = 0;
  const sentAt = [];

  /** @description Forget the requests older than an hour. */
  function prune() {
    const limit = now() - HOUR_MS;
    while (sentAt.length && sentAt[0] < limit) sentAt.shift();
  }

  /**
   * @description One HTTP exchange.
   * @param {string} method - The HTTP method.
   * @param {string} path - The path.
   * @param {object} [payload] - The JSON body.
   * @param {boolean} [authenticated] - Send the token.
   * @returns {Promise<{status: number, body: unknown}>} The answer.
   */
  async function send(method, path, payload, authenticated = true) {
    sentAt.push(now());
    prune();
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
          ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? 'network');
      throw new NetworkError(reason);
    }
    const text = await response.text().catch(() => '');
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body };
  }

  /**
   * @description Run a task in the queue, a pause after the previous one.
   * @param {Function} task - `() => Promise`.
   * @returns {Promise<unknown>} Its result.
   */
  function enqueue(task) {
    const run = async () => {
      const wait = nextSlot - now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        nextSlot = now() + minIntervalMs;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  /** @description Log in and read the default site of the account. */
  async function openSession() {
    if (!login || !password) throw new CredentialsError('MISSING');
    const answer = await send('POST', LOGIN_PATH, { login, password }, false);
    if (answer.status === 429) throw new RateLimitError(RATE_LIMIT_WAIT_MS);
    if (answer.status === 401 || answer.status === 403) {
      const code = errorCode(answer.body);
      throw new CredentialsError(
        code.endsWith('badcredentials') ? 'BAD_CREDENTIALS' : 'REFUSED',
        answer.status,
      );
    }
    if (answer.status >= 400) throw new ApiError(answer.status, errorCode(answer.body));
    const value = answer.body?.token;
    if (typeof value !== 'string' || !value) {
      throw new ApiError(answer.status, 'no token in the answer');
    }
    token = value;
    const me = await send('GET', ME_PATH);
    if (me.status === 429) throw new RateLimitError(RATE_LIMIT_WAIT_MS);
    if (me.status >= 400) {
      token = null;
      throw new ApiError(me.status, errorCode(me.body));
    }
    const defaultSite = me.body?.defaultSite;
    if (defaultSite?.id === undefined || defaultSite?.id === null) {
      token = null;
      throw new ApiError(me.status, 'no default site in the account');
    }
    const text = (raw) => (typeof raw === 'string' ? raw.trim() : '');
    site = {
      id: String(defaultSite.id),
      name: text(defaultSite.name),
      city: text(defaultSite.city),
      timezone: text(defaultSite.timezone),
    };
  }

  /** @description A session (shared by concurrent callers). */
  async function ensureSession() {
    if (token && site) return;
    if (!session) {
      session = openSession().finally(() => {
        session = null;
      });
    }
    await session;
  }

  /**
   * @description Call a route of the site (in the queue).
   * @param {string} method - GET or PUT.
   * @param {string} path - The path after `/api/site/{site}`.
   * @param {object} [payload] - The JSON body.
   * @returns {Promise<unknown>} The parsed answer.
   */
  function call(method, path, payload) {
    return enqueue(async () => {
      for (let renewed = false; ; renewed = true) {
        await ensureSession();
        const answer = await send(
          method,
          `/api/site/${encodeURIComponent(site.id)}${path}`,
          payload,
        );
        if (answer.status === 429) throw new RateLimitError(RATE_LIMIT_WAIT_MS);
        if (answer.status === 401) {
          // An expired token: one new session, then give up.
          token = null;
          if (renewed) throw new CredentialsError('UNAUTHORIZED', answer.status);
          continue;
        }
        if (answer.status >= 400) throw new ApiError(answer.status, errorCode(answer.body));
        return answer.body;
      }
    });
  }

  const list = (body) => (Array.isArray(body) ? body : []);

  return {
    /**
     * @description Use these credentials from now on (drops the session).
     * @param {string} email - The e-mail of the MyVoltalis account.
     * @param {string} secret - Its password.
     */
    setCredentials(email, secret) {
      const changed = email !== login || secret !== password;
      login = email ?? '';
      password = secret ?? '';
      if (changed) {
        token = null;
        site = null;
      }
    },
    hasCredentials: () => Boolean(login && password),
    /** @returns {{id: string, name: string, city: string, timezone: string}|null} The site. */
    site: () => (site ? { ...site } : null),
    /** @returns {Promise<object[]>} The appliances. */
    getAppliances: async () => list(await call('GET', '/managed-appliance')),
    /** @returns {Promise<object[]>} The manual settings. */
    getManualSettings: async () => list(await call('GET', '/manualsetting')),
    /**
     * @description Change the manual setting of an appliance.
     * @param {number|string} id - The id of the manual setting.
     * @param {object} setting - `{ enabled, idAppliance, untilFurtherNotice,
     *   isOn, mode, endDate, temperatureTarget }`.
     * @returns {Promise<void>}
     */
    async putManualSetting(id, setting) {
      await call('PUT', `/manualsetting/${encodeURIComponent(id)}`, setting);
    },
    /** @returns {Promise<object[]>} The self-diagnosis of each appliance. */
    getDiagnostics: async () => list(await call('GET', '/autodiag')),
    /**
     * @param {number} [points] - How many 10-minute steps.
     * @returns {Promise<object>} `{ aggregationStepInSeconds, consumptions }`.
     */
    getRealtime: async (points = 1) =>
      (await call('GET', `/consumption/realtime?mode=TEN_MINUTES&numPoints=${Number(points)}`)) ??
      {},
    /**
     * @param {string} day - The day on site, `YYYY-MM-DD`.
     * @returns {Promise<object>} `{ dataPoints, perAppliance }`.
     */
    getDay: async (day) =>
      (await call('GET', `/consumption/day/${encodeURIComponent(day)}/full-data`)) ?? {},
    /** @returns {Promise<object[]>} The quick settings. */
    getQuickSettings: async () => list(await call('GET', '/quicksettings')),
    /** @returns {Promise<object[]>} The user's programs. */
    getPrograms: async () => list(await call('GET', '/programming/program')),
    /**
     * @param {number|string} id - The quick setting.
     * @param {boolean} enabled - On or off.
     * @returns {Promise<void>}
     */
    async setQuickSetting(id, enabled) {
      await call('PUT', `/quicksettings/${encodeURIComponent(id)}/enable`, { enabled });
    },
    /**
     * @param {number|string} id - The program.
     * @param {string} name - Its name (the API wants it back).
     * @param {boolean} enabled - On or off.
     * @returns {Promise<void>}
     */
    async setProgram(id, name, enabled) {
      await call('PUT', `/programming/program/${encodeURIComponent(id)}`, { name, enabled });
    },
    /** @returns {number} Requests sent during the last hour. */
    requestsLastHour() {
      prune();
      return sentAt.length;
    },
  };
}

export {
  API_URL,
  LOGIN_PATH,
  ME_PATH,
  MIN_INTERVAL_MS,
  RATE_LIMIT_WAIT_MS,
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  errorCode,
  createVoltalisApi,
};
