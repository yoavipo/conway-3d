import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const analyticsSource = readFileSync(
  new URL('../public/analytics-init.js', import.meta.url),
  'utf8',
);
const DAY_MS = 24 * 60 * 60 * 1000;

function initializeAnalytics(initialEntries = []) {
  const values = new Map(initialEntries);
  const window = {
    crypto: {
      randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    clearTimeout: () => {},
    setTimeout: () => 1,
  };

  vm.runInNewContext(analyticsSource, { window });
  return { values, window };
}

test('adds one persistent anonymous ID to every Umami payload', () => {
  const { values, window } = initializeAnalytics();
  const payload = window.conwayAnalyticsBeforeSend('event', { url: '/' });

  assert.equal(values.get('umami.distinctId'), 'anon-12345678-1234-1234-1234-123456789abc');
  assert.equal(payload.id, values.get('umami.distinctId'));
  assert.equal(payload.url, '/');
});

test('disables sends for 24 hours and can be enabled immediately', () => {
  const { values, window } = initializeAnalytics();
  const beforeDisable = Date.now();
  const disabledUntil = window.conwayAnalytics.disableFor24Hours().getTime();

  assert.ok(disabledUntil >= beforeDisable + DAY_MS);
  assert.ok(disabledUntil <= Date.now() + DAY_MS);
  assert.equal(values.get('umami.disabledUntil'), String(disabledUntil));
  assert.equal(window.conwayAnalytics.isDisabled(), true);
  assert.equal(window.conwayAnalyticsBeforeSend('event', { url: '/' }), false);

  window.conwayAnalytics.enable();

  assert.equal(window.conwayAnalytics.isDisabled(), false);
  assert.equal(window.conwayAnalyticsBeforeSend('event', { url: '/' }).url, '/');
});

test('migrates Umami permanent opt-out to the 24-hour timer', () => {
  const beforeInitialize = Date.now();
  const { values, window } = initializeAnalytics([['umami.disabled', '1']]);
  const disabledUntil = Number(values.get('umami.disabledUntil'));

  assert.equal(values.has('umami.disabled'), false);
  assert.equal(window.conwayAnalytics.isDisabled(), true);
  assert.ok(disabledUntil >= beforeInitialize + DAY_MS);
  assert.ok(disabledUntil <= Date.now() + DAY_MS);
});
