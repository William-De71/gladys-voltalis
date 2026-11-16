// The HTTP client against a fake fetch: session, renewal, errors, spacing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_URL,
  MIN_INTERVAL_MS,
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  errorCode,
} from '../src/voltalis-api.js';
import { APPLIANCES, apiWithFetch } from './helpers/fixtures.js';

const ME = { defaultSite: { id: 4242, name: null, city: 'Lyon', timezone: 'Europe/Paris' } };
const path = (url) => url.slice(API_URL.length);

/**
 * @description A handler serving a working account.
 * @param {object} [routes] - Path -> answer (or function) overriding the defaults.
 * @returns {Function} The handler.
 */
const account =
  (routes = {}) =>
  (url, init, n) => {
    const route = routes[path(url)];
    if (route) return typeof route === 'function' ? route(init, n) : route;
    if (path(url) === '/auth/login') return { body: { token: 'tok-1' } };
    if (path(url) === '/api/account/me') return { body: ME };
    if (path(url) === '/api/site/4242/managed-appliance') return { body: APPLIANCES };
    return { body: [] };
  };

test('logs in, reads the default site, then the appliances', async () => {
  const { api, fetch } = apiWithFetch(account());
  assert.equal(api.hasCredentials(), false);
  api.setCredentials('me@example.com', 'pass word ');
  const list = await api.getAppliances();
  assert.equal(list.length, 3);
  assert.deepEqual(
    fetch.requests.map((r) => [r.method, path(r.url)]),
    [
      ['POST', '/auth/login'],
      ['GET', '/api/account/me'],
      ['GET', '/api/site/4242/managed-appliance'],
    ],
  );
  assert.deepEqual(JSON.parse(fetch.requests[0].body), {
    login: 'me@example.com',
    password: 'pass word ',
  });
  assert.equal(fetch.requests[0].headers.Authorization, undefined);
  assert.equal(fetch.requests[2].headers.Authorization, 'Bearer tok-1');
  assert.deepEqual(api.site(), { id: '4242', name: '', city: 'Lyon', timezone: 'Europe/Paris' });
  // The session is kept.
  await api.getDiagnostics();
  assert.equal(fetch.requests.length, 4);
  assert.equal(api.requestsLastHour(), 4);
});

test('requests are spaced', async () => {
  const { api, clock } = apiWithFetch(account());
  api.setCredentials('me@example.com', 'x');
  await Promise.all([api.getAppliances(), api.getManualSettings(), api.getDiagnostics()]);
  assert.deepEqual(clock.slept, [MIN_INTERVAL_MS, MIN_INTERVAL_MS]);
});

test('every route goes to the site of the account', async () => {
  const { api, fetch } = apiWithFetch(account());
  api.setCredentials('me@example.com', 'x');
  await api.putManualSetting(9101, { enabled: true });
  await api.getRealtime(1);
  await api.getDay('2026-11-15');
  await api.getQuickSettings();
  await api.getPrograms();
  await api.setQuickSetting(2, true);
  await api.setProgram(7, 'Semaine', false);
  assert.deepEqual(
    fetch.requests.slice(2).map((r) => [r.method, path(r.url), r.body]),
    [
      ['PUT', '/api/site/4242/manualsetting/9101', '{"enabled":true}'],
      ['GET', '/api/site/4242/consumption/realtime?mode=TEN_MINUTES&numPoints=1', undefined],
      ['GET', '/api/site/4242/consumption/day/2026-11-15/full-data', undefined],
      ['GET', '/api/site/4242/quicksettings', undefined],
      ['GET', '/api/site/4242/programming/program', undefined],
      ['PUT', '/api/site/4242/quicksettings/2/enable', '{"enabled":true}'],
      ['PUT', '/api/site/4242/programming/program/7', '{"name":"Semaine","enabled":false}'],
    ],
  );
});

test('wrong credentials are told apart, and never retried in a loop', async () => {
  const refused = {
    status: 401,
    body: [{ description: 'backend.error.subscriber.badcredentials', status: 401 }],
  };
  const { api, fetch } = apiWithFetch(account({ '/auth/login': refused }));
  await assert.rejects(
    api.getAppliances(),
    (err) => err instanceof CredentialsError && err.reason === 'MISSING',
  );
  assert.equal(fetch.requests.length, 0);
  api.setCredentials('me@example.com', 'wrong');
  await assert.rejects(
    api.getAppliances(),
    (err) =>
      err instanceof CredentialsError && err.reason === 'BAD_CREDENTIALS' && err.status === 401,
  );
  assert.equal(fetch.requests.length, 1);
  assert.doesNotMatch(new CredentialsError('BAD_CREDENTIALS').message, /wrong/);
});

test('an expired token is renewed once', async () => {
  let token = 0;
  const { api, fetch } = apiWithFetch(
    account({
      '/auth/login': () => ({ body: { token: `tok-${(token += 1)}` } }),
      '/api/site/4242/managed-appliance': (init) =>
        init.headers.Authorization === 'Bearer tok-1' ? { status: 401 } : { body: APPLIANCES },
    }),
  );
  api.setCredentials('me@example.com', 'x');
  assert.equal((await api.getAppliances()).length, 3);
  assert.equal(fetch.requests.filter((r) => path(r.url) === '/auth/login').length, 2);
  // Still refused after a new session: the account, not the token.
  const stuck = apiWithFetch(account({ '/api/site/4242/managed-appliance': { status: 401 } }));
  stuck.api.setCredentials('me@example.com', 'x');
  await assert.rejects(
    stuck.api.getAppliances(),
    (err) => err instanceof CredentialsError && err.reason === 'UNAUTHORIZED',
  );
});

test('other failures: slow-down, server error, odd answers, network', async () => {
  const limited = apiWithFetch(account({ '/api/site/4242/managed-appliance': { status: 429 } }));
  limited.api.setCredentials('a@b.c', 'x');
  await assert.rejects(limited.api.getAppliances(), RateLimitError);

  const broken = apiWithFetch(
    account({
      '/api/site/4242/autodiag': { status: 500, body: [{ description: 'backend.error.x' }] },
    }),
  );
  broken.api.setCredentials('a@b.c', 'x');
  await assert.rejects(
    broken.api.getDiagnostics(),
    (err) => err instanceof ApiError && err.status === 500 && err.detail === 'backend.error.x',
  );

  const noToken = apiWithFetch(account({ '/auth/login': { body: {} } }));
  noToken.api.setCredentials('a@b.c', 'x');
  await assert.rejects(noToken.api.getAppliances(), ApiError);

  const noSite = apiWithFetch(account({ '/api/account/me': { body: {} } }));
  noSite.api.setCredentials('a@b.c', 'x');
  await assert.rejects(noSite.api.getAppliances(), /no default site/);

  const down = apiWithFetch(() => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  });
  down.api.setCredentials('a@b.c', 'x');
  await assert.rejects(
    down.api.getAppliances(),
    (err) => err instanceof NetworkError && /ENOTFOUND/.test(err.message),
  );

  // Not a list where a list is expected: an empty list, never a crash.
  const odd = apiWithFetch(
    account({ '/api/site/4242/managed-appliance': { body: { oops: true } } }),
  );
  odd.api.setCredentials('a@b.c', 'x');
  assert.deepEqual(await odd.api.getAppliances(), []);
});

test('new credentials drop the session', async () => {
  const { api, fetch } = apiWithFetch(account());
  api.setCredentials('a@b.c', 'x');
  await api.getAppliances();
  api.setCredentials('a@b.c', 'x');
  await api.getAppliances();
  assert.equal(fetch.requests.length, 4);
  api.setCredentials('a@b.c', 'y');
  assert.equal(api.site(), null);
  await api.getAppliances();
  assert.equal(fetch.requests.length, 7);
});

test('the error code of Voltalis is read from a list or an object', () => {
  assert.equal(errorCode([{ description: 'backend.error.a' }]), 'backend.error.a');
  assert.equal(errorCode({ error: 'nope' }), 'nope');
  assert.equal(errorCode(null), '');
  assert.equal(errorCode([{ description: 42 }]), '');
});
